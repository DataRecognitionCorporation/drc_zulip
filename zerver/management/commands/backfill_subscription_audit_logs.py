from argparse import ArgumentParser
from typing import Any

from django.db import transaction
from django.db.models import Max, Min
from django.utils.timezone import now as timezone_now
from typing_extensions import override

from zerver.lib.management import ZulipBaseCommand
from zerver.lib.message import get_last_message_id
from zerver.models import RealmAuditLog, Stream, Subscription, UserMessage
from zerver.models.realm_audit_logs import AuditLogEventType


class Command(ZulipBaseCommand):
    help = """Backfill missing channel subscription audit history for an organization.

Dry-run by default; pass --apply to write audit events. This follows migration
0450: infer subscription boundaries from received messages, or use the current
message boundary when no messages were received. These conservative estimates
may omit older messages; they cannot reconstruct exact subscription history.
Existing subscription audit histories are never changed. Users are not
reactivated by this command.
"""

    @override
    def add_arguments(self, parser: ArgumentParser) -> None:
        self.add_realm_args(parser, required=True)
        parser.add_argument(
            "--apply", action="store_true", help="Write the proposed backfilled audit events."
        )

    @override
    def handle(self, *args: Any, **options: Any) -> None:
        realm = self.get_realm(options)
        assert realm is not None
        apply = options["apply"]
        subscription_count = 0
        event_count = 0
        no_messages_count = 0
        events = [
            AuditLogEventType.SUBSCRIPTION_CREATED,
            AuditLogEventType.SUBSCRIPTION_ACTIVATED,
            AuditLogEventType.SUBSCRIPTION_DEACTIVATED,
        ]

        for stream in (
            Stream.objects.filter(realm=realm, recipient__isnull=False).order_by("id").iterator()
        ):
            recipient_id = stream.recipient_id
            assert recipient_id is not None
            with transaction.atomic(durable=True):
                subscriptions = Subscription.objects.filter(recipient_id=recipient_id).order_by(
                    "id"
                )
                if apply:
                    # Subscription updates take this lock before writing their audit events.
                    subscriptions = subscriptions.select_for_update(no_key=True)
                subs = list(subscriptions)
                user_ids_with_history = set(
                    RealmAuditLog.objects.filter(
                        realm=realm,
                        modified_stream=stream,
                        event_type__in=events,
                    ).values_list("modified_user_id", flat=True)
                )
                missing = [sub for sub in subs if sub.user_profile_id not in user_ids_with_history]
                if not missing:
                    continue

                last_message_id = get_last_message_id()
                now = timezone_now()
                backfills = []
                for sub in missing:
                    received = UserMessage.objects.filter(
                        user_profile_id=sub.user_profile_id,
                        message__recipient_id=recipient_id,
                    ).aggregate(
                        first_id=Min("message_id"),
                        first_date=Min("message__date_sent"),
                        last_id=Max("message_id"),
                        last_date=Max("message__date_sent"),
                    )
                    first_id = received["first_id"]
                    boundary = first_id - 1 if first_id is not None else last_message_id
                    backfills.append(
                        RealmAuditLog(
                            realm=realm,
                            modified_user_id=sub.user_profile_id,
                            modified_stream=stream,
                            event_type=AuditLogEventType.SUBSCRIPTION_CREATED,
                            event_last_message_id=boundary,
                            event_time=received["first_date"] or now,
                            backfilled=True,
                        )
                    )
                    if not sub.active:
                        backfills.append(
                            RealmAuditLog(
                                realm=realm,
                                modified_user_id=sub.user_profile_id,
                                modified_stream=stream,
                                event_type=AuditLogEventType.SUBSCRIPTION_DEACTIVATED,
                                event_last_message_id=(
                                    received["last_id"]
                                    if received["last_id"] is not None
                                    else last_message_id
                                ),
                                event_time=received["last_date"] or now,
                                backfilled=True,
                            )
                        )
                    if first_id is None:
                        no_messages_count += 1
                    self.stdout.write(
                        f"User {sub.user_profile_id}, channel {stream.id}: "
                        f"active={sub.active}, subscription boundary={boundary}"
                        + (" (no received messages)" if first_id is None else "")
                    )

                if apply:
                    RealmAuditLog.objects.bulk_create(backfills)
                subscription_count += len(missing)
                event_count += len(backfills)

        action = "Backfilled" if apply else "Would backfill"
        self.stdout.write(
            f"{action} {event_count} audit events for {subscription_count} subscriptions."
        )
        if no_messages_count:
            self.stdout.write(
                f"WARNING: {no_messages_count} subscriptions have no received messages; "
                "their backfills start at the current message boundary and omit older messages."
            )
        if not apply:
            self.stdout.write("Dry run: no changes made. Pass --apply to write these events.")
