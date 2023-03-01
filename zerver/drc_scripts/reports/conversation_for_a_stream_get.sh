#!/bin/bash
stream_name=$1
results_email=$2
csv=$3
delimiter="|"

echo "Stream name: $stream_name"
echo "Results email: $results_email"

pw=$(pwgen 24 1)
ran_at=$(date '+%Y%m%d%H%M%S')
if [ "$#" -lt 2 ]; then
  echo
  echo "Usage: ./get_stream_conversion.sh <stream name> <send results to> <csv>(optional)"
  echo "-------------------------------------------------------------------------"
  echo "example: ./get_stream_conversation.sh \"WB - EFL171 - Syverson, Todd - All Users\"  KSilbaugh@datarecognitioncorp.com"
  echo "example in csv format: ./get_stream_conversation.sh \"WB - EFL171 - Syverson, Todd - All Users\"  KSilbaugh@datarecognitioncorp.com csv"
  echo "example multiple recipients: ./get_stream_conversation.sh \"WB - EFL171 - Syverson, Todd - All Users\"  KSilbaugh@datarecognitioncorp.com \"jwdunn@datarecognitioncorp.com,james@errorcode67.com\" csv"
  echo
else
  echo
  results_dst="stream_conversation_"$stream_name"_"$ran_at
  if [ "$csv" = "csv" ]; then
    results_tmp=$results_dst".csv"
    rm -f "$results_tmp*"
    echo "message_id|content|sender|sender_email|sending_device|date_sent" > "$results_tmp"
    options=" -t -A -F"$delimiter" "
  else
    results_tmp=$results_dst".txt"
    rm -f "$results_tmp*"
    options=""
  fi
  results_zip=$results_dst".zip"
  sql="SELECT message.id AS message_id, content AS message_content, profile_sending.full_name AS sender, profile_sending.delivery_email AS sender_email, client.name AS sending_device,date_sent"
  sql=${sql}" FROM zerver_message as message"
  sql=${sql}" INNER JOIN zerver_recipient AS recipients ON recipients.id = message.recipient_id"
  sql=${sql}" INNER JOIN zerver_stream as stream on recipients.type_id = stream.id"
  sql=${sql}" INNER JOIN zerver_userprofile AS profile_sending ON message.sender_id = profile_sending.id"
  sql=${sql}" INNER JOIN zerver_client AS client ON message.sending_client_id = client.id"
  sql=${sql}" WHERE stream.name ='"$stream_name"'"
  sql=${sql}" ORDER BY message.date_sent;"
  echo $sql > ~/sql_tmp.sql
  psql -d zulip $options -f ~/sql_tmp.sql >> "$results_tmp"
  rm -f ~/sql_tmp.sql
  zip -q --password "$pw" "$results_zip" "$results_tmp"
  rm -f "$results_tmp"
  echo "$pw" | mail -s "$results_dst" "$results_email"
  echo $results_dst > ~/mail_body.txt
  mail -s "$results_dst Results"  $results_email -A "$results_zip" < ~/mail_body.txt
  rm -f "$results_zip"
  echo "Collected conversation and emailed. "
fi
