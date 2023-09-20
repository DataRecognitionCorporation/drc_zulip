#!/bin/bash

# docker pull docker:latest

# sudo rm -rf output/*
current_dir=$(pwd)
drc_zulip_dir="/home/asher/workspace/github/drc_zulip"
docker_test_dir="${drc_zulip_dir}/jenkins/docker/test"
container_name="zulip-builder"


if [ "$1" == "-b" ]; then
  cp Dockerfile ${drc_zulip_dir} && cd ${drc_zulip_dir}
  docker build -t ${container_name} .
  rm Dockerfile && cd ${docker_test_dir}
elif [ "$1" == "-r" ]; then
  docker run -v $current_dir/output:/tmp/output ${container_name} 
elif [ "$1" == "-ri" ]; then
  container_id=$(docker run -d -v $current_dir/output:/tmp/output -v ${drc_zulip_dir}:/home/github/ ${container_name} sleep 3600)
#   container_id=$(docker run -d ${container_name} sleep 3600)
  docker exec -it $container_id /bin/bash
fi

