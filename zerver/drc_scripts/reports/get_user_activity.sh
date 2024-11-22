#!/bin/bash
party_1_email=$1
date_start=$2
date_end=$3
file_dst=$4

echo "Getting activity for: ${party_1_email}"
echo

if [ "$#" -eq 0 ]; then
  echo
  echo "Usage: ./user_activity_get.sh <user email> <start date> <end date> <output filename>"
  echo "-------------------------------------------------------------------------"
  echo "example: ./user_activity_get.sh jwdunn@datarecognitioncorp.com \"2023-01-01\" \"2023-01-31\" jwdunn-wctivity-230101-230131.txt"
  echo
else
  echo "**************" > $file_dst
  echo "* LAST LOGIN *" >> $file_dst
  echo "**************" >> $file_dst
  sql="SELECT userprofile.full_name AS FULL_NAME, "
  sql=${sql}"userprofile.delivery_email AS EMAIL, "
  sql=${sql}"userprofile.last_login AS LAST_LOGIN "
  sql=${sql}"FROM zerver_userprofile AS userprofile "
  sql=${sql}"WHERE userprofile.delivery_email ilike '$party_1_email';"
  psql -d zulip -c "$sql" >> $file_dst

  echo >> $file_dst
  echo "*************" >> $file_dst
  echo "* ANALYTICS *" >> $file_dst
  echo "*************" >> $file_dst
  sql="SELECT userprofile.full_name AS FULL_NAME, "
  sql=${sql}"  userprofile.delivery_email AS EMAIL, "
  sql=${sql}"  usercount.property AS PROPERTY, "
  sql=${sql}"  usercount.end_time AS END_TIME, "
  sql=${sql}"  usercount.value AS VALUE "
  sql=${sql}"FROM zerver_userprofile AS userprofile "
  sql=${sql}"JOIN analytics_usercount AS usercount ON usercount.user_id = userprofile.id "
  sql=${sql}"WHERE userprofile.delivery_email ilike '$party_1_email' "
  sql=${sql}"   AND usercount.property <> 'active_users_audit:is_bot:day' "
  sql=${sql}"   AND usercount.end_time BETWEEN '$date_start' AND '$date_end' "
  sql=${sql}"ORDER BY usercount.end_time DESC;"
  psql -d zulip -c "$sql" >> $file_dst

  echo >> $file_dst
  echo "*****************" >> $file_dst
  echo "* USER ACTIVITY *" >> $file_dst
  echo "*****************" >> $file_dst
  sql="SELECT userprofile.full_name AS FULL_NAME, "
  sql=${sql}"  userprofile.delivery_email AS EMAIL, "
  sql=${sql}"  useractivity."query" AS QUERY, "
  sql=${sql}"  useractivity."count" AS COUNT, "
  sql=${sql}"  useractivity.last_visit AS LAST_VISIT "
  sql=${sql}"FROM zerver_userprofile AS userprofile "
  sql=${sql}"JOIN zerver_useractivity as useractivity ON useractivity.user_profile_id = userprofile.id "
  sql=${sql}"WHERE userprofile.delivery_email ilike '$party_1_email' "
  sql=${sql}"  AND useractivity.last_visit BETWEEN '$date_start' AND '$date_end' "
  sql=${sql}"ORDER BY useractivity.last_visit DESC;"
  psql -d zulip -c "$sql" >> $file_dst

  echo >> $file_dst
  echo "*****************" >> $file_dst
  echo "* MESSAGES SENT *" >> $file_dst
  echo "*****************" >> $file_dst
  sql="SELECT userprofile.full_name AS FULL_NAME, "
  sql=${sql}"  userprofile.delivery_email AS EMAIL, "
  sql=${sql}"  message.date_sent AS DATE_SENT "
  sql=${sql}"FROM zerver_userprofile AS userprofile "
  sql=${sql}"JOIN zerver_usermessage AS usermessage ON usermessage.user_profile_id = userprofile.id "
  sql=${sql}"JOIN zerver_message AS message ON message.id = usermessage.message_id "
  sql=${sql}"WHERE userprofile.delivery_email ilike '$party_1_email' "
  sql=${sql}"  AND message.date_sent BETWEEN '$date_start' AND '$date_end' "
  sql=${sql}"ORDER BY message.date_sent DESC;"
  psql -d zulip -c "$sql" >> $file_dst

  echo >> $file_dst
  echo "****************" >> $file_dst
  echo "* MUTED TOPICS *" >> $file_dst
  echo "****************" >> $file_dst
  sql="SELECT userprofile.full_name AS FULL_NAME, "
  sql=${sql}"  userprofile.delivery_email AS EMAIL, "
  sql=${sql}"  stream.name AS STREAM_NAME, "
  sql=${sql}"  mutedtopic.topic_name AS MUTED_TOPIC, "
  sql=${sql}"  mutedtopic.date_muted AS DATE_MUTED "
  sql=${sql}"FROM zerver_userprofile AS userprofile "
  sql=${sql}"JOIN zerver_mutedtopic AS mutedtopic ON mutedtopic.user_profile_id = userprofile.id "
  sql=${sql}"JOIN zerver_stream  as stream ON stream.id = mutedtopic.stream_id "
  sql=${sql}"WHERE userprofile.delivery_email ilike '$party_1_email' "
  sql=${sql}"  AND mutedtopic.date_muted BETWEEN '$date_start' AND '$date_end' "
  sql=${sql}"ORDER BY userprofile.delivery_email, mutedtopic.date_muted DESC;"
  psql -d zulip -c "$sql" >> $file_dst

  cat $file_dst
  rm -f $file_dst
fi
