#!/bin/bash
party_1_email=$1
date_start=$2
date_end=$3
file_dst=$4
if [ "$#" -eq 0 ]; then
  echo
  echo "Usage: ./user_activity_get.sh <user email> <start date> <end date> <output filename>"
  echo "-------------------------------------------------------------------------"
  echo "example: ./user_activity_get.sh jwdunn@datarecognitioncorp.com \"2023-01-01\" \"2023-01-31\" jwdunn-wctivity-230101-230131.txt"
  echo
  echo "Saving output to a file."
  echo "./user_activity_get.sh jwdunn@datarecognitioncorp.com \"2023-01-01\" \"2023-01-31\""
  echo
else
  echo "**************" > $file_dst
  echo "* LAST LOGIN *" >> $file_dst
  echo "**************">> $file_dst
  psql -d zulip -c "SELECT zerver_userprofile.full_name AS USER_NAME, zerver_userprofile.delivery_email AS USER_EMAIL, zerver_userprofile.last_login AS LAST_LOGIN FROM zerver_userprofile WHERE zerver_userprofile.delivery_email ilike '$party_1_email';" >> $file_dst

  echo >> $file_dst
  echo "*************" >> $file_dst
  echo "* ANALYTICS *" >> $file_dst
  echo "*************" >> $file_dst
  psql -d zulip -c "SELECT zerver_userprofile.full_name AS USER_NAME, zerver_userprofile.delivery_email AS USER_EMAIL, analytics_usercount.property AS PROPERY, analytics_usercount.end_time AS END_TIME, analytics_usercount.value AS VALUE FROM zerver_userprofile JOIN analytics_usercount ON analytics_usercount.user_id = zerver_userprofile.id WHERE zerver_userprofile.delivery_email ilike '$party_1_email' AND analytics_usercount.property <> 'active_users_audit:is_bot:day' AND  analytics_usercount.end_time BETWEEN '$date_start' AND '$date_end' ORDER BY analytics_usercount.end_time DESC;" >> $file_dst

  echo >> $file_dst
  echo "*****************" >> $file_dst
  echo "* USER ACTIVITY *" >> $file_dst
  echo "*****************" >> $file_dst
  psql -d zulip -c "SELECT zerver_userprofile.full_name AS USER_NAME, zerver_userprofile.delivery_email AS USER_EMAIL, zerver_useractivity."query" AS QUERY, zerver_useractivity."count" AS COUNT, zerver_useractivity.last_visit AS LAST_VISIT FROM zerver_userprofile JOIN zerver_useractivity ON zerver_useractivity.user_profile_id = zerver_userprofile.id WHERE zerver_userprofile.delivery_email ilike '$party_1_email' AND zerver_useractivity.last_visit AND BETWEEN '$date_start' AND '$date_end' ORDER BY zerver_useractivity.last_visit DESC;" >> $file_dst

  echo >> $file_dst
  echo "*****************" >> $file_dst
  echo "* MESSAGES SENT *" >> $file_dst
  echo "*****************" >> $file_dst
  psql -d zulip -c "SELECT up.full_name AS USER_NAME, up.delivery_email AS USER_EMAIL ,m.date_sent AS DATE_SENT FROM zerver_userprofile up JOIN zerver_usermessage um ON um.user_profile_id = up.id JOIN zerver_message m ON m.id = um.message_id WHERE up.delivery_email ilike '$party_1_email' AND  m.date_sent BETWEEN '$date_start' AND '$date_end' ORDER BY m.date_sent DESC;" >> $file_dst

  echo >> $file_dst
  echo "****************" >> $file_dst
  echo "* MUTED TOPICS *" >> $file_dst
  echo "****************" >> $file_dst
  psql -d zulip -c "SELECT zerver_userprofile.full_name AS USER_NAME, zerver_userprofile.delivery_email AS USER_EMAIL, zerver_stream.name AS STREAM_NAME, zerver_mutedtopic.topic_name AS TOPIC_NAME, zerver_mutedtopic.date_muted AS DATE_MUTED FROM zerver_userprofile JOIN zerver_mutedtopic ON zerver_mutedtopic.user_profile_id = zerver_userprofile.id JOIN zerver_stream ON zerver_stream.id = zerver_mutedtopic.stream_id ORDER BY zerver_userprofile.delivery_email, zerver_mutedtopic.date_muted DESC;" >> $file_dst

#USER ACTIVITY (WE STOPPED TRACKING)
#SELECT zerver_userprofile.full_name,zerver_userprofile.delivery_email, zerver_useractivityinterval."start", zerver_useractivityinterval."end" FROM zerver_userprofile JOIN zerver_useractivityinterval ON zerver_useractivityinterval.user_profile_id = zerver_userprofile.id WHERE zerver_userprofile.delivery_email ilike 'Jwdunn@datarecognitioncorp.com' ORDER BY zerver_useractivityinterval."end"

  cat $file_dst
fi
