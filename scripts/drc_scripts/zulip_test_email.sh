#!/bin/bash
if [ $# -eq 0 ]
  then
    echo "Usage: ./test_zulip_email.sh <email address>"
else
    su zulip -c '/home/zulip/deployments/current/manage.py send_test_email $1'
fi
