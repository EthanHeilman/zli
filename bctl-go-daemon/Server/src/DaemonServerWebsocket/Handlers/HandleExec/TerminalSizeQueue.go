package HandleExec

import (
	"bastionzero.com/bctl/v1/Server/src/DaemonServerWebsocket/DaemonServerWebsocketTypes"

	"k8s.io/client-go/tools/remotecommand"
)

// Our customer TerminalSizeQueue for resize messages
type TerminalSizeQueue struct {
	wsClient          *DaemonServerWebsocketTypes.DaemonServerWebsocket
	requestIdentifier int

	// Next returns the new terminal size after the terminal has been resized. It returns nil when
	// monitoring has been stopped.
	// Next() *TerminalSize
}

// TerminalSize represents the width and height of a terminal.
type TerminalSize struct {
	Width  uint16
	Height uint16
}

func NewTerminalSizeQueue(wsClient *DaemonServerWebsocketTypes.DaemonServerWebsocket, requestIdentifier int) *TerminalSizeQueue {
	return &TerminalSizeQueue{
		wsClient:          wsClient,
		requestIdentifier: requestIdentifier,
	}
}

func (t *TerminalSizeQueue) Next() *remotecommand.TerminalSize {
	// Wait for a terminal resize event to come through Bastion
	resizeTerminalToClusterFromBastionSignalRMessage := DaemonServerWebsocketTypes.ResizeTerminalToClusterFromBastionSignalRMessage{}
	resizeTerminalToClusterFromBastionSignalRMessage = <-t.wsClient.ExecResizeChannel
	resizeTerminalToClusterFromBastionMessage := DaemonServerWebsocketTypes.ResizeTerminalToClusterFromBastionMessage{}
	resizeTerminalToClusterFromBastionMessage = resizeTerminalToClusterFromBastionSignalRMessage.Arguments[0]

	// Verify that the request identifier matches, else re-emit
	if resizeTerminalToClusterFromBastionMessage.RequestIdentifier != t.requestIdentifier {
		t.wsClient.AlertOnExecResizeChan(resizeTerminalToClusterFromBastionSignalRMessage)
		return nil
	}

	// Then emit that resize event
	toEmit := &remotecommand.TerminalSize{
		Width:  resizeTerminalToClusterFromBastionMessage.Width,
		Height: resizeTerminalToClusterFromBastionMessage.Height,
	}
	return toEmit
}
