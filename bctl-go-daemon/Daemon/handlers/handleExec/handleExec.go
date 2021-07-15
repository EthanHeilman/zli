package handleExec

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"bastionzero.com/bctl-daemon/v1/websocketClient"
	"bastionzero.com/bctl-daemon/v1/websocketClient/websocketClientTypes"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/httpstream"
	"k8s.io/apimachinery/pkg/util/httpstream/spdy"
)

// Api params
const (
	// Default timeout for streams
	DefaultStreamCreationTimeout = 30 * time.Second

	// Enable stdin for remote command execution
	ExecStdinParam = "stdin"
	// Enable stdout for remote command execution
	ExecStdoutParam = "stdout"
	// Enable stderr for remote command execution
	ExecStderrParam = "stderr"
	// Enable TTY for remote command execution
	ExecTTYParam = "tty"
	// Command to run for remote command execution
	ExecCommandParam = "command"

	// Name of header that specifies stream type
	StreamType = "streamType"
	// Value for streamType header for stdin stream
	StreamTypeStdin = "stdin"
	// Value for streamType header for stdout stream
	StreamTypeStdout = "stdout"
	// Value for streamType header for stderr stream
	StreamTypeStderr = "stderr"
	// Value for streamType header for data stream
	StreamTypeData = "data"
	// Value for streamType header for error stream
	StreamTypeError = "error"
	// Value for streamType header for terminal resize stream
	StreamTypeResize = "resize"

	// Name of header that specifies the port being forwarded
	PortHeader = "port"
	// Name of header that specifies a request ID used to associate the error
	// and data streams for a single forwarded connection
	PortForwardRequestIDHeader = "requestID"
)

type streamAndReply struct {
	httpstream.Stream
	replySent <-chan struct{}
}

type StatusError struct {
	ErrStatus metav1.Status
}

// Types for exec ->
// TerminalSize represents the width and height of a terminal.
type TerminalSize struct {
	Width  uint16
	Height uint16
}

type resizeCallback func(TerminalSize)

// TerminalSizeQueue is capable of returning terminal resize events as they occur.
type TerminalSizeQueue interface {
	// Next returns the new terminal size after the terminal has been resized. It returns nil when
	// monitoring has been stopped.
	Next() *TerminalSize
}

type termQueue struct {
	ch       chan TerminalSize
	cancel   context.CancelFunc
	done     context.Context
	onResize resizeCallback
}

type remoteCommandProxy struct {
	conn         io.Closer
	stdinStream  io.ReadCloser
	stdoutStream io.WriteCloser
	stderrStream io.WriteCloser
	writeStatus  func(status *StatusError) error
	resizeStream io.ReadCloser
	tty          bool
	resizeQueue  *termQueue
}

type Options struct {
	Stdin           bool
	Stdout          bool
	Stderr          bool
	TTY             bool
	ExpectedStreams int
	Command         []string
}

// Handler for Regular Exec calls that can be proxied
func HandleExec(w http.ResponseWriter, r *http.Request, wsClient *websocketClient.WebsocketClient) {
	// Extract the options of the exec
	options := extractExecOptions(r)
	fmt.Printf("Starting Exec for command: %s\n", options.Command)

	// Initiate a handshake and upgrade the request
	supportedProtocols := []string{"v4.channel.k8s.io", "v3.channel.k8s.io", "v2.channel.k8s.io", "channel.k8s.io"}
	protocol, err := httpstream.Handshake(r, w, supportedProtocols)
	if err != nil {
		fmt.Println("FATAL ERROR!")
		return
	}
	fmt.Printf("Using protocol: %s\n", protocol)

	// Now make our stream channel
	streamCh := make(chan streamAndReply)
	upgrader := spdy.NewResponseUpgrader()
	conn := upgrader.UpgradeResponse(w, r, func(stream httpstream.Stream, replySent <-chan struct{}) error {
		streamCh <- streamAndReply{Stream: stream, replySent: replySent}
		return nil
	})
	if conn == nil {
		// The upgrader is responsible for notifying the client of any errors that
		// occurred during upgrading. All we can do is return here at this point
		// if we weren't successful in upgrading.
		fmt.Println("FATAL ERROR!")
		return
	}

	// Set our idle timeout
	conn.SetIdleTimeout(time.Minute)

	// Wait for our streams to come in
	expired := time.NewTimer(DefaultStreamCreationTimeout)
	defer expired.Stop()
	proxy, err := waitForStreams(r.Context(), streamCh, options.ExpectedStreams, expired.C)
	if err != nil {
		fmt.Println("FATAL ERROR!")
		return
	}

	// Now since we made our local connection to kubectl, initiate a connection with Bastion
	requestIdentifier := wsClient.GenerateUniqueIdentifier()
	startExecToClusterMessage := &websocketClientTypes.StartExecToBastionMessage{}
	startExecToClusterMessage.Command = options.Command
	startExecToClusterMessage.Endpoint = r.URL.Path
	startExecToClusterMessage.RequestIdentifier = requestIdentifier
	log.Println("Starting connection to cluster for exec")
	wsClient.SendStartExecToBastionMessage(*startExecToClusterMessage)

	go func() {
		for {
			// Wait for a new request to come in through our channel
			sendStdoutToDaemonSignalRMessage := websocketClientTypes.SendStdoutToDaemonSignalRMessage{}
			sendStdoutToDaemonSignalRMessage = <-wsClient.ExecStdoutChannel

			// Ensure that the RequestIdentifiers match up
			if sendStdoutToDaemonSignalRMessage.Arguments[0].RequestIdentifier != requestIdentifier {
				log.Printf("Unhandled request identifier")
				// continue
				// TODO: Fix this
			}
			// Display the content to the use
			proxy.stdoutStream.Write([]byte(sendStdoutToDaemonSignalRMessage.Arguments[0].Stdout))
		}
	}()

	select {}

}

func extractExecOptions(r *http.Request) Options {
	tty := r.FormValue(ExecTTYParam) == "true"
	stdin := r.FormValue(ExecStdinParam) == "true"
	stdout := r.FormValue(ExecStdoutParam) == "true"
	stderr := r.FormValue(ExecStderrParam) == "true"

	// count the streams client asked for, starting with 1
	expectedStreams := 1
	if stdin {
		expectedStreams++
	}
	if stdout {
		expectedStreams++
	}
	if stderr {
		expectedStreams++
	}
	if tty { // TODO: && handler.supportsTerminalResizing()
		expectedStreams++
	}

	fmt.Printf("Expected streams: %d\n", expectedStreams)

	return Options{
		Stdin:           stdin,
		Stdout:          stdout,
		Stderr:          stderr,
		TTY:             tty,
		ExpectedStreams: expectedStreams,
		Command:         r.URL.Query()["command"],
	}
}

func waitForStreams(connContext context.Context, streams <-chan streamAndReply, expectedStreams int, expired <-chan time.Time) (*remoteCommandProxy, error) {
	// Ref: https://github.com/gravitational/teleport/blob/7bff7c41bda0f36898e9063aaacd5539ce062489/lib/kube/proxy/remotecommand.go
	// Make our command object
	remoteProxy := &remoteCommandProxy{}
	receivedStreams := 0
	replyChan := make(chan struct{})

	stopCtx, cancel := context.WithCancel(connContext)
	defer cancel()

WaitForStreams:
	for {
		select {
		// Loop over all incoming strems until we see all expected steams
		case stream := <-streams:
			// Extract the stream type from the header
			streamType := stream.Headers().Get(StreamType)
			log.Println("Saw stream type: " + streamType)

			// Save the stream
			switch streamType {
			case StreamTypeError:
				remoteProxy.writeStatus = v4WriteStatusFunc(stream)
				// Send to a buffer to wait, we will wait on replyChan until we see the expected number of streams
				go waitStreamReply(stopCtx, stream.replySent, replyChan)
			case StreamTypeStdin:
				remoteProxy.stdinStream = stream
				go waitStreamReply(stopCtx, stream.replySent, replyChan)
			case StreamTypeStdout:
				remoteProxy.stdoutStream = stream
				go waitStreamReply(stopCtx, stream.replySent, replyChan)
			case StreamTypeStderr:
				remoteProxy.stderrStream = stream
				go waitStreamReply(stopCtx, stream.replySent, replyChan)
			case StreamTypeResize:
				remoteProxy.resizeStream = stream
				go waitStreamReply(stopCtx, stream.replySent, replyChan)
			default:
				fmt.Printf("Ignoring unexpected stream type: %q", streamType)
			}
		case <-replyChan:
			receivedStreams++
			if receivedStreams == expectedStreams {
				break WaitForStreams
			}
		case <-expired:
			return nil, errors.New("timed out waiting for client to create streams")
		case <-connContext.Done():
			return nil, errors.New("onnectoin has dropped, exiting")
		}
	}

	return remoteProxy, nil
}

// v4WriteStatusFunc returns a WriteStatusFunc that marshals a given api Status
// as json in the error channel.
func v4WriteStatusFunc(stream io.Writer) func(status *StatusError) error {
	return func(status *StatusError) error {
		bs, err := json.Marshal(status.ErrStatus)
		if err != nil {
			return err
		}
		_, err = stream.Write(bs)
		return err
	}
}

// waitStreamReply waits until either replySent or stop is closed. If replySent is closed, it sends
// an empty struct to the notify channel.
func waitStreamReply(ctx context.Context, replySent <-chan struct{}, notify chan<- struct{}) {
	select {
	case <-replySent:
		notify <- struct{}{}
	case <-ctx.Done():
	}
}
