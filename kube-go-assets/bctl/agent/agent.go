package main

import (
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"net/http"
	"os"

	ed "crypto/ed25519"

	cc "bastionzero.com/bctl/v1/bctl/agent/controlchannel"
	dc "bastionzero.com/bctl/v1/bctl/agent/datachannel"
	"bastionzero.com/bctl/v1/bctl/agent/vault"
	"bastionzero.com/bctl/v1/bzerolib/bzhttp"
	wsmsg "bastionzero.com/bctl/v1/bzerolib/channels/message"
	lggr "bastionzero.com/bctl/v1/bzerolib/logger"
	smsg "bastionzero.com/bctl/v1/bzerolib/stream/message"
)

var (
	serviceUrl, orgId, clusterName   string
	environmentId, activationToken   string
	idpProvider, namespace, idpOrgId string
	clusterId                        string
)

const (
	hubEndpoint      = "/api/v1/hub/kube-server"
	registerEndpoint = "/api/v1/kube/register-agent"

	// Disable auto-reconnect
	autoReconnect = false
)

func main() {
	// Get agent version
	agentVersion := getAgentVersion()

	// setup our loggers
	logger, err := lggr.NewLogger(lggr.Debug, "")
	if err != nil {
		return
	}
	logger.AddAgentVersion(agentVersion)

	ccLogger := logger.GetControlchannelLogger()
	dcLogger := logger.GetDatachannelLogger()

	if err := parseFlags(); err != nil {
		logger.Error(err)
		os.Exit(1)
	}

	// Populate keys if they haven't been generated already
	err = newAgent(logger, serviceUrl, activationToken, agentVersion, orgId, environmentId, clusterName, clusterId, idpProvider, idpOrgId, namespace)
	if err != nil {
		logger.Error(err)
		return
	}

	// Connect to the control channel
	control, err := cc.NewControlChannel(ccLogger, serviceUrl, activationToken, orgId, clusterName, clusterId, environmentId, agentVersion, controlchannelTargetSelectHandler)
	if err != nil {
		select {} // TODO: Should we be trying again here?
	}

	// Subscribe to control channel
	go func() {
		for {
			select {
			case message := <-control.NewDatachannelChan:
				// We have an incoming websocket request, attempt to make a new Daemon Websocket Client for the request
				startDatachannel(dcLogger, message)
			}
		}
	}()

	// Sleep forever because otherwise kube will endlessly try restarting
	// Ref: https://stackoverflow.com/questions/36419054/go-projects-main-goroutine-sleep-forever
	select {}
}

func startDatachannel(logger *lggr.Logger, message cc.NewDatachannelMessage) {
	// Create our headers and params, headers are empty
	// TODO: We need to drop this session id auth header req and move to a token based system
	headers := make(map[string]string)

	// Add our token to our params
	params := make(map[string]string)
	params["daemon_connection_id"] = message.ConnectionId
	params["token"] = message.Token

	// Create our response channels
	// TODO: WE NEED TO SEND AN INTERRUPT CHANNEL TO DATACHANNEL FROM CONTROL
	// or pass a context that we can cancel from the control channel??
	dc.NewDataChannel(logger, message.TargetUser, message.TargetGroups, serviceUrl, hubEndpoint, params, headers, datachannelTargetSelectHandler, autoReconnect)
}

func controlchannelTargetSelectHandler(agentMessage wsmsg.AgentMessage) (string, error) {
	switch wsmsg.MessageType(agentMessage.MessageType) {
	case wsmsg.HealthCheck:
		return "AliveCheckClusterToBastion", nil
	default:
		return "", fmt.Errorf("unsupported message type")
	}
}

func datachannelTargetSelectHandler(agentMessage wsmsg.AgentMessage) (string, error) {
	switch wsmsg.MessageType(agentMessage.MessageType) {
	case wsmsg.Keysplitting:
		var keysplittingPayload map[string]interface{}
		if err := json.Unmarshal(agentMessage.MessagePayload, &keysplittingPayload); err == nil {
			if keysplittingPayloadVal, ok := keysplittingPayload["keysplittingPayload"].(map[string]interface{}); ok {
				switch keysplittingPayloadVal["action"] {
				case "kube/restapi/response", "kube/restapi/request", "kube/exec/start", "kube/exec/stop", "kube/exec/input", "kube/exec/resize", "kube/stream/start", "kube/stream/stop", "kube/portforward/start", "kube/portforward/stop", "kube/portforward/request/stop", "kube/portforward/datain", "kube/portforward/errorin":
					return "ResponseClusterToBastionV1", nil
				}
			}
		}
	case wsmsg.Stream:
		var messagePayload smsg.StreamMessage
		if err := json.Unmarshal(agentMessage.MessagePayload, &messagePayload); err == nil {
			switch messagePayload.Type {
			case "kube/stream/stdout", "kube/exec/stdout", "kube/exec/stderr", "kube/portforward/data", "kube/portforward/error", "kube/portforward/ready":
				return "ResponseClusterToBastionV1", nil
			}
		}
	case wsmsg.Error:
		return "ResponseClusterToBastionV1", nil
	}

	return "", fmt.Errorf("unable to determine SignalR endpoint for message type: %s", agentMessage.MessageType)
}

func parseFlags() error {
	// Our expected flags we need to start
	flag.StringVar(&serviceUrl, "serviceUrl", "", "Service URL to use")
	flag.StringVar(&orgId, "orgId", "", "OrgId to use")
	flag.StringVar(&clusterName, "clusterName", "", "Cluster name to use")
	flag.StringVar(&clusterId, "clusterId", "", "Cluster Id to use")
	flag.StringVar(&environmentId, "environmentId", "", "Optional environmentId to specify")
	flag.StringVar(&activationToken, "activationToken", "", "Activation Token to use to register the cluster")

	// Parse any flag
	flag.Parse()

	// The environment will overwrite any flags passed
	serviceUrl = os.Getenv("SERVICE_URL")
	activationToken = os.Getenv("ACTIVATION_TOKEN")
	orgId = os.Getenv("ORG_ID")
	clusterName = os.Getenv("CLUSTER_NAME")
	clusterId = os.Getenv("CLUSTER_ID")
	environmentId = os.Getenv("ENVIRONMENT")
	idpProvider = os.Getenv("IDP_PROVIDER")
	idpOrgId = os.Getenv("IDP_ORG_ID")
	namespace = os.Getenv("NAMESPACE")

	// Ensure we have all needed vars
	missing := []string{}
	switch {
	case serviceUrl == "":
		missing = append(missing, "serviceUrl")
		fallthrough
	case orgId == "":
		missing = append(missing, "orgId")
		fallthrough
	case clusterName == "":
		missing = append(missing, "clusterName")
		fallthrough
	case activationToken == "":
		missing = append(missing, "activationToken")
	}
	if len(missing) > 0 {
		return fmt.Errorf("missing flags: %v", missing)
	} else {
		return nil
	}
}

func getAgentVersion() string {
	if os.Getenv("DEV") == "true" {
		return "1.0"
	} else {
		return "$AGENT_VERSION"
	}
}

func newAgent(logger *lggr.Logger, serviceUrl string, activationToken string, agentVersion string, orgId string, environmentId string, clusterName string, clusterId string, idpProvider string, idpOrgId string, namespace string) error {
	config, _ := vault.LoadVault()

	// Check if vault is empty, if so generate a private, public key pair
	if config.IsEmpty() {
		logger.Info("Creating new agent secret")

		if publicKey, privateKey, err := ed.GenerateKey(nil); err != nil {
			return fmt.Errorf("error generating key pair: %v", err.Error())
		} else {
			pubkeyString := base64.StdEncoding.EncodeToString([]byte(publicKey))
			privkeyString := base64.StdEncoding.EncodeToString([]byte(privateKey))
			config.Data = vault.SecretData{
				PublicKey:     pubkeyString,
				PrivateKey:    privkeyString,
				OrgId:         orgId,
				ServiceUrl:    serviceUrl,
				ClusterName:   clusterName,
				EnvironmentId: environmentId,
				Namespace:     namespace,
				IdpProvider:   idpProvider,
				IdpOrgId:      idpOrgId,
			}

			// Register with Bastion
			logger.Info("Registering agent with Bastion")
			register := cc.RegisterAgentMessage{
				PublicKey:      pubkeyString,
				ActivationCode: activationToken,
				AgentVersion:   agentVersion,
				OrgId:          orgId,
				EnvironmentId:  environmentId,
				ClusterName:    clusterName,
				ClusterId:      clusterId,
			}

			registerJson, err := json.Marshal(register)
			if err != nil {
				msg := fmt.Errorf("error marshalling registration data: %s", err)
				return msg
			}

			// Make our POST request
			response, err := bzhttp.PostRegister("https://"+serviceUrl+registerEndpoint, "application/json", registerJson, logger)
			if err != nil || response.StatusCode != http.StatusOK {
				rerr := fmt.Errorf("error making post request to register agent. Error: %s. Response: %v", err, response)
				return rerr
			}

			// If the registration went ok, save the config
			if err := config.Save(); err != nil {
				return fmt.Errorf("error saving vault: %v", err.Error())
			}
		}
	} else {
		// If the vault isn't empty, don't do anything
		logger.Info("Found Previous config data")
	}
	return nil
}
