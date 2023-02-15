#!/bin/bash
psql -d zulip -c "SELECT DISTINCT profile_sending.full_name AS sender, profile_sending.delivery_email AS sender_email, client.name AS sending_device FROM zerver_message AS message INNER JOIN zerver_userprofile AS profile_sending ON message.sender_id = profile_sending.id INNER JOIN zerver_client AS client ON message.sending_client_id = client.id WHERE client.name = 'ZulipMobile' ORDER BY sender_email" > MobileDevice.txt
echo "done"
