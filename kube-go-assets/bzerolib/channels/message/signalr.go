/*
This package defines the messages needed to unwrap and rewrap SignalR messages.
We've abstracted this wrapper so that we can move away from SignalR in the future,
and not have to reinvent our message structure.
*/
package message

type SignalRNegotiateResponse struct {
	NegotiateVersion int
	ConnectionId     string
}

// This is our SignalR wrapper, every message that comes in thru
// the data channel will be sent using SignalR, so we have to be
// able to unwrap and re-wrap it.  The AgentMessage is our generic
// message for everything we care about.
type SignalRWrapper struct {
	Target    string         `json:"target"` // hub name
	Type      int            `json:"type"`
	Arguments []AgentMessage `json:"arguments"`
}

// This is our close message struct
type CloseMessage struct {
	Message string `json:"message"`
}

// Message definitions for challenge request/response
type GetChallengeMessage struct {
	OrgId       string `json:"orgId"`
	ClusterName string `json:"clusterName"`
}

type GetChallengeResponse struct {
	Challenge string `json:"challenge"`
}