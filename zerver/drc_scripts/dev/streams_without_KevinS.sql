SELECT zerver_subscription.active, zerver_stream.name
FROM zerver_subscription
JOIN zerver_recipient ON zerver_subscription.recipient_id = zerver_recipient.id
JOIN zerver_stream ON zerver_stream.id=zerver_recipient.type_id
WHERE zerver_recipient."type"=2 AND user_profile_id=16 AND zerver_subscription.active=false
ORDER BY zerver_stream.name
