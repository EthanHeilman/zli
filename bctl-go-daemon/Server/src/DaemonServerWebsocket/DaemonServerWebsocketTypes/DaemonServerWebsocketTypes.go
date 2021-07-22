package DaemonServerWebsocketTypes

import (
	"encoding/json"
	"log"
	"sync"

	"bastionzero.com/bctl/v1/CommonWebsocketClient"

	"github.com/gorilla/websocket"
)

type RequestToClusterFromBastionSignalRMessage struct {
	Target    string                               `json:"target"`
	Arguments []RequestToClusterFromBastionMessage `json:"arguments"`
	Type      int                                  `json:"type"`
}
type RequestToClusterFromBastionMessage struct {
	Endpoint          string            `json:"endpoint"`
	Headers           map[string]string `json:"headers"`
	Method            string            `json:"method"`
	Body              []byte            `json:"body"`
	RequestIdentifier int               `json:"requestIdentifier"`
	Role              string            `json"role"`
}

type ResponseToBastionFromClusterSignalRMessage struct {
	Target    string                                `json:"target"`
	Arguments []ResponseToBastionFromClusterMessage `json:"arguments"`
	Type      int                                   `json:"type"`
}
type ResponseToBastionFromClusterMessage struct {
	StatusCode        int               `json:"statusCode"`
	Content           []byte            `json:"content"`
	RequestIdentifier int               `json:"requestIdentifier"`
	Headers           map[string]string `json:"headers"`
}

type StartExecToClusterFromBastionSignalRMessage struct {
	Target    string                                 `json:"target"`
	Arguments []StartExecToClusterFromBastionMessage `json:"arguments"`
	Type      int                                    `json:"type"`
}
type StartExecToClusterFromBastionMessage struct {
	Command           []string `json:"command"`
	Endpoint          string   `json:"endpoint"`
	RequestIdentifier int      `json:"requestIdentifier"`
	Role              string   `json"role"`
}

type StdoutToBastionFromClusterSignalRMessage struct {
	Target    string                              `json:"target"`
	Arguments []StdoutToBastionFromClusterMessage `json:"arguments"`
	Type      int                                 `json:"type"`
}
type StdoutToBastionFromClusterMessage struct {
	Stdout            []byte `json:"stdout"`
	RequestIdentifier int    `json:"requestIdentifier"`
}

type StderrToBastionFromClusterSignalRMessage struct {
	Target    string                              `json:"target"`
	Arguments []StderrToBastionFromClusterMessage `json:"arguments"`
	Type      int                                 `json:"type"`
}
type StderrToBastionFromClusterMessage struct {
	Stderr            []byte `json:"stderr"`
	RequestIdentifier int    `json:"requestIdentifier"`
}

type SendStdoutToDaemonSignalRMessage struct {
	Target    string                      `json:"target"`
	Arguments []SendStdoutToDaemonMessage `json:"arguments"`
	Type      int                         `json:"type"`
}
type SendStdoutToDaemonMessage struct {
	Stdout            []byte `json:"stdout"`
	RequestIdentifier int    `json:"requestIdentifier"`
}

type StdinToClusterFromBastionSignalRMessage struct {
	Target    string                             `json:"target"`
	Arguments []StdinToClusterFromBastionMessage `json:"arguments"`
	Type      int                                `json:"type"`
}
type StdinToClusterFromBastionMessage struct {
	Stdin             []byte `json:"stdin"`
	RequestIdentifier int    `json:"requestIdentifier"`
}

type ResizeTerminalToClusterFromBastionSignalRMessage struct {
	Target    string                                      `json:"target"`
	Arguments []ResizeTerminalToClusterFromBastionMessage `json:"arguments"`
	Type      int                                         `json:"type"`
}
type ResizeTerminalToClusterFromBastionMessage struct {
	Width             uint16 `json:"width"`
	Height            uint16 `json:"height"`
	RequestIdentifier int    `json:"requestIdentifier"`
}

// Daemon Websock
type DaemonServerWebsocket struct {
	WebsocketClient *CommonWebsocketClient.WebsocketClient

	// These are all the    types of channels we have available
	// Basic REST Call related
	RequestForServerChan     chan RequestToClusterFromBastionMessage
	RequestForServerChanLock sync.Mutex

	// Exec Related
	RequestForStartExecChan     chan StartExecToClusterFromBastionSignalRMessage
	RequestForStartExecChanLock sync.Mutex
	ExecStdoutChan              chan SendStdoutToDaemonSignalRMessage
	ExecStdoutChanLock          sync.Mutex
	ExecStdinChannel            chan StdinToClusterFromBastionSignalRMessage
	ExecStdinChannelLock        sync.Mutex
	ExecResizeChannel           chan ResizeTerminalToClusterFromBastionSignalRMessage
	ExecResizeChannelLock       sync.Mutex

	SocketLock sync.Mutex // Ref: https://github.com/gorilla/websocket/issues/119#issuecomment-198710015
}

func (client *DaemonServerWebsocket) AlertOnRequestForServerChan(requestToClusterFromBastionMessage RequestToClusterFromBastionMessage) {
	// Lock our mutex and setup the unlock
	client.RequestForServerChanLock.Lock()
	defer client.RequestForServerChanLock.Unlock()
	client.RequestForServerChan <- requestToClusterFromBastionMessage
}

func (client *DaemonServerWebsocket) AlertOnRequestForStartExecChan(startExecToClusterFromBastionSignalRMessage StartExecToClusterFromBastionSignalRMessage) {
	// Lock our mutex and setup the unlock
	client.RequestForStartExecChanLock.Lock()
	defer client.RequestForStartExecChanLock.Unlock()
	client.RequestForStartExecChan <- startExecToClusterFromBastionSignalRMessage
}

func (client *DaemonServerWebsocket) AlertOnExecStdoutChan(sendStdoutToDaemonSignalRMessage SendStdoutToDaemonSignalRMessage) {
	// Lock our mutex and setup the unlock
	client.ExecStdoutChanLock.Lock()
	defer client.ExecStdoutChanLock.Unlock()
	client.ExecStdoutChan <- sendStdoutToDaemonSignalRMessage
}

func (client *DaemonServerWebsocket) AlertOnExecStdinChan(stdinToClusterFromBastionSignalRMessage StdinToClusterFromBastionSignalRMessage) {
	// Lock our mutex and setup the unlock
	client.ExecStdinChannelLock.Lock()
	defer client.ExecStdinChannelLock.Unlock()
	client.ExecStdinChannel <- stdinToClusterFromBastionSignalRMessage
}

func (client *DaemonServerWebsocket) AlertOnExecResizeChan(resizeTerminalToClusterFromBastionSingalRMessage ResizeTerminalToClusterFromBastionSignalRMessage) {
	// Lock our mutex and setup the unlock
	client.ExecResizeChannelLock.Lock()
	defer client.ExecResizeChannelLock.Unlock()
	client.ExecResizeChannel <- resizeTerminalToClusterFromBastionSingalRMessage
}

func (client *DaemonServerWebsocket) SendResponseToBastionFromClusterMessage(responseToBastionFromClusterMessage ResponseToBastionFromClusterMessage) error {
	// Lock our mutex and setup the unlock
	client.SocketLock.Lock()
	defer client.SocketLock.Unlock()

	log.Printf("Sending Response to To Bastion")
	// Create the object, add relevent information
	toSend := new(ResponseToBastionFromClusterSignalRMessage)
	toSend.Target = "ResponseToBastionFromCluster"
	toSend.Arguments = []ResponseToBastionFromClusterMessage{responseToBastionFromClusterMessage}

	// Add the type number from the class
	toSend.Type = 1 // Ref: https://github.com/aspnet/SignalR/blob/master/specs/HubProtocol.md#invocation-message-encoding

	// Marshal our message
	toSendMarshalled, err := json.Marshal(toSend)
	if err != nil {
		return err
	}

	// Write our message
	if err = client.WebsocketClient.Client.WriteMessage(websocket.TextMessage, append(toSendMarshalled, 0x1E)); err != nil {
		return err
	}
	// client.SignalRTypeNumber++
	return nil
}

func (client *DaemonServerWebsocket) SendStdoutToBastionFromClusterMessage(stdoutToBastionFromClusterMessage StdoutToBastionFromClusterMessage) error {
	// Lock our mutex and setup the unlock
	client.SocketLock.Lock()
	defer client.SocketLock.Unlock()

	log.Printf("Sending Stdout to Bastion")
	// Create the object, add relevent information
	toSend := new(StdoutToBastionFromClusterSignalRMessage)
	toSend.Target = "StdoutToBastionFromCluster"
	toSend.Arguments = []StdoutToBastionFromClusterMessage{stdoutToBastionFromClusterMessage}

	// Add the type number from the class
	toSend.Type = 1 // Ref: https://github.com/aspnet/SignalR/blob/master/specs/HubProtocol.md#invocation-message-encoding

	// Marshal our message
	toSendMarshalled, err := json.Marshal(toSend)
	if err != nil {
		return err
	}

	// Write our message
	if err = client.WebsocketClient.Client.WriteMessage(websocket.TextMessage, append(toSendMarshalled, 0x1E)); err != nil {
		log.Printf("Something went wrong :(")
		return err
	}
	// client.SignalRTypeNumber++
	return nil
}

func (client *DaemonServerWebsocket) SendStderrToBastionFromClusterMessage(stderrToBastionFromClusterMessage StderrToBastionFromClusterMessage) error {
	// Lock our mutex and setup the unlock
	client.SocketLock.Lock()
	defer client.SocketLock.Unlock()

	log.Printf("Sending Stderr to Bastion")
	// Create the object, add relevent information
	toSend := new(StderrToBastionFromClusterSignalRMessage)
	toSend.Target = "StderrToBastionFromCluster"
	toSend.Arguments = []StderrToBastionFromClusterMessage{stderrToBastionFromClusterMessage}

	// Add the type number from the class
	toSend.Type = 1 // Ref: https://github.com/aspnet/SignalR/blob/master/specs/HubProtocol.md#invocation-message-encoding

	// Marshal our message
	toSendMarshalled, err := json.Marshal(toSend)
	if err != nil {
		return err
	}

	// Write our message
	if err = client.WebsocketClient.Client.WriteMessage(websocket.TextMessage, append(toSendMarshalled, 0x1E)); err != nil {
		log.Printf("Something went wrong :(")
		return err
	}
	// client.SignalRTypeNumber++
	return nil
}
