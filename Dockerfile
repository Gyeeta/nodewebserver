# syntax=docker/dockerfile:1

FROM ubuntu:18.04

LABEL org.opencontainers.image.description="This container provides the Gyeeta Web Server. Inputs needed include : \
1. Config file which specifies various params such as Shyama Servers, Auth Password file, etc. \
2. If Config file does not contain CFG_USERPASSFILE (User Password file for Basic Auth), users can specify either CFG_USERPASSFILE env passing the file \
   or specify the admin password in the CFG_ADMINPASSWORD env."

LABEL usage="docker run -td --rm --name gyeetawebserver --read-only -p 10039:10039  --env CFG_ENV=/tmp/cfg.env -v /HOST_PATH_TO_CFG/node_cfg.env:/tmp/cfg.env:ro --env CFG_USERPASSFILE=/tmp/userpass.json -v /HOST_PATH_TO_USERPASS/userpass.json:/tmp/userpass.json:ro <nodewebserver Image>"

# LABEL for github repository link
LABEL org.opencontainers.image.source="https://github.com/gyeeta/nodewebserver"

LABEL org.opencontainers.image.authors="https://github.com/gyeeta"

ARG NODEWEBSERVER_VERSION
ENV NODEWEBSERVER_VERSION=${NODEWEBSERVER_VERSION}

RUN apt-get update && \
	apt-get install -y --no-install-recommends \
	ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

ENV SSL_CERT_DIR=/etc/ssl/certs


# tini handling...
ARG TINI_VERSION=v0.19.0
ARG TINI_SHA256="93dcc18adc78c65a028a84799ecf8ad40c936fdfc5f2a57b1acda5a8117fa82c"
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
RUN chmod 0755 /tini
RUN if [ `sha256sum /tini | awk '{print $1}'` != "$TINI_SHA256" ]; then echo -e "ERROR : SHA256 of tini is different from expected value. Binary has changed. Please contact on Github.\n\n"; return 1; else return 0; fi

RUN addgroup --gid 1001 gyeeta && adduser --system --no-create-home --uid 1001 --gid 1001 gyeeta

COPY --chown=gyeeta:gyeeta . /nodewebserver/

USER gyeeta:gyeeta

ENTRYPOINT ["/tini", "-s", "-g", "--", "/nodewebserver/container_node.sh" ]

CMD ["start"]

