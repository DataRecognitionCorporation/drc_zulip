#!/bin/bash
#PURPOSE: SCRIPT TO CLEAR THE ZULIP CACHE AND RECOMPILE TO MAKE SURE CHNAGES ARE USED
#AUTHOR: JWDUNN
#VERSION: 1.1
#LAST MODIFIED: 2021-10-20
echo
echo "# script name -------------->  ${0##*/} "
echo "# path to me --------------->  ${0}     "
echo "# arguments called with ---->  ${@}     "
echo

mydate=$(date '+%Y%m%d')

echo "Backing up zulip nginx config"
echo "as this process can reset it"
cp /etc/nginx/sites-available/zulip-enterprise /etc/nginx/sites-available/zulip-enterprise-$mydate
echo "Removing cache"
rm -rf /srv/zulip-venv-cache/*
echo "Recompiling"
/home/zulip/deployments/current/scripts/lib/upgrade-zulip-stage-2 /home/zulip/deployments/current/ --ignore-static-assets --audit-fts-indexes
echo "Restoring and restarting nginx"
cp /etc/nginx/sites-available/zulip-enterprise-$mydate /etc/nginx/sites-available/zulip-enterprise
systemctl restart nginx

