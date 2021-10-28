package exec

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	kubeexec "bastionzero.com/bctl/v1/bctl/agent/plugin/kube/actions/exec"
	kubeutils "bastionzero.com/bctl/v1/bctl/daemon/plugin/kube/utils"
	lggr "bastionzero.com/bctl/v1/bzerolib/logger"
	plgn "bastionzero.com/bctl/v1/bzerolib/plugin"
	smsg "bastionzero.com/bctl/v1/bzerolib/stream/message"
)

type ExecAction struct {
	requestId         string
	logId             string
	commandBeingRun   string
	ksResponseChannel chan plgn.ActionWrapper
	RequestChannel    chan plgn.ActionWrapper
	streamChannel     chan smsg.StreamMessage
	logger            *lggr.Logger
	ctx               context.Context
}

func NewExecAction(ctx context.Context,
	logger *lggr.Logger,
	requestId string,
	logId string,
	ch chan plgn.ActionWrapper,
	streamResponseChannel chan smsg.StreamMessage,
	commandBeingRun string) (*ExecAction, error) {

	return &ExecAction{
		requestId:         requestId,
		logId:             logId,
		commandBeingRun:   commandBeingRun,
		RequestChannel:    ch,
		ksResponseChannel: make(chan plgn.ActionWrapper),
		streamChannel:     make(chan smsg.StreamMessage, 100),
		logger:            logger,
		ctx:               ctx,
	}, nil
}

func (r *ExecAction) InputMessageHandler(writer http.ResponseWriter, request *http.Request) error {
	subLogger := r.logger.GetComponentLogger("SPDY")
	spdy, err := NewSPDYService(subLogger, writer, request)
	if err != nil {
		r.logger.Error(err)
		return err
	}

	// Determine if this is tty
	isTty := kubeutils.IsQueryParamPresent(request, "tty")

	// Now since we made our local connection to kubectl, initiate a connection with Bastion
	r.RequestChannel <- wrapStartPayload(isTty, r.requestId, r.logId, request.URL.Query()["command"], request.URL.String())

	// Define our function to process each message
	seqNumber := 0
	processMessage := func(content []byte) bool {
		// Check for agent-initiated end e.g. user typing 'exit'
		if string(content) == kubeexec.EscChar {
			r.logger.Info("stream ended")
			spdy.conn.Close()
			return true
		}
		spdy.stdoutStream.Write(content)
		seqNumber++
		return false
	}

	// Set up a go function for stdout
	go func() {
		streamQueue := make(map[int]smsg.StreamMessage)
		for {
			select {
			case <-r.ctx.Done():
				return
			case streamMessage := <-r.streamChannel:
				contentBytes, _ := base64.StdEncoding.DecodeString(streamMessage.Content)

				// Check sequence number is correct, if not store it for later
				if streamMessage.SequenceNumber == seqNumber {

					if processMessage(contentBytes) {
						return
					}

					// Process any existing messages that were recieved out of order
					msg, ok := streamQueue[seqNumber]
					for ok {
						moreBytes, _ := base64.StdEncoding.DecodeString(msg.Content)

						if processMessage(moreBytes) {
							return
						}

						delete(streamQueue, seqNumber)
						msg, ok = streamQueue[seqNumber]
					}
				} else {
					streamQueue[streamMessage.SequenceNumber] = streamMessage
				}
			}
		}

	}()

	// Set up a go function for stdin
	go func() {
		// Keep the buffer big incase we are passing data to the pod
		buf := make([]byte, 1024*1024)
		for {
			select {
			case <-r.ctx.Done():
				return
			default:
				n, err := spdy.stdinStream.Read(buf)
				if err == io.EOF {
					return
				}

				// Send message to agent
				r.RequestChannel <- wrapStdinPayload(r.requestId, r.logId, buf[:n])
			}
		}

	}()

	if isTty {
		// Set up a go function for resize if we are running interactively
		go func() {
			for {
				select {
				case <-r.ctx.Done():
					return
				default:
					decoder := json.NewDecoder(spdy.resizeStream)

					size := TerminalSize{}
					if err := decoder.Decode(&size); err != nil {
						if err == io.EOF {
							return
						} else {
							r.logger.Error(fmt.Errorf("error decoding resize message: %s", err))
						}
					} else {
						// Emit this as a new resize event
						r.RequestChannel <- wrapResizePayload(r.requestId, r.logId, size.Width, size.Height)
					}
				}
			}
		}()
	}

	closeChan := spdy.conn.CloseChan()

	go func() {
		for {
			select {
			case <-closeChan:
				// Send message to agent to close the stream
				payload := kubeexec.KubeExecStopActionPayload{
					RequestId: r.requestId,
					LogId:     r.logId,
				}

				payloadBytes, _ := json.Marshal(payload)
				r.RequestChannel <- plgn.ActionWrapper{
					Action:        string(kubeexec.ExecStop),
					ActionPayload: payloadBytes,
				}
				return
			}
		}
	}()

	return nil
}

func (r *ExecAction) PushKSResponse(wrappedAction plgn.ActionWrapper) {
	r.ksResponseChannel <- wrappedAction
}

func (r *ExecAction) PushStreamResponse(stream smsg.StreamMessage) {
	r.streamChannel <- stream
}

func wrapStartPayload(isTty bool, requestId string, logId string, command []string, endpoint string) plgn.ActionWrapper {
	payload := kubeexec.KubeExecStartActionPayload{
		RequestId: requestId,
		LogId:     logId,
		IsTty:     isTty,
		Command:   command,
		Endpoint:  endpoint,
	}

	payloadBytes, _ := json.Marshal(payload)
	return plgn.ActionWrapper{
		Action:        string(kubeexec.ExecStart),
		ActionPayload: payloadBytes,
	}
}

func wrapResizePayload(requestId string, logId string, width uint16, height uint16) plgn.ActionWrapper {
	payload := kubeexec.KubeExecResizeActionPayload{
		RequestId: requestId,
		LogId:     logId,
		Width:     width,
		Height:    height,
	}

	payloadBytes, _ := json.Marshal(payload)
	return plgn.ActionWrapper{
		Action:        string(kubeexec.ExecResize),
		ActionPayload: payloadBytes,
	}
}

func wrapStdinPayload(requestId string, logId string, stdin []byte) plgn.ActionWrapper {
	payload := kubeexec.KubeStdinActionPayload{
		RequestId: requestId,
		LogId:     logId,
		Stdin:     stdin,
	}

	payloadBytes, _ := json.Marshal(payload)
	return plgn.ActionWrapper{
		Action:        string(kubeexec.ExecInput),
		ActionPayload: payloadBytes,
	}
}
