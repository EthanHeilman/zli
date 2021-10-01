module bastionzero.com/bctl/v1/bctl

go 1.16

replace bastionzero.com/bctl/v1/bzerolib => ../bzerolib

require (
	bastionzero.com/bctl/v1/bzerolib v0.0.0
	github.com/google/uuid v1.1.2
	github.com/rs/zerolog v1.24.0
	k8s.io/api v0.21.3
	k8s.io/apimachinery v0.21.3
	k8s.io/client-go v0.21.3
)
