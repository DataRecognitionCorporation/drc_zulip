#!/bin/bash
echo "memcached STARTING"
systemctl start memcached
systemctl status memcached
echo "nginx STARTING"
systemctl start nginx
systemctl status nginx
echo "zulip STARTING"
supervisorctl start all
netstat -plntu
