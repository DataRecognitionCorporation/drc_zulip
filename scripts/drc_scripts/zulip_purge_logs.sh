#!/bin/bash
echo "space before"
df -h /
rm -f /var/log/zulip/*.gz
rm -f /var/log/zulip/*.10
rm -f /var/log/zulip/*.9
rm -f /var/log/zulip/*.8
rm -f /var/log/zulip/*.7
rm -f /var/log/zulip/*.6
rm -f /var/log/zulip/*.5
rm -f /var/log/zulip/*.4
rm -f /var/log/zulip/*.3
rm -f /var/log/zulip/*.2
rm -f /var/log/zulip/*.1
rm -f /var/log/zulip/server.log
touch /var/log/zulip/server.log
chown zulip.zulip /var/log/zulip/server.log
chmod 664 /var/log/zulip/server.log
rm -f /var/log/zulip/errors.log
touch /var/log/zulip/errors.log
chown zulip.zulip /var/log/zulip/errors.log
chmod 664 /var/log/zulip/errors.log
echo "space afer"
sync;sync
df -h /
