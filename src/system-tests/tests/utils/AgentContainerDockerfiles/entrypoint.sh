#!bin/bash
echo "Installing bzero agent..."
curl "${SERVICE_URL}api/v2/autodiscovery-scripts/container/beta" -o start-agent.sh
chmod +x ./start-agent.sh
./start-agent.sh

python3 -m http.server