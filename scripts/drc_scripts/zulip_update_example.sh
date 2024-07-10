#UPGRADE/DOWNGRADES ZULIP TO A CERTAIN RELEASE
echo "WARNING WARNING WARNING WARNING WARNING WARNING WARNING"
echo "======================================================="
echo "DO NOT RUN THIS SCRIPT DIRECTLY"
echo "IT IS AN EXAMPLE OF THE STEPS TO UPGRADE/DOWNGRADE ZULIP"

echo "REMEMBER TO PUT BACK IN PLACE ANY MODS TO ZULIP"
echo "LIST OF CURRENT MODS"
echo "/home/zulip/deployments/current/templates/zerver/app/left_sidebar.html"
echo "/home/zulip/deployments/current/templates/zerver/app/navbar.html"
echo "/home/zulip/deployments/current/templates/zerver/app/right_sidebar.html"
echo ""

#UPGRADE/DOWNGRADES ZULIP TO A CERTAIN RELEASE
echo "WARNING WARNING WARNING WARNING WARNING WARNING WARNING"
echo "======================================================="
echo "DO NOT RUN THIS SCRIPT DIRECTLY"
echo "IT IS AN EXAMPLE OF THE STEPS TO UPGRADE/DOWNGRADE ZULIP"

echo "REMEMBER TO PUT BACK IN PLACE ANY MODS TO ZULIP"
echo "LIST OF CURRENT MODS"
echo "/home/zulip/deployments/current/templates/zerver/app/left_sidebar.html"
echo "/home/zulip/deployments/current/templates/zerver/app/navbar.html"
echo "/home/zulip/deployments/current/templates/zerver/app/right_sidebar.html"
echo ""

#FIX /etc/zulip/meet/settings.py for s3 zone to be us-east-1 rather than the FQDN


#STOP ZULIP AND RELATED SERVICES
#/usr/local/bin/zulip_stop.sh

#DO AN OS UPGRADE
#apt update
#apt upgrade
#ANSWER DEFAULT FOR ANY CONFIG QUESTIONS IT ASKS

#REBOOT
#reboot

#APT CLEANUP
#apt autoremove

#RESTART ZULIP TO MAKE SURE ALL IS WELL
#zulip_restart_graceful.sh

#CHECK THE MAIN ZULIP LOG TO MAKE SURE ALL IS WELL
#tail -f /var/log/zulip/server.log

#CD TO THE TEMP DIRECTORY
#cd /tmp

#GET THE VERSION OF ZULIP YOU WISH TO UPGRADE/DOWNGRADE TO
#wget https://www.zulip.org/dist/releases/zulip-server-latest.tar.gz

#INSTALL THE VERSION YOU JUST DOWNLOADED
#/home/zulip/deployments/current/scripts/upgrade-zulip zulip-server-latest.tar.gz

#DEPLOY DRC MODS
#/root/deploy_mods.sh

#EITHER START ZULIP OR REBOOT THE SERVER
#REBOOT IS PREFERRED
#/usr/local/bin/zulip_start.sh
#reboot

#RESTART ZULIP TO MAKE SURE ALL IS WELL
#zulip_restart_graceful.sh

#CHECK THE MAIN ZULIP LOG TO MAKE SURE ALL IS WELL
#tail -f /var/log/zulip/server.log

#UBUNTU RELEASE UPGRADE EX:18.04 TO 20.04
#/usr/local/bin/zulip_stop.sh

#do-release-upgrade

#FIX FOR raise RuntimeError(venv + " was not set up for this Python version")
#/home/zulip/deployments/current/scripts/lib/create-production-venv /home/zulip/deployments/current
