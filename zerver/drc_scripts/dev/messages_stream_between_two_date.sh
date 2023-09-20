#!/bin/bash
echo "Get stream messages between two dates"
echo "====================================="
read -p "Enter Stream Name: " stream_name
start_datex=$(date '+%Y')"-01-01"
read -p "Start Date ($start_datex): " start_date
if [ "$start_date" = "" ]; then
  start_date=$start_datex
fi
end_datex=$(date '+%Y-%m-%d')
read -p "End Date ($end_datex: " end_date
if [ "$end_date" = "" ]; then
  end_date=$end_datex
fi
read -p "Destination Filename (no extention): " results_dst
read -p "Save output as CSV or TXT (CSV/txt)? " YN
if [[ $YN == "csv" || $YN == "CSV" || $YN == "" ]]; then
  read -p "Delimiter (default |)? " delimiter
  if [ "$delimiter" = "" ]; then
    delimiter="|"
  fi
  results_tmp=$results_dst".csv"
  rm -f "$results_tmp*"
  echo "STREAM_NAME"$delimiter"USER_NAME"$delimiter"USER_EMAIL"$delimiter"MESSAGE_CONTENT"$delimiter"EDIT_HISTORY"$delimiter"LAST_EDITED"$delimiter"DATE_SENT" > "$results_tmp"
  options=" -t -A -F"$delimiter" "
else
  results_tmp=$results_dst".txt"
  rm -f "$results_tmp*"
  options=""
fi
results_zip=$results_dst".zip"
sql_tmp=$results_dst".sql"

sql="SELECT zerver_stream.name AS STREAM_NAME, "
sql=${sql}"  zerver_userprofile.full_name AS USER_NAME,"
sql=${sql}"  zerver_userprofile.delivery_email AS USER_EMAIL, "
sql=${sql}"  zerver_message.content AS MESSAGE_CONTENT, "
sql=${sql}"  zerver_message.edit_history AS EDIT_HISTORY, "
sql=${sql}"  zerver_message.last_edit_time AS LAST_EDITED, "
sql=${sql}"  zerver_message.date_sent AS DATE_SENT "
sql=${sql}"FROM zerver_message "
sql=${sql}"JOIN zerver_userprofile ON zerver_userprofile.id = zerver_message.sender_id "
sql=${sql}"JOIN zerver_recipient ON zerver_recipient.id = zerver_message.recipient_id "
sql=${sql}"JOIN zerver_stream ON zerver_stream.id = zerver_recipient.type_id "
sql=${sql}"WHERE zerver_stream.name = '$stream_name' "
sql=${sql}"  AND zerver_message.date_sent BETWEEN '"$start_date"' AND '"$end_date"' "
sql=${sql}"ORDER BY zerver_message.date_sent;"
echo $sql > $sql_tmp
psql -d zulip $options -f $sql_tmp >> "$results_tmp"
rm -f sql_tmp
echo
echo "First 10 results"
echo "======================================================================================================================="
head -n 10 "$results_tmp"
echo "======================================================================================================================="
read -p "Do you want to zip and email the results? (Y/n)? " YN
if [[ $YN == "y" || $YN == "Y" || $YN == "" ]]; then
  read -p "Email results to: " results_email
  zip -q "$results_zip" "$results_tmp"
  rm -f "$results_tmp"
  echo $results_dst > ~/mail_body.txt
  mail -s "$results_dst Results"  $results_email -A "$results_zip" < ~/mail_body.txt
  rm -f "$results_zip"
fi

