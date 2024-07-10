#!/bin/bash
/usr/local/bin/zulip_stop_hard.sh
echo "Sleeping for 10"
sleep 10
/usr/local/bin/zulip_start_hard.sh
