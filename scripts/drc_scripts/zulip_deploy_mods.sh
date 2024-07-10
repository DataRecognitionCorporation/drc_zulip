!/bin/bash
#PURPOSE: SCRIPT TO PUT DRC CUSTOMIZATIONS IN PLACE
#AUTHOR: JWDUNN
#VERSION: 1.1
#LAST MODIFIED: 2021-10-20
echo
echo "# script name -------------->  ${0##*/} "
echo "# path to me --------------->  ${0}     "
echo "# arguments called with ---->  ${@}     "
echo

mydate=$(date '+%Y%m%d')

echo "Deploying left_sidebar.html"
cp /home/zulip/deployments/current/templates/zerver/app/left_sidebar.html /home/zulip/deployments/current/templates/zerver/app/left_sidebar.html-$mydate
cp /root/mods/left_sidebar.html /home/zulip/deployments/current/templates/zerver/app/
chown zulip:zulip /home/zulip/deployments/current/templates/zerver/app/left_sidebar.html
chmod 644 /home/zulip/deployments/current/templates/zerver/app/left_sidebar.html

echo "Deploying right_sidebar.html"
cp /home/zulip/deployments/current/templates/zerver/app/right_sidebar.html /home/zulip/deployments/current/templates/zerver/app/right_sidebar.html-$mydate
cp /root/mods/right_sidebar.html /home/zulip/deployments/current/templates/zerver/app/
chown zulip:zulip /home/zulip/deployments/current/templates/zerver/app/right_sidebar.html
chmod 644 /home/zulip/deployments/current/templates/zerver/app/right_sidebar.html

echo "Deploying navbar.html"
cp /home/zulip/deployments/current/templates/zerver/app/navbar.html /home/zulip/deployments/current/templates/zerver/app/navbar.html-$mydate
cp /root/mods/navbar.html /home/zulip/deployments/current/templates/zerver/app/
chown zulip:zulip /home/zulip/deployments/current/templates/zerver/app/navbar.html
chmod 644 /home/zulip/deployments/current/templates/zerver/app/navbar.html

#echo "Deploying memcached.conf"
#cp /etc/memcached.conf /etc/memcached.conf-$mydate
#cp /root/mods/memcached.conf /etc/
#chown root:root /etc/memcached.conf
#chmod 644 /etc/memcached.conf

#echo "Deploying uwsgi.ini"
#cp /etc/zulip/uwsgi.ini /etc/zulip/uwsgi.ini-$mydate
#cp /root/mods/uwsgi.ini /etc/zulip/
#chown root:root /etc/zulip/uwsgi.ini
#chmod 644 /etc/zulip/uwsgi.ini

echo "Deploying actions.py"
cp /home/zulip/deployments/current/zerver/lib/actions.py /home/zulip/deployments/current/zerver/lib/actions.py-$mydate
cp /root/mods/actions.py /home/zulip/deployments/current/zerver/lib/
chown zulip:zulip /home/zulip/deployments/current/zerver/lib/actions.py
chmod 644  /home/zulip/deployments/current/zerver/lib/actions.py

echo "Deploying upload.py"
cp /home/zulip/deployments/current/zerver/views/upload.py /home/zulip/deployments/current/zerver/views/upload.py-$mydate
cp /root/mods/upload.py /home/zulip/deployments/current/zerver/views/
chown zulip:zulip /home/zulip/deployments/current/zerver/views/upload.py
chmod 644  /home/zulip/deployments/current/zerver/views/upload.py

echo "Clearing cache and pushing changes"
zulip_clear_cache_and_push_changes.sh

