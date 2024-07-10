#!/bin/bash
sudo -u zulip /home/zulip/deployments/current/manage.py export_single_user $1
