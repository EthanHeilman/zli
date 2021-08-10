package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"

	controlws "bastionzero.com/bctl/v1/Server/Websockets/controlWebsocket"
	controlwsmsg "bastionzero.com/bctl/v1/Server/Websockets/controlWebsocket/controlWebsocketTypes"
	dc "bastionzero.com/bctl/v1/bzerolib/channels/datachannel"
	wsmsg "bastionzero.com/bctl/v1/bzerolib/channels/message"
)

var (
	serviceUrl, orgId, clusterName string
	environmentId, activationToken string
)

const (
	hubEndpoint = "/api/v1/hub/kube-server"
	token       = "1234" // TODO: figure this out
)

func main() {
	parseFlags()

	// Connect to the control channel
	control := controlws.NewControlWebsocketClient(serviceUrl, activationToken, orgId, clusterName, environmentId, "1.0")

	// Subscribe to control channel
	go func() {
		for {
			select {
			case message := <-control.ProvisionWebsocketChan:
				// We have an incoming websocket request, attempt to make a new Daemon Websocket Client for the request
				startDatachannel(message)
			}
		}
	}()

	// Sleep forever
	// Ref: https://stackoverflow.com/questions/36419054/go-projects-main-goroutine-sleep-forever
	select {} // I don't think we need this?
}

func startDatachannel(message controlwsmsg.ProvisionNewWebsocketMessage) {
	// Create our headers and params, headers are empty
	// TODO: We need to drop this session id auth header req and move to a token based system
	headers := make(map[string]string)

	// Add our token to our params
	params := make(map[string]string)
	params["daemon_connection_id"] = message.ConnectionId
	params["token"] = token

	// Create our response channels
	// TODO: WE NEED TO SEND AN INTERRUPT CHANNEL TO DATACHANNEL FROM CONTROL
	// or pass a context that we can cancel from the control channel??
	dc.NewDataChannel(message.Role, "kube", serviceUrl, hubEndpoint, params, headers, targetSelectHandler)
}

func targetSelectHandler(agentMessage wsmsg.AgentMessage) (string, error) {
	var payload map[string]interface{}
	if err := json.Unmarshal(agentMessage.MessagePayload, &payload); err == nil {
		p := payload["keysplittingPayload"].(map[string]interface{})
		switch p["action"] {
		case "kube/restapi":
			return "ResponseToBastionFromCluster", nil
		}
	}
	return "", fmt.Errorf("")
}

func parseFlags() {
	// Our expected flags we need to start
	flag.StringVar(&serviceUrl, "serviceUrl", "", "Service URL to use")
	flag.StringVar(&orgId, "orgId", "", "OrgId to use")
	flag.StringVar(&clusterName, "clusterName", "", "Cluster name to use")
	flag.StringVar(&environmentId, "environmentId", "", "Optional environmentId to specify")
	flag.StringVar(&activationToken, "activationToken", "", "Activation Token to use to register the cluster")

	// Parse any flag
	flag.Parse()

	// The environment will overwrite any flags passed
	serviceUrl = os.Getenv("SERVICE_URL")
	activationToken = os.Getenv("ACTIVATION_TOKEN")
	orgId = os.Getenv("ORG_ID")
	clusterName = os.Getenv("CLUSTER_NAME")
	environmentId = os.Getenv("ENVIRONMENT")

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
	// case environmentId == "":
	// 	missing = append(missing, "environmentId")
	case activationToken == "":
		missing = append(missing, "activationToken")
	}
	if len(missing) > 0 {
		log.Printf("Missing flags! Missing: %v", missing)
		os.Exit(1)
	}
}