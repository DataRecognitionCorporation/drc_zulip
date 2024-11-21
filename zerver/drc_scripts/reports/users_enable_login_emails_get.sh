#!/bin/bash
echo "Users with enable_login_emails set"
psql -c "select full_name,delivery_email from zerver_userprofile where enable_login_emails='true';" 
