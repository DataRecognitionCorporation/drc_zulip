from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower
from django.utils.timezone import now as timezone_now

from zerver.models.realms import Realm
from zerver.models.users import UserProfile


class ChannelFolder(models.Model):
    MAX_NAME_LENGTH = 60
    MAX_DESCRIPTION_LENGTH = 1024

    realm = models.ForeignKey(Realm, on_delete=models.CASCADE)
    name = models.CharField(max_length=MAX_NAME_LENGTH)
    description = models.CharField(max_length=MAX_DESCRIPTION_LENGTH, default="")
    rendered_description = models.TextField(default="")
    order = models.IntegerField(default=0)

    # Optional parent folder, enabling nested (multi-tier) channel folders.
    # SET_NULL means deleting a parent promotes its children to top-level
    # rather than deleting them. Nesting depth and cycle prevention are
    # enforced in the application layer (see zerver/actions/channel_folders.py),
    # not by the database.
    parent = models.ForeignKey(
        "self",
        null=True,
        on_delete=models.SET_NULL,
        related_name="children",
    )

    date_created = models.DateTimeField(default=timezone_now)
    creator = models.ForeignKey(UserProfile, null=True, on_delete=models.SET_NULL)
    is_archived = models.BooleanField(default=False)

    class Meta:
        constraints = [
            # Top-level folder names are unique within a realm. (A separate
            # constraint handles nested folders, because NULL parents compare
            # as distinct in SQL and so would not be caught by the per-parent
            # constraint below.)
            models.UniqueConstraint(
                Lower("name"),
                "realm",
                condition=Q(is_archived=False, parent__isnull=True),
                name="unique_realm_top_level_folder_name_when_not_archived",
            ),
            # Nested folder names are unique only among siblings (same parent),
            # so different branches of the folder tree can reuse a name.
            models.UniqueConstraint(
                Lower("name"),
                "realm",
                "parent",
                condition=Q(is_archived=False, parent__isnull=False),
                name="unique_realm_folder_name_per_parent_when_not_archived",
            ),
        ]
