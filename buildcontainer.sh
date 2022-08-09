#!/bin/bash -x

DOCKER_BUILDKIT=1 docker build -t gyeeta/nodewebserver:latest -t ghcr.io/gyeeta/nodewebserver:latest -f ./Dockerfile --build-arg NODEWEBSERVER_VERSION="v`./runwebserver.sh --version | grep Version | cut -d " " -f 6`" .

