from typing import Any

from django.db import migrations
from django.db.backends.base.schema import BaseDatabaseSchemaEditor
from django.db.migrations.state import StateApps

# DRC channel-folder naming convention, kept in sync with
# zerver/actions/channel_folders.py. A channel named exactly "A - B - C - D"
# (four non-empty " - "-separated segments) belongs in the three-tier folder
# path A > B > C, with the channel placed in the leaf folder C.
CHANNEL_FOLDER_NAME_SEPARATOR = " - "
CHANNEL_FOLDER_NAME_SEGMENT_COUNT = 4


def parse_auto_channel_folder_path(name: str) -> list[str] | None:
    """Return the folder-path segments (A, B, C) for a channel name that
    matches the DRC convention, or None if it does not match exactly."""
    segments = [segment.strip() for segment in name.split(CHANNEL_FOLDER_NAME_SEPARATOR)]
    if len(segments) != CHANNEL_FOLDER_NAME_SEGMENT_COUNT:
        return None
    if any(segment == "" for segment in segments):
        return None
    # Drop the final segment (the channel's own label); the rest is the
    # folder path.
    return segments[:-1]


def backfill_auto_channel_folders(
    apps: StateApps, schema_editor: BaseDatabaseSchemaEditor
) -> None:
    """Retroactively organize existing channels into auto-built folder trees.

    The name-based auto-foldering feature (PAS-484) only runs on channel
    create and rename, so channels that already matched the "A - B - C - D"
    convention before the feature shipped were never foldered. Walk every
    active, unfoldered channel whose name matches the convention and move it
    into the reused-or-created A > B > C folder chain, mirroring
    resolve_auto_channel_folder() but at the migration-model level (no audit
    logs or client events).
    """
    Stream = apps.get_model("zerver", "Stream")
    ChannelFolder = apps.get_model("zerver", "ChannelFolder")

    # Only active channels without a folder are candidates; a channel already
    # placed in a folder (manually or by the live auto-folder code) is left
    # alone. Order by id so folder `order` values are assigned deterministically.
    candidate_streams = Stream.objects.filter(
        deactivated=False, folder__isnull=True
    ).order_by("realm_id", "id")

    # Per-realm cache of (realm id, lowercased folder name, parent id or None)
    # -> folder, so sibling channels reuse the same folder within this run.
    folders_by_key: dict[tuple[int, str, int | None], Any] = {}

    def get_or_create_folder(realm_id: int, name: str, parent: Any | None) -> Any:
        parent_id = parent.id if parent is not None else None
        key = (realm_id, name.lower(), parent_id)
        cached = folders_by_key.get(key)
        if cached is not None:
            return cached

        existing = ChannelFolder.objects.filter(
            realm_id=realm_id,
            name__iexact=name,
            parent_id=parent_id,
            is_archived=False,
        ).first()
        if existing is None:
            existing = ChannelFolder.objects.create(
                realm_id=realm_id,
                name=name,
                description="",
                rendered_description="",
                parent_id=parent_id,
                creator=None,
                is_archived=False,
            )
            # Match check_add_channel_folder: order defaults to the row id.
            existing.order = existing.id
            existing.save(update_fields=["order"])

        folders_by_key[key] = existing
        return existing

    moved = 0
    for stream in candidate_streams:
        folder_path = parse_auto_channel_folder_path(stream.name)
        if folder_path is None:
            continue

        parent: Any | None = None
        for folder_name in folder_path:
            parent = get_or_create_folder(stream.realm_id, folder_name, parent)

        stream.folder = parent
        stream.save(update_fields=["folder"])
        moved += 1
        print(
            f"Auto-foldered channel id={stream.id} realm_id={stream.realm_id} "
            f"name={stream.name!r} -> folder id={parent.id}"
        )

    if moved:
        print(f"Auto-foldered {moved} existing channel(s).")


class Migration(migrations.Migration):
    dependencies = [
        ("zerver", "0803_remove_channelfolder_unique_realm_folder_name_when_not_archived_and_more"),
    ]

    operations = [
        migrations.RunPython(
            backfill_auto_channel_folders,
            reverse_code=migrations.RunPython.noop,
            elidable=False,
        ),
    ]
