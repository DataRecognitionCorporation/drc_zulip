#!/bin/bash

ran_at=$(date '+%Y-%m-%d')
queryname="get_messages"

email_to=$1
party_1_email=$2
csv=$3

echo "Email to: $email_to"
echo "Messages for: $party_1_email"

email_subject="Zulip (chat) $queryname report $ran_at"
email_body="Please see attatched Zulip $queryname report"

delimiter=","
csv_header="message_content"$delimiter"message_sent"$delimiter"message_edits"$delimiter"message_last_edited"$delimiter"sender"$delimiter"sender_email"$delimiter"recipient"$delimiter"recipient_email"$delimiter"sending_device"
# sql_options=" -t -A -F"$csv_delimiter" "
file_sql_tmp="${queryname}_${ran_at}.sql"
file_results_dst="${queryname}_${ran_at}.csv"

if [ "$#" -eq 0 ]; then
  echo
  echo "Usage: ./messages_user_get.sh <user email> <csv>(optional) <delimiter>(optional)"
  echo "-------------------------------------------------------------------------"
  echo "example: ./messages_user_get.sh jwdunn@datarecognitioncorp.com"
  echo "example in csv format using a | delimiter: ./messages_user_get.sh jwdunn@datarecognitioncorp.com csv"
  echo "example in csv format using a , delimiter: ./messages_user_get.sh jwdunn@datarecognitioncorp.com csv \",\""
  echo
  echo "Saving output to a file."
  echo "./messages_user_get.sh jwdunn@datarecognitioncorp.com > conversion.txt"
  echo "./messages_user_get.sh jwdunn@datarecognitioncorp.com csv > conversion.csv"
  echo
else
  if [ "$csv" = "csv" ]; then
    delimiter="|"
    csv_header="message_content"$delimiter"message_sent"$delimiter"message_edits"$delimiter"message_last_edited"$delimiter"sender"$delimiter"sender_email"$delimiter"recipient"$delimiter"recipient_email"$delimiter"sending_device"

    options=" -t -A -F"$delimiter" "
  else
    options=""
  fi
fi

echo $csv_header > $file_results_dst

sql="SELECT message.content AS message_content, "
sql=${sql}"  message.date_sent AS message_sent, "
sql=${sql}"  message.edit_history AS message_edits, "
sql=${sql}"  message.last_edit_time AS message_last_edited, "
sql=${sql}"  profile_sending.full_name AS sender, "
sql=${sql}"  profile_sending.delivery_email AS sender_email, "
sql=${sql}"  profile_recieving.full_name AS recipient, "
sql=${sql}"  profile_recieving.delivery_email AS recipient_email, "
sql=${sql}"  client.name AS sending_device "
sql=${sql}"  FROM zerver_message AS message "
sql=${sql}"  INNER JOIN zerver_userprofile AS profile_sending ON message.sender_id = profile_sending.id "
sql=${sql}"  INNER JOIN zerver_recipient AS recipients ON message.recipient_id = recipients.id "
sql=${sql}"  INNER JOIN zerver_userprofile AS profile_recieving ON recipients.type_id = profile_recieving.id "
sql=${sql}"  INNER JOIN zerver_client AS client ON message.sending_client_id = client.id WHERE ((profile_sending.delivery_email = '$party_1_email') OR (profile_recieving.delivery_email = '$party_1_email')) ORDER BY date_sent;"
echo $sql > $file_sql_tmp

psql -d zulip $options -f $file_sql_tmp >> "$file_results_dst"
# cat $file_results_dst

echo "$email_body" | mutt -a $file_results_dst -s "$email_subject" -- $email_to

rm -f $file_sql_tmp
rm -f $file_results_dst

echo
echo "Messages collected and sent..."
