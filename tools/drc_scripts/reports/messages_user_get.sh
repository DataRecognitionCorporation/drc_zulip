#!/bin/bash
party_1_email=$1
csv=$2
delimiter=$3
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
  clear
  if [ "$csv" = "csv" ]; then
    if [ "$delimiter" = "" ]; then
      delimiter="|"
    fi
    echo "message_content"$delimiter"message_sent"$delimiter"message_edits"$delimiter"message_last_edited"$delimiter"sender"$delimiter"sender_email"$delimiter"recipient"$delimiter"recipient_email"$delimiter"sending_device"
    options=" -t -A -F"$delimiter" "
  else
    options=""
  fi
  psql -d zulip $options -c "SELECT message.content AS message_content, message.date_sent AS message_sent, message.edit_history AS message_edits, message.last_edit_time AS message_last_edited, profile_sending.full_name AS sender, profile_sending.delivery_email AS sender_email, profile_recieving.full_name AS recipient, profile_recieving.delivery_email AS recipient_email, client.name AS sending_device FROM zerver_message AS message INNER JOIN zerver_userprofile AS profile_sending ON message.sender_id = profile_sending.id INNER JOIN zerver_recipient AS recipients ON message.recipient_id = recipients.id INNER JOIN zerver_userprofile AS profile_recieving ON recipients.type_id = profile_recieving.id INNER JOIN zerver_client AS client ON message.sending_client_id = client.id WHERE ((profile_sending.delivery_email = '$party_1_email') OR (profile_recieving.delivery_email = '$party_1_email')) ORDER BY date_sent;"
fi
