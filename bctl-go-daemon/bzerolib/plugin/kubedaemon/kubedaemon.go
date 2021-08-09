package kubedaemon

import (
	"encoding/json"
	"log"
	"math/rand"
	"net/http"
	"strings"

	plgn "bastionzero.com/bctl/v1/bzerolib/plugin"
	rest "bastionzero.com/bctl/v1/bzerolib/plugin/kubedaemon/actions/restapi"
	smsg "bastionzero.com/bctl/v1/bzerolib/stream/message"
)

const (
	securityToken = "++++"
)

type KubeDaemonAction string

const (
	Exec    KubeDaemonAction = "exec"
	Log     KubeDaemonAction = "log"
	RestApi KubeDaemonAction = "restapi"
)

type ActionWrapper struct {
	Action        string
	ActionPayload []byte
}

// Perhaps unnecessary but it is nice to make sure that each action is implementing a common function
type IKubeDaemonAction interface {
	InputMessageHandler(writer http.ResponseWriter, request *http.Request) (string, []byte, error)
}

type KubeDaemonPlugin struct {
	localhostToken string
	daemonPort     string
	certPath       string
	keyPath        string

	// Input and output streams
	streamInput chan smsg.StreamMessage
	ksOutput    chan ActionWrapper
}

func NewKubeDaemonPlugin(localhostToken string, daemonPort string, certPath string, keyPath string) (*KubeDaemonPlugin, error) {
	plugin := KubeDaemonPlugin{
		localhostToken: localhostToken,
		daemonPort:     daemonPort,
		certPath:       certPath,
		keyPath:        keyPath,
		streamInput:    make(chan smsg.StreamMessage, 100),
		ksOutput:       make(chan ActionWrapper, 100),
	}

	go func() {
		for {
			select {
			case streamMessage := <-plugin.streamInput:
				plugin.handleStreamMessage(streamMessage)
			}
		}
	}()

	go func() {
		// Define our http handlers
		http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			plugin.rootCallback(w, r)
		})

		log.Fatal(http.ListenAndServeTLS(":"+plugin.daemonPort, plugin.certPath, plugin.keyPath, nil))
	}()

	return &plugin, nil
}

func (k *KubeDaemonPlugin) handleStreamMessage(smessage smsg.StreamMessage) error {
	return nil
}

func (k *KubeDaemonPlugin) PushStreamInput(smessage smsg.StreamMessage) error {
	k.streamInput <- smessage // maybe we don't need a middleman channel? eh, probably even if it's just a buffer
	return nil
}

func (k *KubeDaemonPlugin) GetName() plgn.PluginName {
	return plgn.KubeDaemon
}

func (k *KubeDaemonPlugin) InputMessageHandler(action string, actionPayload []byte) (string, []byte, error) {
	// TODO: check that plugin name is "kube"
	log.Printf("Waiting for input...")
	select {
	case actionMessage := <-k.ksOutput:
		log.Printf("Received input from action: %v", actionMessage.Action)
		actionPayloadBytes, _ := json.Marshal(actionMessage.ActionPayload)
		return actionMessage.Action, actionPayloadBytes, nil
		// case <-time.After(time.Second * 10): // a better solution is to have a cancel channel
		// 	return "", "", fmt.Errorf("TIMEOUT!")
	}
}

func generateRequestId() int {
	for {
		i := rand.Intn(10000) // might want to make this a uuid
		return i
	}
}

func (k *KubeDaemonPlugin) rootCallback(w http.ResponseWriter, r *http.Request) {
	log.Printf("Handling %s - %s\n", r.URL.Path, r.Method)

	// Trim off localhost token
	// TODO: Fix this
	k.localhostToken = strings.Replace(k.localhostToken, securityToken, "", -1) // ?

	// First verify our token and extract any commands if we can
	tokenToValidate := r.Header.Get("Authorization")

	// Remove the `Bearer `
	tokenToValidate = strings.Replace(tokenToValidate, "Bearer ", "", -1)

	// Validate the token
	tokensSplit := strings.Split(tokenToValidate, securityToken)
	if tokensSplit[0] != k.localhostToken {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	// Check if we have a command to extract
	// TODO: Maybe we can push this work to the bastion
	// commandBeingRun := "N/A" // ?
	// logId := "N/A"
	// if len(tokensSplit) == 3 {
	// 	commandBeingRun = tokensSplit[1]
	// 	logId = tokensSplit[2]
	// } else {
	// 	commandBeingRun = "N/A"
	// 	logId = uuid.New().String()
	// }

	if strings.HasPrefix(r.URL.Path, "/api") {
		restAction, _ := rest.NewRestApiAction(generateRequestId())
		if action, payload, err := restAction.InputMessageHandler(w, r); err != nil {
			log.Printf("Error handling REST API call: %s", err.Error())
		} else {
			k.ksOutput <- ActionWrapper{
				Action:        action,
				ActionPayload: payload,
			}
		}
		return
	}

	// if strings.Contains(r.URL.Path, "exec") {
	// 	handleExec.HandleExec(w, r, wsClient)
	// } else if strings.Contains(r.URL.Path, "log") {
	// 	handleLogs.HandleLogs(w, r, commandBeingRun, logId, wsClient)
	// } else {
	// 	handleREST.HandleREST(w, r, commandBeingRun, logId, wsClient)
	// }
}
