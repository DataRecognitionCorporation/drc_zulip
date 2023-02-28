#!/bin/bash
#SET OUR VARS

ran_at=$(date '+%Y-%m-%d')
email_to="$1"
#email_to="KSilbaugh@DataRecognitionCorp.com"
email_subject="Zulip (chat) User Roles Report $ran_at"
email_body="Please see attatched Zulip user roles report"
csv_header="role,full_name,delivery_email,is_active"
csv_delimiter=","
sql_options=" -t -A -F"$csv_delimiter" "
file_sql_tmp="user_roles_$ran_at.sql"
file_results_dst="user_roles_$ran_at.csv"

echo "Email To: ${email_to}"
echo

#CREATE THE HEADER ROW
echo $csv_header > $file_results_dst

#CREATE OUR SQL STATEMENT
sql="SELECT role,full_name,delivery_email,is_active"
sql=${sql}" FROM zerver_userprofile"
sql=${sql}" WHERE zerver_userprofile.role<=400"
sql=${sql}" ORDER BY ROLE,is_active,full_name;"
echo $sql > $file_sql_tmp

#EXECUTE THE SQL STATEMENT AND STORE THE RESULTS
psql -d zulip $sql_options -f $file_sql_tmp >> "$file_results_dst"

cat "$file_results_dst"

word_count=$(cat $file_results_dst | wc -l)
echo "Number of users: ${word_count}"

#MAIL THE REPORT
echo "$email_body" | mutt -a $file_results_dst -s "$email_subject" -- $email_to
#
#CLEANUP
rm -f $file_sql_tmp
rm -f $file_results_dst
