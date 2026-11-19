from argparse import ArgumentParser
from typing import Any

from django.db import transaction
from django.db.models import Exists, OuterRef
from typing_extensions import override

from zerver.lib.management import ZulipBaseCommand
from zerver.models import Recipient, Stream, Subscription


class Command(ZulipBaseCommand):
    help = """Delete an organization's subscriptions to channels that no longer exist.

Deleting a channel row directly in the database (rather than deactivating it)
leaves its subscriptions behind while cascading away their audit history. Such
subscriptions crash catch-up of soft-deactivated users with an IndexError in
add_missing_messages. Dry-run by default; pass --apply to delete them.
"""

    @override
    def add_arguments(self, parser: ArgumentParser) -> None:
        self.add_realm_args(parser, required=True)
        parser.add_argument(
            "--apply", action="store_true", help="Delete the orphaned subscriptions."
        )

    @override
    def handle(self, *args: Any, **options: Any) -> None:
        realm = self.get_realm(options)
        assert realm is not None

        orphaned = Subscription.objects.filter(
            user_profile__realm=realm, recipient__type=Recipient.STREAM
        ).exclude(Exists(Stream.objects.filter(id=OuterRef("recipient__type_id"))))

        with transaction.atomic(durable=True):
            count = orphaned.count()
            user_count = orphaned.values("user_profile_id").distinct().count()
            if options["apply"]:
                orphaned.delete()

        action = "Deleted" if options["apply"] else "Would delete"
        self.stdout.write(
            f"{action} {count} subscriptions of {user_count} users to nonexistent channels."
        )
        if not options["apply"]:
            self.stdout.write("Dry run: no changes made. Pass --apply to delete them.")
