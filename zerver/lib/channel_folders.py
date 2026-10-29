from dataclasses import dataclass

from django.utils.translation import gettext as _

from zerver.lib.exceptions import JsonableError
from zerver.lib.markdown import markdown_convert
from zerver.lib.streams import get_web_public_streams_queryset
from zerver.lib.string_validation import check_string_is_printable
from zerver.lib.timestamp import datetime_to_timestamp
from zerver.models import ChannelFolder, Realm, Stream, UserProfile


@dataclass
class ChannelFolderData:
    id: int
    name: str
    description: str
    rendered_description: str
    order: int
    creator_id: int | None
    date_created: int
    is_archived: bool
    parent_id: int | None


def check_channel_folder_name(name: str, realm: Realm) -> None:
    if name.strip() == "":
        raise JsonableError(_("Channel folder name can't be empty."))

    invalid_character_pos = check_string_is_printable(name)
    if invalid_character_pos is not None:
        raise JsonableError(
            _("Invalid character in channel folder name, at position {position}.").format(
                position=invalid_character_pos
            )
        )

    if ChannelFolder.objects.filter(name__iexact=name, realm=realm, is_archived=False).exists():
        raise JsonableError(_("Channel folder name already in use"))


def render_channel_folder_description(text: str, realm: Realm, *, acting_user: UserProfile) -> str:
    return markdown_convert(
        text, message_realm=realm, no_previews=True, acting_user=acting_user
    ).rendered_content


# Maximum number of folder tiers, counting the root as tier 1. The DRC channel
# organization uses three tiers (project -> subproject -> identifier), so a
# folder at the deepest tier may have a parent chain of at most this length.
MAX_CHANNEL_FOLDER_NESTING_DEPTH = 3


def get_channel_folder_depth(channel_folder: ChannelFolder) -> int:
    """Return the tier of this folder, 1 for a top-level (parentless) folder."""
    depth = 1
    ancestor = channel_folder.parent
    while ancestor is not None:
        depth += 1
        ancestor = ancestor.parent
    return depth


def check_channel_folder_parent(
    channel_folder: ChannelFolder, parent: ChannelFolder | None
) -> None:
    """Validate that `parent` may be set as the parent of an existing `channel_folder`.

    Guards against: using a folder from another realm, a folder as its own
    parent, cycles (making a folder a descendant of itself), and exceeding the
    maximum nesting depth.
    """
    if parent is None:
        return

    if parent.realm_id != channel_folder.realm_id:
        raise JsonableError(_("Invalid channel folder ID"))

    if parent.id == channel_folder.id:
        raise JsonableError(_("Channel folder cannot be its own parent."))

    # Walk the prospective parent's ancestor chain. If we encounter
    # channel_folder, setting this parent would create a cycle. While walking,
    # also measure the ancestor chain length to enforce the depth limit.
    ancestor_depth = 1
    ancestor: ChannelFolder | None = parent
    while ancestor is not None:
        if ancestor.id == channel_folder.id:
            raise JsonableError(_("Channel folder cannot be a descendant of itself."))
        ancestor_depth += 1
        ancestor = ancestor.parent

    # ancestor_depth is the tier the folder itself would occupy under `parent`.
    # Any existing subtree beneath channel_folder is pushed down by the same
    # amount, so account for the folder's own subtree height too.
    subtree_height = get_channel_folder_subtree_height(channel_folder)
    if ancestor_depth + subtree_height - 1 > MAX_CHANNEL_FOLDER_NESTING_DEPTH:
        raise JsonableError(
            _("Channel folders can be nested at most {max_depth} levels deep.").format(
                max_depth=MAX_CHANNEL_FOLDER_NESTING_DEPTH
            )
        )


def check_channel_folder_parent_for_new_folder(parent: ChannelFolder) -> None:
    """Validate that a brand-new (leaf) folder may be created under `parent`.

    The caller is responsible for confirming `parent` belongs to the right
    realm (e.g. via get_channel_folder_by_id). A new folder is a leaf, so only
    the parent's own depth matters for the nesting limit.
    """
    if get_channel_folder_depth(parent) + 1 > MAX_CHANNEL_FOLDER_NESTING_DEPTH:
        raise JsonableError(
            _("Channel folders can be nested at most {max_depth} levels deep.").format(
                max_depth=MAX_CHANNEL_FOLDER_NESTING_DEPTH
            )
        )


def get_channel_folder_subtree_height(channel_folder: ChannelFolder) -> int:
    """Return the height of the subtree rooted at this folder (1 if it has no children)."""
    children = list(channel_folder.children.all())
    if not children:
        return 1
    return 1 + max(get_channel_folder_subtree_height(child) for child in children)


def get_channel_folder_data(channel_folder: ChannelFolder) -> ChannelFolderData:
    date_created = datetime_to_timestamp(channel_folder.date_created)
    return ChannelFolderData(
        id=channel_folder.id,
        name=channel_folder.name,
        description=channel_folder.description,
        rendered_description=channel_folder.rendered_description,
        order=channel_folder.order,
        date_created=date_created,
        creator_id=channel_folder.creator_id,
        is_archived=channel_folder.is_archived,
        parent_id=channel_folder.parent_id,
    )


def get_channel_folders_in_realm(
    realm: Realm, include_archived: bool = False
) -> list[ChannelFolderData]:
    folders = ChannelFolder.objects.filter(realm=realm)
    if not include_archived:
        folders = folders.exclude(is_archived=True)

    channel_folders = [get_channel_folder_data(channel_folder) for channel_folder in folders]
    return sorted(channel_folders, key=lambda folder: folder.order)


def get_channel_folder_by_id(channel_folder_id: int, realm: Realm) -> ChannelFolder:
    try:
        channel_folder = ChannelFolder.objects.get(id=channel_folder_id, realm=realm)
        return channel_folder
    except ChannelFolder.DoesNotExist:
        raise JsonableError(_("Invalid channel folder ID"))


def get_channel_folders_for_spectators(realm: Realm) -> list[ChannelFolderData]:
    folder_ids_for_web_public_streams = set(
        get_web_public_streams_queryset(realm).values_list("folder_id", flat=True)
    )
    folders = ChannelFolder.objects.filter(id__in=folder_ids_for_web_public_streams)
    channel_folders = [get_channel_folder_data(channel_folder) for channel_folder in folders]
    return sorted(channel_folders, key=lambda folder: folder.id)


def check_channel_folder_in_use(channel_folder: ChannelFolder) -> bool:
    if Stream.objects.filter(folder=channel_folder).exists():
        return True
    if channel_folder.children.filter(is_archived=False).exists():
        return True
    return False
