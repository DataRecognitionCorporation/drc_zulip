#!/bin/bash
party_1_email=$1
csv=$2
delimiter=$3
if [ "$#" -eq 0 ]; then
  echo
  echo "Usage: ./subscriptions_for_user_get.sh <user email> <csv>(optional) <delimiter>(optional)"
  echo "-------------------------------------------------------------------------"
  echo "example: ./subscriptions_for_user_get.sh jwdunn@datarecognitioncorp.com"
  echo "example in csv format using a | delimiter: ./subscriptions_for_user_get.sh jwdunn@datarecognitioncorp.com csv"
  echo "example in csv format using a , delimiter: ./subscriptions_for_user_get.sh jwdunn@datarecognitioncorp.com csv \",\""
  echo
  echo "Saving output to a file."
  echo "./subscriptions_for_user_get.sh jwdunn@datarecognitioncorp.com > conversion.txt"
  echo "./subscriptions_for_user_get.sh jwdunn@datarecognitioncorp.com csv > conversion.csv"
  echo
else
  clear
  if [ "$csv" = "csv" ]; then
    if [ "$delimiter" = "" ]; then
      delimiter="|"
    fi
    echo "full_name"$delimiter"email"$delimiter"stream"$delimiter"active"$delimiter"muted"$delimiter"user_active"
    options=" -t -A -F"$delimiter" "
  else
    options=""
  fi
  psql -d zulip $options -c "SELECT userprofile.full_name AS full_name, userprofile.delivery_email AS email, stream.name AS stream, subscription.active AS active, subscription.is_muted AS muted, subscription.is_user_active AS user_active FROM zerver_subscription AS subscription INNER JOIN zerver_userprofile AS userprofile ON userprofile.id = subscription.user_profile_id INNER JOIN zerver_recipient AS recipient ON recipient.id = subscription.recipient_id INNER JOIN zerver_stream AS stream ON stream.id = recipient.type_id WHERE userprofile.delivery_email = '$party_1_email' ORDER BY active DESC, stream"
fi
