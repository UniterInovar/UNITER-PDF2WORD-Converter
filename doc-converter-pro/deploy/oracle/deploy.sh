#!/usr/bin/env bash
set -euo pipefail

# Simple deploy script for Oracle VM (Ubuntu).
# Usage:
# 1) Provision an Oracle Always Free VM (Ubuntu 22.04) and open ports 22,80,443.
# 2) SSH in and run: sudo CR_PAT=ghp_xxx GHCR_OWNER=your-gh-user GHCR_USERNAME=your-gh-user bash deploy.sh

GHCR_OWNER=${GHCR_OWNER:-}
GHCR_USERNAME=${GHCR_USERNAME:-}
CR_PAT=${CR_PAT:-}

if [ -z "$GHCR_OWNER" ] || [ -z "$GHCR_USERNAME" ] || [ -z "$CR_PAT" ]; then
  echo "Missing required environment variables. Example:"
  echo "  sudo CR_PAT=ghp_xxx GHCR_OWNER=UniterInovar GHCR_USERNAME=UniterInovar bash deploy.sh"
  exit 1
fi

IMAGE="ghcr.io/${GHCR_OWNER}/doc-converter-pro:latest"
CONTAINER_NAME=doc-converter-pro
DATA_DIR=/opt/doc-converter-pro

echo "Updating apt and installing Docker..."
apt-get update -y
apt-get install -y ca-certificates curl gnupg lsb-release git
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io
fi

mkdir -p ${DATA_DIR}/tmp

echo "Logging into GHCR..."
echo "$CR_PAT" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin

echo "Pulling image $IMAGE"
docker pull "$IMAGE"

if [ $(docker ps -aq -f name=$CONTAINER_NAME | wc -l) -gt 0 ]; then
  echo "Stopping and removing existing container..."
  docker rm -f $CONTAINER_NAME || true
fi

echo "Starting container..."
docker run -d \
  --name $CONTAINER_NAME \
  --restart unless-stopped \
  -p 80:3000 \
  -v ${DATA_DIR}/tmp:/app/tmp \
  -e DOC_CONVERTER_MAX_FILE_BYTES=10737418240 \
  -e DOC_CONVERTER_PROCESS_TIMEOUT_MS=300000 \
  "$IMAGE"

echo "Deployed. The app should be reachable at http://<VM_PUBLIC_IP>/"
