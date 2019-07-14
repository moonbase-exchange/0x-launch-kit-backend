#!/usr/bin/env bash

HOST=do.outerface
REMOTE_DIR=0x-launch-kit/
IMAGE_TAG=0x-launch-kit-backend
TMP_IMAGE_NAME=0x-launch-kit-backend.img
TMP_IMAGE_FILE=/tmp/${TMP_IMAGE_NAME}

docker build -t ${IMAGE_TAG} .
docker save ${IMAGE_TAG} -o ${TMP_IMAGE_FILE}
scp ${TMP_IMAGE_FILE} ${HOST}:${REMOTE_DIR}

ssh ${HOST} << EOF
    cd ${REMOTE_DIR}
    docker load -i ${TMP_IMAGE_NAME}
    docker-compose up -d
EOF

rm ${TMP_IMAGE_FILE}
