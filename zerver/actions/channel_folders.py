from dataclasses import asdict

from django.db import transaction
from django.utils.timezone import now as timezone_now
from django.utils.translation import gettext as _

from zerver.lib.channel_folders import get_channel_folder_data, render_channel_folder_description
from zerver.lib.exceptions import JsonableError
from zerver.models import ChannelFolder, Realm, RealmAuditLog, UserProfile
from zerver.models.realm_audit_logs import AuditLogEventType
from zerver.models.users import active_user_ids
from zerver.tornado.django_api import send_event_on_commit


# Not durable: this runs standalone from the create-folder view, but is also
# called while auto-building a channel's folder tree inside the channel
# create/rename transactions, where a nested durable block is disallowed.
@transaction.atomic
def check_add_channel_folder(
    realm: Realm,
    name: str,
    description: str,
    *,
    acting_user: UserProfile,
    parent: ChannelFolder | None = None,
) -> ChannelFolder:
    rendered_description = render_channel_folder_description(
        description, realm, acting_user=acting_user
    )
    channel_folder = ChannelFolder.objects.create(
        realm=realm,
        name=name,
        description=description,
        rendered_description=rendered_description,
        creator_id=acting_user.id,
        parent=parent,
    )
    channel_folder.order = channel_folder.id
    channel_folder.save(update_fields=["order"])

    creation_time = timezone_now()
    RealmAuditLog.objects.create(
        realm=realm,
        acting_user=acting_user,
        event_type=AuditLogEventType.CHANNEL_FOLDER_CREATED,
        event_time=creation_time,
        modified_channel_folder=channel_folder,
    )

    event = dict(
        type="channel_folder",
        op="add",
        channel_folder=asdict(get_channel_folder_data(channel_folder)),
    )
    send_event_on_commit(realm, event, active_user_ids(realm.id))

    return channel_folder


@transaction.atomic(durable=True)
def try_reorder_realm_channel_folders(realm: Realm, order: list[int]) -> None:
    order_mapping = {_[1]: _[0] for _ in enumerate(order)}
    channel_folders = ChannelFolder.objects.filter(realm=realm)
    for channel_folder in channel_folders:
        if channel_folder.id not in order_mapping:
            raise JsonableError(_("Invalid order mapping."))
    for channel_folder in channel_folders:
        channel_folder.order = order_mapping[channel_folder.id]
        channel_folder.save(update_fields=["order"])

    event = dict(
        type="channel_folder",
        op="reorder",
        order=order,
    )
    send_event_on_commit(realm, event, active_user_ids(realm.id))


def do_send_channel_folder_update_event(
    channel_folder: ChannelFolder, data: dict[str, str | bool | int | None]
) -> None:
    realm = channel_folder.realm
    event = dict(type="channel_folder", op="update", channel_folder_id=channel_folder.id, data=data)
    send_event_on_commit(realm, event, active_user_ids(realm.id))


@transaction.atomic(durable=True)
def do_change_channel_folder_name(
    channel_folder: ChannelFolder, name: str, *, acting_user: UserProfile
) -> None:
    old_value = channel_folder.name
    channel_folder.name = name
    channel_folder.save(update_fields=["name"])

    RealmAuditLog.objects.create(
        realm=acting_user.realm,
        acting_user=acting_user,
        event_type=AuditLogEventType.CHANNEL_FOLDER_NAME_CHANGED,
        event_time=timezone_now(),
        modified_channel_folder=channel_folder,
        extra_data={
            RealmAuditLog.OLD_VALUE: old_value,
            RealmAuditLog.NEW_VALUE: name,
        },
    )

    do_send_channel_folder_update_event(channel_folder, dict(name=name))


@transaction.atomic(durable=True)
def do_change_channel_folder_description(
    channel_folder: ChannelFolder, description: str, *, acting_user: UserProfile
) -> None:
    old_value = channel_folder.description
    rendered_description = render_channel_folder_description(
        description, acting_user.realm, acting_user=acting_user
    )
    channel_folder.description = description
    channel_folder.rendered_description = rendered_description
    channel_folder.save(update_fields=["description", "rendered_description"])

    RealmAuditLog.objects.create(
        realm=acting_user.realm,
        acting_user=acting_user,
        event_type=AuditLogEventType.CHANNEL_FOLDER_DESCRIPTION_CHANGED,
        event_time=timezone_now(),
        modified_channel_folder=channel_folder,
        extra_data={
            RealmAuditLog.OLD_VALUE: old_value,
            RealmAuditLog.NEW_VALUE: description,
        },
    )

    do_send_channel_folder_update_event(
        channel_folder, dict(description=description, rendered_description=rendered_description)
    )


@transaction.atomic(durable=True)
def do_change_channel_folder_parent(
    channel_folder: ChannelFolder, parent: ChannelFolder | None, *, acting_user: UserProfile
) -> None:
    old_value = channel_folder.parent_id
    channel_folder.parent = parent
    channel_folder.save(update_fields=["parent"])

    RealmAuditLog.objects.create(
        realm=acting_user.realm,
        acting_user=acting_user,
        event_type=AuditLogEventType.CHANNEL_FOLDER_PARENT_CHANGED,
        event_time=timezone_now(),
        modified_channel_folder=channel_folder,
        extra_data={
            RealmAuditLog.OLD_VALUE: old_value,
            RealmAuditLog.NEW_VALUE: parent.id if parent is not None else None,
        },
    )

    do_send_channel_folder_update_event(channel_folder, dict(parent_id=channel_folder.parent_id))


@transaction.atomic(durable=True)
def do_archive_channel_folder(channel_folder: ChannelFolder, *, acting_user: UserProfile) -> None:
    channel_folder.is_archived = True
    channel_folder.save(update_fields=["is_archived"])

    RealmAuditLog.objects.create(
        realm=acting_user.realm,
        acting_user=acting_user,
        event_type=AuditLogEventType.CHANNEL_FOLDER_ARCHIVED,
        event_time=timezone_now(),
        modified_channel_folder=channel_folder,
    )

    do_send_channel_folder_update_event(channel_folder, dict(is_archived=True))


@transaction.atomic(durable=True)
def do_unarchive_channel_folder(channel_folder: ChannelFolder, *, acting_user: UserProfile) -> None:
    channel_folder.is_archived = False
    channel_folder.save(update_fields=["is_archived"])

    RealmAuditLog.objects.create(
        realm=acting_user.realm,
        acting_user=acting_user,
        event_type=AuditLogEventType.CHANNEL_FOLDER_UNARCHIVED,
        event_time=timezone_now(),
        modified_channel_folder=channel_folder,
    )

    do_send_channel_folder_update_event(channel_folder, dict(is_archived=False))



# DRC channel-folder naming convention. A channel named exactly
# "A - B - C - D" (four non-empty segments separated by " - ") is organized
# into a three-tier folder path A > B > C, with the channel placed in the
# leaf folder C. Any other name is left as an ordinary channel and is never
# auto-foldered.
CHANNEL_FOLDER_NAME_SEPARATOR = " - "
CHANNEL_FOLDER_NAME_SEGMENT_COUNT = 4


def parse_auto_channel_folder_path(name: str) -> list[str] | None:
    """Return the three folder-path segments for a channel name that matches
    the DRC convention, or None if the name does not match it exactly."""
    segments = [segment.strip() for segment in name.split(CHANNEL_FOLDER_NAME_SEPARATOR)]
    if len(segments) != CHANNEL_FOLDER_NAME_SEGMENT_COUNT:
        return None
    if any(segment == "" for segment in segments):
        return None
    # Drop the final segment (the channel's own label); the rest is the
    # folder path.
    return segments[:-1]


def get_or_create_channel_folder_by_name(
    realm: Realm, name: str, parent: ChannelFolder | None, *, acting_user: UserProfile
) -> ChannelFolder:
    existing = ChannelFolder.objects.filter(
        realm=realm, name__iexact=name, parent=parent, is_archived=False
    ).first()
    if existing is not None:
        return existing
    return check_add_channel_folder(realm, name, "", acting_user=acting_user, parent=parent)


def resolve_auto_channel_folder(
    realm: Realm, name: str, *, acting_user: UserProfile
) -> ChannelFolder | None:
    """For a channel name matching the DRC "A - B - C - D" convention,
    find-or-create the A > B > C folder chain and return the leaf folder C.
    Returns None for any name that does not match the convention, so ordinary
    channels are never auto-foldered."""
    folder_path = parse_auto_channel_folder_path(name)
    if folder_path is None:
        return None

    parent: ChannelFolder | None = None
    for folder_name in folder_path:
        parent = get_or_create_channel_folder_by_name(
            realm, folder_name, parent, acting_user=acting_user
        )
    return parent
