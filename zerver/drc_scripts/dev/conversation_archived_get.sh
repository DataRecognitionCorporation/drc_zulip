#!/bin/bash
party_1_email=$1
party_2_email=$2
csv=$3
delimiter=$4
if [ "$#" -eq 0 ]; then
  echo
  echo "Usage: ./get_conversion.sh <party 1 email> <party 2 email> <csv>(optional) <delimiter>(optional)"
  echo "-------------------------------------------------------------------------"
  echo "example: ./get_conversation.sh jwdunn@datarecognitioncorp.com atormanen@datarecognitioncorp.com"
  echo "example in csv format using a , delimiter: ./get_conversation.sh jwdunn@datarecognitioncorp.com atormanen@datarecognitioncorp.com csv"
  echo "example in csv format using a | delimiter: ./get_conversation.sh jwdunn@datarecognitioncorp.com atormanen@datarecognitioncorp.com csv \"|\""
  echo
  echo "Saving output to a file."
  echo "./get_conversation.sh jwdunn@datarecognitioncorp.com atormanen@datarecognitioncorp.com > conversion.txt"
  echo "./get_conversation.sh jwdunn@datarecognitioncorp.com atormanen@datarecognitioncorp.com csv > conversion.csv"
  echo
else
  clear
  if [ "$csv" = "csv" ]; then
    echo "message_id,content,sender,sender_email,recipient,recipient_email,sending_device,date_sent"
    if [ "$delimiter" = "" ]; then
      delimiter=","
    fi
    options=" -t -A -F"$delimiter" "
  else
    options=""
  fi
  psql -d zulip $options -c "SELECT message.id AS message_id, content AS message_content, profile_sending.full_name AS sender, profile_sending.delivery_email AS sender_email, profile_recieving.full_name AS recipient, profile_recieving.delivery_email AS recipient_email, client.name AS sending_device,date_sent FROM zerver_archivedmessage AS message INNER JOIN zerver_userprofile AS profile_sending ON message.sender_id = profile_sending.id INNER JOIN zerver_recipient AS recipients ON message.recipient_id = recipients.id INNER JOIN zerver_userprofile AS profile_recieving ON recipients.type_id = profile_recieving.id INNER JOIN zerver_client AS client ON message.sending_client_id = client.id WHERE ((profile_sending.delivery_email = '$party_1_email' AND profile_recieving.delivery_email = '$party_2_email') OR (profile_sending.delivery_email = '$party_2_email' AND profile_recieving.delivery_email = '$party_1_email')) ORDER BY date_sent;"

fi
