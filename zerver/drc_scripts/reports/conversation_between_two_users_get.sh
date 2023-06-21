#!/bin/bash
party_1_email=$1
party_2_email=$2
results_email=$3
csv=$4

echo "Email 1: $party_1_email"
echo "Email 2: $party_2_email"
echo "Results Emails: $results_email"

delimiter="|"
pw=$(pwgen 24 1)
ran_at=$(date '+%Y%m%d%H%M%S')
if [ "$#" -lt 3 ]; then
  echo
  echo "Usage: ./get_conversion.sh <party 1 email> <party 2 email> <send results to> <csv>(optional)"
  echo "-------------------------------------------------------------------------"
  echo "example: ./get_conversation.sh jwdunn@datarecognitioncorp.com atormanen@datarecognitioncorp.com KSilbaugh@datarecognitioncorp.com"
  echo "example in csv format: ./get_conversation.sh jwdunn@datarecognitioncorp.com atormanen@datarecognitioncorp.com KSilbaugh@datarecognitioncorp.com csv"
  echo "example multiple recipients: ./get_conversaion.sh jwdunn@datarecognitioncorp.com atormanen@datarecognitioncorp.com \"jwdunn@datarecognitioncorp.com,james@errorcode67.com\" csv"
  echo
else
  echo
  results_dst="conversation_"$party_1_email"-"$party_2_email"_"$ran_at
  if [ "$csv" = "csv" ]; then
    results_tmp=$results_dst".csv"
    rm -f "$results_tmp*"
    echo "message_id|content|sender|sender_email|recipient|recipient_email|sending_device|date_sent" > "$results_tmp"
    options=" -t -A -F"$delimiter" "
  else
    results_tmp=$results_dst".txt"
    rm -f "$results_tmp*"
    options=""
  fi
  results_zip=$results_dst".zip"
  sql="SELECT message.id AS message_id, content AS message_content, profile_sending.full_name AS sender, profile_sending.delivery_email AS sender_email,"
  sql=${sql}" profile_recieving.full_name AS recipient,profile_recieving.delivery_email AS recipient_email, client.name AS sending_device,date_sent"
  sql=${sql}" FROM zerver_message AS message"
  sql=${sql}" INNER JOIN zerver_userprofile AS profile_sending ON message.sender_id = profile_sending.id"
  sql=${sql}" INNER JOIN zerver_recipient AS recipients ON message.recipient_id = recipients.id"
  sql=${sql}" INNER JOIN zerver_userprofile AS profile_recieving ON recipients.type_id = profile_recieving.id"
  sql=${sql}" INNER JOIN zerver_client AS client ON message.sending_client_id = client.id"
  sql=${sql}" WHERE ((profile_sending.delivery_email = '"$party_1_email"' AND profile_recieving.delivery_email = '"$party_2_email"')"
  sql=${sql}" OR (profile_sending.delivery_email = '"$party_2_email"' AND profile_recieving.delivery_email = '"$party_1_email"')) ORDER BY date_sent;"
  echo $sql > ~/sql_tmp.sql
  psql -d zulip $options -f ~/sql_tmp.sql >> "$results_tmp"
  rm -f ~/sql_tmp.sql
  zip -q --password "$pw" "$results_zip" "$results_tmp"
  rm -f "$results_tmp"
  echo "$pw" | mail -s "$results_dst" "$results_email"
  echo $results_dst > ~/mail_body.txt
  mail -s "$results_dst Results"  $results_email -A "$results_zip" < ~/mail_body.txt
#  #echo "Please see attached" | mail -s "Conversation Request Results" -a "$results_zip" $results_email
  rm -f "$results_zip"
  echo "Collocted conversation and sent via email."
fi
