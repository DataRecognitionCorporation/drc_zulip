#!/bin/bash
echo "zulip STOPPING"
supervisorctl stop all
echo "nginx STOPPING"
systemctl stop nginx
echo "memcached STOPPING"
systemctl stop memcached
