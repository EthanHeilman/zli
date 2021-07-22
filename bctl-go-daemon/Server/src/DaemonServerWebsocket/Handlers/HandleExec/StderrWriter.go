package HandleExec

import (
	"bastionzero.com/bctl/v1/Server/src/DaemonServerWebsocket/DaemonServerWebsocketTypes"
)

// Our customer stderr writer so we can pass it into StreamOptions
type StderrWriter struct {
	wsClient          *DaemonServerWebsocketTypes.DaemonServerWebsocket
	RequestIdentifier int
}

// Constructor
func NewStderrWriter(wsClient *DaemonServerWebsocketTypes.DaemonServerWebsocket, requestIdentifier int) *StderrWriter {
	return &StderrWriter{
		wsClient:          wsClient,
		RequestIdentifier: requestIdentifier,
	}
}

// Our custom write function, this will send the data over the websocket
func (w *StderrWriter) Write(p []byte) (int, error) {
	// Send this data over our websocket
	stderrToBastionFromClusterMessage := &DaemonServerWebsocketTypes.StderrToBastionFromClusterMessage{}
	stderrToBastionFromClusterMessage.RequestIdentifier = w.RequestIdentifier
	stderrToBastionFromClusterMessage.Stderr = p
	w.wsClient.SendStderrToBastionFromClusterMessage(*stderrToBastionFromClusterMessage)

	// Calculate what needs to be returned
	return len(p), nil
}

// Close the writer by closing the channel
func (w *StderrWriter) Close() error {
	return nil
}
