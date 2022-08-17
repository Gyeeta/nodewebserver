#!/bin/bash -x

NODEWEBSERVER_VERSION="`./runwebserver.sh --version | awk '{print $NF}'`"

DOCKER_BUILDKIT=1 docker build -t ghcr.io/gyeeta/nodewebserver:latest -t ghcr.io/gyeeta/nodewebserver:"$NODEWEBSERVER_VERSION" -f ./Dockerfile --build-arg NODEWEBSERVER_VERSION=v"${NODEWEBSERVER_VERSION}" .

