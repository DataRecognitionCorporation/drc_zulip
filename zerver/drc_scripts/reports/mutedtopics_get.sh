#!/bin/bash
#SET OUR VARS
ran_at=$(date '+%Y-%m-%d')
queryname="mutedtopics"

email_to=$1
echo "Emailing to: $email_to"

email_subject="Zulip (chat) $queryname report $ran_at"
email_body="Please see attatched Zulip $queryname report"
csv_header="user_name,user_email,topic_name,rept_name,rcpt_email,stream_name,date_muted"
csv_delimiter=","
sql_options=" -t -A -F"$csv_delimiter" "
file_sql_tmp="${queryname}_${ran_at}.sql"
file_results_dst="${queryname}_${ran_at}.csv"
#
#CREATE THE HEADER ROW
echo $csv_header > $file_results_dst
#
#CREATE OUR SQL STATEMENT
sql="SELECT UPID.full_name AS user_name, "
sql=${sql}"  UPID.delivery_email AS user_email, "
sql=${sql}"  MUTED_TOPIC.topic_name, "
sql=${sql}"  RID.full_name AS rept_name, "
sql=${sql}"  RID.delivery_email AS rcpt_email, "
sql=${sql}"  STREAM.name, "
sql=${sql}"  MUTED_TOPIC.date_muted "
sql=${sql}"FROM zerver_mutedtopic AS MUTED_TOPIC "
sql=${sql}"JOIN zerver_userprofile AS UPID ON UPID.id = MUTED_TOPIC.user_profile_id "
sql=${sql}"JOIN zerver_userprofile AS RID ON RID.id = MUTED_TOPIC.recipient_id "
sql=${sql}"JOIN zerver_stream AS STREAM ON STREAM.id = MUTED_TOPIC.stream_id "
sql=${sql}"ORDER BY user_name, date_muted;"
echo $sql > $file_sql_tmp
#
#EXECUTE THE SQL STATEMENT AND STORE THE RESULTS
psql -d zulip $sql_options -f $file_sql_tmp >> "$file_results_dst"

cat $file_results_dst

#MAIL THE REPORT
echo "$email_body" | mutt -a $file_results_dst -s "$email_subject" -- $email_to
#
#CLEANUP
rm -f $file_sql_tmp
rm -f $file_results_dst
