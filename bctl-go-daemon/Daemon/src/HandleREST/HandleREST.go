package HandleREST

import (
	"io/ioutil"
	"log"
	"net/http"

	"bastionzero.com/bctl/v1/Daemon/src/DaemonWebsocket"
)

// Handler for Regular Rest calls that can be proxied
func HandleREST(w http.ResponseWriter, r *http.Request, commandBeingRun string, logId string, wsClient *DaemonWebsocket.DaemonWebsocket) {
	// First extract all the info out of the request
	headers := make(map[string]string)
	for name, values := range r.Header {
		// Loop over all values for the name.
		for _, value := range values {
			headers[name] = value
		}
	}

	// Extract the endpoint along with query params
	endpointWithQuery := r.URL.String()

	// Extract the method
	method := r.Method

	// Now extract the body
	bodyInBytes, err := ioutil.ReadAll(r.Body)
	if err != nil {
		log.Printf("Error reading body: %v", err)
		return
	}

	// requestIdentifier
	requestIdentifier := wsClient.GenerateUniqueIdentifier()

	// Now put our request together and make the request
	dataFromClientMessage := DaemonWebsocket.DataFromClientMessage{}
	dataFromClientMessage.LogId = logId
	dataFromClientMessage.KubeCommand = commandBeingRun
	dataFromClientMessage.Endpoint = endpointWithQuery
	dataFromClientMessage.Headers = headers
	dataFromClientMessage.Method = method
	dataFromClientMessage.Body = string(bodyInBytes)
	dataFromClientMessage.RequestIdentifier = requestIdentifier
	wsClient.SendDataFromClientMessage(dataFromClientMessage)

	// Wait for the response
	dataToClientMessageResponse := DaemonWebsocket.DataToClientMessage{}
	dataToClientMessageResponse = <-wsClient.DataToClientChan

	// Ensure that the identifer is correct
	if dataToClientMessageResponse.RequestIdentifier != requestIdentifier {
		log.Printf("SOMETHING WENT WRONG!")
		log.Println(dataToClientMessageResponse)
		log.Println(requestIdentifier)
		// TODO: I think we need to rebroadcast this message in this case?
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	// Now let the kubectl client know the response
	// First do headers
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(dataToClientMessageResponse.Content))
	if dataToClientMessageResponse.StatusCode != 200 {
		w.WriteHeader(http.StatusInternalServerError)
	}
}