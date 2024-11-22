SELECT id,name FROM "zulip"."zerver_stream" WHERE name NOT LIKE '!DEACTIVATED%';

UPDATE "zulip"."zerver_stream" SET "invite_only"='false' WHERE  "id"=3;
