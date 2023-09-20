#!/bin/bash
#SET OUT VARIABLES
results_email="KSilbaugh@datarecognitioncorp.com,jwdunn@datarecognitioncorp.com"
ran_at=$(date '+%Y-%m-%d')
results_tmp=~/update_users_enable_login_emails.tmp

echo "update_users_enable_login_emails.sh started on $ran_at"
#CLEAN UP IN CASE PRIOR RUN DID NOT FOR SOME REASON
if [ -f $results_tmp ]; then
  rm -f $results_tmp
fi

#SEE IF WE HAVE ANY RESULTS THAT NEED TO BE UPDATED
count=$(psql -c "select count(enable_login_emails) from zerver_userprofile where enable_login_emails='true';" | sed -n '3p' | sed -e 's/^[[:space:]]*//')
if [ $count -gt 0 ]; then
  #WE DO SO GENERATE REPORT AND EMAIL IT
  psql -c "select full_name,delivery_email from zerver_userprofile where enable_login_emails='true';" >> "$results_tmp"
  echo "Users with enable_login_emails set"
  cat "$results_tmp"
  mail -s "Zulip (chat) Users with enable_login_emails set on $ran_at"  $results_email < $results_tmp
  #CLEAN UP
  if [ -f $results_tmp ]; then
    rm -f $results_tmp
  fi
  #THEN UPDATE DATABASE TO DISABLE LOGIN EMAILS WHERE SET
  echo "Turning off enable_login_emails"
  psql -c "UPDATE zulip.zerver_userprofile SET enable_login_emails='false' WHERE enable_login_emails='true';" 
fi
echo "update_users_enable_login_emails.sh finished"
