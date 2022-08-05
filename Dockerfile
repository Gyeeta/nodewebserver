# syntax=docker/dockerfile:1

FROM ubuntu:18.04

LABEL description="This container provides the Gyeeta Web Server"

LABEL usage="docker run -td --rm --name gyeetawebserver --read-only -p 10039:10039  --env CFG_ENV=/tmp/cfg.env -v /HOST_PATH_TO_CFG/node_cfg.env:/tmp/cfg.env:ro --env CFG_USERPASSFILE=/tmp/userpass.json -v /HOST_PATH_TO_USERPASS/userpass.json:/tmp/userpass.json:ro <nodewebserver Image>"

ARG NODEWEBSERVER_VERSION
ENV NODEWEBSERVER_VERSION=${NODEWEBSERVER_VERSION}

RUN apt-get update && rm -rf /var/lib/apt/lists/*

# tini handling...
ARG TINI_VERSION=v0.19.0
ARG TINI_SHA256="93dcc18adc78c65a028a84799ecf8ad40c936fdfc5f2a57b1acda5a8117fa82c"
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
RUN chmod 0755 /tini
RUN if [ `sha256sum /tini | awk '{print $1}'` != "$TINI_SHA256" ]; then echo -e "ERROR : SHA256 of tini is different from expected value. Binary has changed. Please contact on Github.\n\n"; return 1; else return 0; fi

COPY . /nodewebserver/

ENTRYPOINT ["/tini", "-s", "-g", "--", "/nodewebserver/container_node.sh" ]

CMD ["start"]

