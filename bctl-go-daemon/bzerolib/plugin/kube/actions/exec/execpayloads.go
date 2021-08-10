package exec

// Exec payload for the "kube/exec/start" action
type KubeExecStartActionPayload struct {
	RequestId int      `json:"requestId"`
	Command   []string `json:"command"` // what does this look like? Does it contain flags?
	Endpoint  string   `json:"endpoint"`
	Role      string   `json:"role"`
}

// payload for "kube/exec/input"
type KubeExecInputActionPayload struct {
	RequestId  int    `json:"requestId"`
	StreamType []byte `json:"streamType"`
}

// payload for "kube/exec/resize"
type KubeExecResizeActionPayload struct {
	RequestId int    `json:"requestId"`
	Width     uint16 `json:"width"`
	Height    uint16 `json:"height"`
}