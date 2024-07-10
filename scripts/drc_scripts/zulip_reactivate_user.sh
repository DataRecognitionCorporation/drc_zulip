#!/bin/bash
cat /etc/drc_header
VERSION="1.1"
# 1.0 220815 jwdunn inital coding
# 1.1 220815 jwdunn added header and fixed hard coded user
echo "script name -------------->  ${0##*/}"
echo "version ------------------>  $VERSION"
echo "parent path -------------->  ${0%/*}"
echo "path to me --------------->  ${0}"
echo "arguments called with ---->  ${@}"

echo "SELECT \"id\",\"full_name\",\"email\",\"delivery_email\",\"long_term_idle\" FROM \"zerver_userprofile\" WHERE email='user$1@chat.datarecognitioncorp.com';" > /tmp/zulip_reactivate_user.sql
echo "UPDATE \"zulip\".\"zerver_userprofile\" SET \"long_term_idle\"='false' WHERE  \"email\"='user$1@chat.datarecognitioncorp.com';" >> /tmp/zulip_reactivate_user.sql
echo "SELECT \"id\",\"full_name\",\"email\",\"delivery_email\",\"long_term_idle\" FROM \"zerver_userprofile\" WHERE email='user$1@chat.datarecognitioncorp.com';" >> /tmp/zulip_reactivate_user.sql
chmod 666 /tmp/zulip_reactivate_user.sql
cd /home/zulip
sudo -u zulip "/usr/bin/psql" zulip < /tmp/zulip_reactivate_user.sql
cd ~
rm -f /tmp/zulip_reactivate_user.sql
