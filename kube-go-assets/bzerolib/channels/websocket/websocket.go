package websocket

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"net/http"
	"net/url"
	"sync"
	"time"

	"bastionzero.com/bctl/v1/bctl/agent/vault"
	wsmsg "bastionzero.com/bctl/v1/bzerolib/channels/message"
	lggr "bastionzero.com/bctl/v1/bzerolib/logger"

	"github.com/gorilla/websocket"
)

const (
	sleepIntervalInSeconds = 5
	connectionTimeout      = 30 // just a reminder for now

	challengeEndpoint = "/api/v1/kube/get-challenge"

	// SignalR
	signalRMessageTerminatorByte = 0x1E
	signalRTypeNumber            = 1 // Ref: https://github.com/aspnet/SignalR/blob/master/specs/HubProtocol.md#invocation-message-encoding
)

type IWebsocket interface {
	Connect() error
	Receive()
	Send(agentMessage wsmsg.AgentMessage) error
}

// This will be the client that we use to store our websocket connection
type Websocket struct {
	client  *websocket.Conn
	logger  *lggr.Logger
	IsReady bool

	// Ref: https://github.com/gorilla/websocket/issues/119#issuecomment-198710015
	socketLock sync.Mutex

	// These are the channels for recieving and sending messages and done
	InputChan  chan wsmsg.AgentMessage
	OutputChan chan wsmsg.AgentMessage
	DoneChan   chan string

	// Function for figuring out correct Target SignalR Hub
	targetSelectHandler func(msg wsmsg.AgentMessage) (string, error)

	// Flag to indicate if we should automatically try to reconnect
	autoReconnect bool

	getChallenge bool

	// Connection variables
	serviceUrl  string
	hubEndpoint string
	params      map[string]string
	headers     map[string]string

	subscribed bool

	ctx context.Context
}

// Constructor to create a new common websocket client object that can be shared by the daemon and server
func NewWebsocket(ctx context.Context,
	logger *lggr.Logger,
	serviceUrl string,
	hubEndpoint string,
	params map[string]string,
	headers map[string]string,
	targetSelectHandler func(msg wsmsg.AgentMessage) (string, error),
	autoReconnect bool,
	getChallenge bool) (*Websocket, error) {

	ret := Websocket{
		logger:              logger,
		InputChan:           make(chan wsmsg.AgentMessage, 200),
		OutputChan:          make(chan wsmsg.AgentMessage, 200),
		DoneChan:            make(chan string),
		targetSelectHandler: targetSelectHandler,
		getChallenge:        getChallenge,
		autoReconnect:       autoReconnect,
		serviceUrl:          serviceUrl,
		hubEndpoint:         hubEndpoint,
		params:              params,
		headers:             headers,
		ctx:                 ctx,
		subscribed:          false,
	}

	ret.Connect()

	// Listener for any incoming messages
	go func() {
		for {
			select {
			case <-ret.ctx.Done():
				return
			default:
				if err := ret.Receive(); err != nil {
					ret.logger.Error(err)
					ret.DoneChan <- fmt.Sprint(err)
					return
				}
			}
		}
	}()
	return &ret, nil
}

func (w *Websocket) subscribeToOutputChannel() {
	if !w.subscribed {
		// Update our object to let others know we have subscribed
		w.subscribed = true

		// Listener for any messages that need to be sent
		go func() {
			for {
				select {
				case <-w.ctx.Done():
					return
				case msg := <-w.OutputChan:
					w.Send(msg)
				}
			}
		}()
	}
}

// Returns error on websocket closed
func (w *Websocket) Receive() error {
	// Read incoming message(s)
	_, rawMessage, err := w.client.ReadMessage()

	if err != nil {
		w.IsReady = false

		// Check if it's a clean exit or we don't need to reconnect
		if websocket.IsCloseError(err, websocket.CloseNormalClosure) || !w.autoReconnect {
			return errors.New("websocket closed")
		} else { // else, reconnect
			msg := fmt.Errorf("error in websocket, will attempt to reconnect: %s", err)
			w.logger.Error(msg)
			w.Connect()
		}
	} else {
		// Always trim off the termination char if its there
		if rawMessage[len(rawMessage)-1] == signalRMessageTerminatorByte {
			rawMessage = rawMessage[0 : len(rawMessage)-1]
		}

		// Also check to see if we have multiple messages
		splitmessages := bytes.Split(rawMessage, []byte{signalRMessageTerminatorByte})

		for _, msg := range splitmessages {
			// unwrap signalR
			var wrappedMessage wsmsg.SignalRWrapper
			if err := json.Unmarshal(msg, &wrappedMessage); err != nil {
				msg := fmt.Errorf("error unmarshalling SignalR message from Bastion: %v", string(msg))
				w.logger.Error(msg)
				break
			}

			// push to channel
			if wrappedMessage.Type != signalRTypeNumber {
				msg := fmt.Sprintf("Ignoring SignalR message with type %v", wrappedMessage.Type)
				w.logger.Trace(msg)
			} else if len(wrappedMessage.Arguments) != 0 {
				if wrappedMessage.Target == "CloseConnection" {
					return errors.New("closing message received; websocket closed")
				} else if !w.subscribed && wrappedMessage.Target == "ReadyBastionToClient" {
					w.subscribeToOutputChannel()
					break
				} else if !w.subscribed {
					w.subscribeToOutputChannel()
				}
				w.InputChan <- wrappedMessage.Arguments[0]
			}
		}
	}
	return nil
}

// Function to write signalr message to websocket
func (w *Websocket) Send(agentMessage wsmsg.AgentMessage) error {
	// Lock our send function so we don't hit any concurrency issues
	// Ref: https://github.com/gorilla/websocket/issues/698
	w.socketLock.Lock()
	defer w.socketLock.Unlock()

	if !w.IsReady {
		return fmt.Errorf("Websocket not ready to send yet")
	}

	// Select target
	target, err := w.targetSelectHandler(agentMessage) // Agent and Daemon specify their own function to choose target
	if err != nil {
		rerr := fmt.Errorf("error in selecting SignalR Endpoint target name: %s", err)
		w.logger.Error(rerr)
		return rerr
	}

	msg := fmt.Sprintf("Sending %s message to the Bastion", target)
	w.logger.Info(msg)

	signalRMessage := wsmsg.SignalRWrapper{
		Target:    target,
		Type:      signalRTypeNumber,
		Arguments: []wsmsg.AgentMessage{agentMessage},
	}

	if msgBytes, err := json.Marshal(signalRMessage); err != nil {
		return fmt.Errorf("error marshalling outgoing SignalR Message: %v", signalRMessage)
	} else {
		// Write our message to websocket
		if err = w.client.WriteMessage(websocket.TextMessage, append(msgBytes, signalRMessageTerminatorByte)); err != nil {
			return err
		} else {
			return nil
		}
	}
}

func (w *Websocket) Connect() {
	for !w.IsReady {
		time.Sleep(time.Second * sleepIntervalInSeconds)
		if w.getChallenge {
			// First get the config from the vault
			config, _ := vault.LoadVault()

			// If we have a private key, we must solve the challenge
			solvedChallenge, err := newChallenge(w.params["org_id"], w.params["cluster_name"], w.serviceUrl, config.Data.PrivateKey)
			if err != nil {
				w.logger.Error(fmt.Errorf("error in getting challenge: %s", err))

				// Sleep in between
				w.logger.Info(fmt.Sprintf("Connecting failed! Sleeping for %d seconds before attempting again", sleepIntervalInSeconds))
				continue
			}

			// Add the solved challenge to the params
			w.params["solved_challenge"] = solvedChallenge

			// And sign our agent version
			signedAgentVersion, err := signString(config.Data.PrivateKey, w.params["agent_version"])
			if err != nil {
				w.logger.Error(fmt.Errorf("error in signing agent version: %s", err))

				// Sleep in between
				w.logger.Info(fmt.Sprintf("Connecting failed! Sleeping for %d seconds before attempting again", sleepIntervalInSeconds))
				continue
			}

			// Add the agent version to the params
			w.params["signed_agent_version"] = signedAgentVersion
		}

		// First negotiate in order to get a url to connect to
		httpClient := &http.Client{}
		negotiateUrl := "https://" + w.serviceUrl + w.hubEndpoint + "/negotiate"
		req, _ := http.NewRequest("POST", negotiateUrl, nil)

		// Add the expected headers
		for name, values := range w.headers {
			// Loop over all values for the name.
			req.Header.Set(name, values)
		}

		// Set any query params
		q := req.URL.Query()
		for key, values := range w.params {
			q.Add(key, values)
		}

		// Add our clientProtocol param
		q.Add("clientProtocol", "1.5")
		req.URL.RawQuery = q.Encode()

		// Make the request and wait for the body to close
		w.logger.Info(fmt.Sprintf("Starting negotiation with URL %s", negotiateUrl))
		res, _ := httpClient.Do(req)
		defer res.Body.Close()

		if res.StatusCode == 401 {
			// This means we have an auth issue, do not attempt to keep trying to reconnect
			rerr := fmt.Errorf("Auth error when trying to connect. Not attempting to reconnect. Shutting down")
			w.logger.Error(rerr)
			return
		} else if res.StatusCode != 200 {
			w.logger.Error(fmt.Errorf("Bad status code received on negotiation: %s", res.StatusCode))

			// Sleep in between
			w.logger.Info(fmt.Sprintf("Connecting failed! Sleeping for %d seconds before attempting again", sleepIntervalInSeconds))
			continue
		}

		// Extract out the connection token
		bodyBytes, _ := ioutil.ReadAll(res.Body)
		var m map[string]interface{}

		if err := json.Unmarshal(bodyBytes, &m); err != nil {
			// TODO: Add error handling around this, we should at least retry and then bubble up the error to the user
			w.logger.Error(fmt.Errorf("error un-marshalling negotiate response: %s", m))
		}

		connectionId := m["connectionId"]

		// Add the connection id to the list of params
		w.params["id"] = connectionId.(string)
		w.params["clientProtocol"] = "1.5"
		w.params["transport"] = "WebSockets"

		// Build our url u , add our params as well
		websocketUrl := url.URL{Scheme: "wss", Host: w.serviceUrl, Path: w.hubEndpoint}
		q = websocketUrl.Query()
		for key, value := range w.params {
			q.Set(key, value)
		}
		websocketUrl.RawQuery = q.Encode()

		msg := fmt.Sprintf("Negotiation finished, received %d. Connecting to %s", res.StatusCode, websocketUrl.String())
		w.logger.Info(msg)

		var err error
		w.client, _, err = websocket.DefaultDialer.Dial(
			websocketUrl.String(),
			http.Header{"Authorization": []string{w.headers["Authorization"]}})
		if err != nil {
			w.logger.Error(err)
		} else {
			// Define our protocol and version
			// Ref: https://stackoverflow.com/questions/65214787/signalr-websockets-and-go
			if err := w.client.WriteMessage(websocket.TextMessage, append([]byte(`{"protocol": "json","version": 1}`), signalRMessageTerminatorByte)); err != nil {
				w.logger.Info("Error when trying to agree on version for SignalR!")
				w.client.Close()
			} else {
				w.IsReady = true
				break
			}
		}
	}
}