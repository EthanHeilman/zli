module bastionzero.com/bctl/v1/bzerolib

go 1.16

replace bastionzero.com/bctl/v1/bctl => ../bctl

require (
	github.com/cenkalti/backoff/v4 v4.1.1 // indirect
	github.com/coreos/go-oidc/v3 v3.0.0
	github.com/google/uuid v1.1.2
	github.com/gorilla/websocket v1.4.2
	github.com/rs/zerolog v1.24.0
	golang.org/x/crypto v0.0.0-20210711020723-a769d52b0f97
	k8s.io/client-go v0.21.3
)
