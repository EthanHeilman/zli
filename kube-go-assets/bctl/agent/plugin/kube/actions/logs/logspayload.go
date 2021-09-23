package logs

// For "kube/log/..." actions

type KubeLogsActionPayload struct {
	Endpoint  string            `json:"endpoint"`
	Headers   map[string]string `json:"headers"`
	Method    string            `json:"method"`
	Body      string            `json:"body"`
	RequestId string            `json:"requestId"`
	End       bool              `json:"end"`
	LogId     string            `json:"logId"`
}
