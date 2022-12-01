# Build and upload images to digital ocean registry

From this directory run the follow commands to build and upload a new version of the agent container docker files to digital ocean with tag `latest`. This should be repeated for both al2/ubuntu images. Note we use the `-beta` suffix in the image name because system tests will run against the latest staging version of the agent. This works because the image entrypoint uses `${SERVICE_URL}api/v2/autodiscovery-scripts/container/beta` when downloading the container autodiscovery script.

## AL2

```sh
docker buildx build --platform linux/amd64 -t agent-container-al2-beta -f al2.Dockerfile .
docker tag agent-container-al2-beta registry.digitalocean.com/bastionzero-do/agent-container-al2-beta:latest
docker push registry.digitalocean.com/bastionzero-do/agent-container-al2-beta:latest
```

## Ubuntu

```sh
docker buildx build --platform linux/amd64 -t agent-container-ubuntu-beta -f ubuntu.Dockerfile .
docker tag agent-container-ubuntu-beta registry.digitalocean.com/bastionzero-do/agent-container-ubuntu-beta:latest
docker push registry.digitalocean.com/bastionzero-do/agent-container-ubuntu-beta:latest
```