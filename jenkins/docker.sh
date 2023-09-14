#!/bin/bash

# docker pull docker:latest

# sudo rm -rf output/*
current_dir=$(pwd)
drc_zulip_dir="/home/asher/workspace/github/drc_zulip"
container_name="zulip-builder"


if [ "$1" == "-b" ]; then
  cp Dockerfile ../ && cd ../
  docker build -t ${container_name} .
  rm Dockerfile && cd jenkins
elif [ "$1" == "-r" ]; then
  docker run -v $current_dir/output:/tmp/output ${container_name} 
elif [ "$1" == "-ri" ]; then
  container_id=$(docker run -d -v $current_dir/output:/tmp/output -v ${drc_zulip_dir}:/home/github/ ${container_name} sleep 3600)
#   container_id=$(docker run -d ${container_name} sleep 3600)
  docker exec -it $container_id /bin/bash
fi

