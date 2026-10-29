from typing import Any

import orjson
from typing_extensions import override

from zerver.actions.channel_folders import (
    check_add_channel_folder,
    do_archive_channel_folder,
    try_reorder_realm_channel_folders,
)
from zerver.actions.streams import do_change_stream_folder, do_deactivate_stream
from zerver.lib.test_classes import ZulipTestCase
from zerver.models import ChannelFolder
from zerver.models.realms import Realm, get_realm
from zerver.models.streams import get_stream


class ChannelFoldersTestCase(ZulipTestCase):
    @override
    def setUp(self) -> None:
        super().setUp()
        zulip_realm = get_realm("zulip")
        iago = self.example_user("iago")
        desdemona = self.example_user("desdemona")
        lear_user = self.lear_user("cordelia")

        check_add_channel_folder(
            zulip_realm,
            "Frontend",
            "Channels for frontend discussions",
            acting_user=iago,
        )
        check_add_channel_folder(
            zulip_realm, "Backend", "Channels for **backend** discussions", acting_user=iago
        )
        check_add_channel_folder(
            zulip_realm, "Marketing", "Channels for marketing discussions", acting_user=desdemona
        )
        check_add_channel_folder(
            lear_user.realm, "Devops", "Channels for devops discussions", acting_user=lear_user
        )


class ChannelFolderCreationTest(ZulipTestCase):
    def test_creating_channel_folder(self) -> None:
        self.login("shiva")
        realm = get_realm("zulip")

        params = {"name": "Frontend", "description": ""}
        result = self.client_post("/json/channel_folders/create", params)
        self.assert_json_error(result, "Must be an organization administrator")

        self.login("iago")
        result = self.client_post("/json/channel_folders/create", params)
        self.assert_json_success(result)
        channel_folder = ChannelFolder.objects.filter(realm=realm).last()
        assert channel_folder is not None
        self.assertEqual(channel_folder.name, "Frontend")
        self.assertEqual(channel_folder.description, "")
        self.assertEqual(channel_folder.id, channel_folder.order)
        response = orjson.loads(result.content)
        self.assertEqual(response["channel_folder_id"], channel_folder.id)

    def test_creating_channel_folder_with_parent(self) -> None:
        self.login("iago")
        realm = get_realm("zulip")

        parent = check_add_channel_folder(
            realm, "Project", "", acting_user=self.example_user("iago")
        )

        params = {"name": "Subproject", "description": "", "parent_id": str(parent.id)}
        result = self.client_post("/json/channel_folders/create", params)
        self.assert_json_success(result)
        child = ChannelFolder.objects.get(realm=realm, name="Subproject")
        self.assertEqual(child.parent_id, parent.id)

        # A non-existent parent is rejected.
        params = {"name": "Orphan", "description": "", "parent_id": "9999"}
        result = self.client_post("/json/channel_folders/create", params)
        self.assert_json_error(result, "Invalid channel folder ID")
        self.login("iago")
        realm = get_realm("zulip")

        params = {"name": "Frontend", "description": ""}
        result = self.client_post("/json/channel_folders/create", params)
        self.assert_json_success(result)
        self.assertTrue(ChannelFolder.objects.filter(realm=realm, name="Frontend").exists())

        result = self.client_post("/json/channel_folders/create", params)
        self.assert_json_error(result, "Channel folder name already in use")

        # Archived folder names can be reused.
        folder = ChannelFolder.objects.get(name="Frontend", realm=realm)
        do_archive_channel_folder(folder, acting_user=self.example_user("iago"))

        result = self.client_post("/json/channel_folders/create", params)
        self.assert_json_success(result)
        self.assertTrue(ChannelFolder.objects.filter(realm=realm, name="Frontend").exists())

        # Folder names should be unique case-insensitively.
        params["name"] = "frontEND"
        result = self.client_post("/json/channel_folders/create", params)
        self.assert_json_error(result, "Channel folder name already in use")

    def test_rendered_description_for_channel_folder(self) -> None:
        self.login("iago")
        realm = get_realm("zulip")

        params = {"name": "Frontend", "description": "Channels for frontend discussions"}
        result = self.client_post("/json/channel_folders/create", params)
        self.assert_json_success(result)
        channel_folder = ChannelFolder.objects.get(realm=realm, name="Frontend")
        self.assertEqual(channel_folder.description, "Channels for frontend discussions")
        self.assertEqual(
            channel_folder.rendered_description, "<p>Channels for frontend discussions</p>"
        )

        params = {"name": "Backend", "description": "Channels for **backend** discussions"}
        result = self.client_post("/json/channel_folders/create", params)
        self.assert_json_success(result)
        channel_folder = ChannelFolder.objects.get(realm=realm, name="Backend")
        self.assertEqual(channel_folder.description, "Channels for **backend** discussions")
        self.assertEqual(
            channel_folder.rendered_description,
            "<p>Channels for <strong>backend</strong> discussions</p>",
        )

    def test_invalid_params_for_channel_folder(self) -> None:
        self.login("iago")

        params = {"name": "", "description": "Channels for frontend discussions"}
        result = self.client_post("/json/channel_folders/create", params)
        self.assert_json_error(result, "Channel folder name can't be empty.")

        invalid_name = "abc\000"
        params = {"name": invalid_name, "description": "Channels for frontend discussions"}
        result = self.client_post("/json/channel_folders/create", params)
        self.assert_json_error(result, "Invalid character in channel folder name, at position 4.")

        long_name = "a" * (ChannelFolder.MAX_NAME_LENGTH + 1)
        params = {"name": long_name, "description": "Channels for frontend discussions"}
        result = self.client_post("/json/channel_folders/create", params)
        self.assert_json_error(
            result, f"name is too long (limit: {ChannelFolder.MAX_NAME_LENGTH} characters)"
        )

        long_description = "a" * (ChannelFolder.MAX_DESCRIPTION_LENGTH + 1)
        params = {"name": "Frontend", "description": long_description}
        result = self.client_post("/json/channel_folders/create", params)
        self.assert_json_error(
            result,
            f"description is too long (limit: {ChannelFolder.MAX_DESCRIPTION_LENGTH} characters)",
        )


class GetChannelFoldersTest(ChannelFoldersTestCase):
    def test_get_channel_folders(self) -> None:
        iago = self.example_user("iago")
        desdemona = self.example_user("desdemona")
        zulip_realm = iago.realm
        frontend_folder = ChannelFolder.objects.get(name="Frontend", realm=zulip_realm)
        backend_folder = ChannelFolder.objects.get(name="Backend", realm=zulip_realm)
        marketing_folder = ChannelFolder.objects.get(name="Marketing", realm=zulip_realm)

        def check_channel_folders_in_zulip_realm(
            channel_folders: list[dict[str, Any]], marketing_folder_included: bool = True
        ) -> None:
            if marketing_folder_included:
                self.assert_length(channel_folders, 3)
            else:
                self.assert_length(channel_folders, 2)

            self.assertEqual(channel_folders[0]["id"], frontend_folder.id)
            self.assertEqual(channel_folders[0]["name"], "Frontend")
            self.assertEqual(channel_folders[0]["description"], "Channels for frontend discussions")
            self.assertEqual(
                channel_folders[0]["rendered_description"],
                "<p>Channels for frontend discussions</p>",
            )
            self.assertEqual(channel_folders[0]["is_archived"], frontend_folder.is_archived)
            self.assertEqual(channel_folders[0]["creator_id"], iago.id)
            self.assertEqual(channel_folders[0]["parent_id"], frontend_folder.parent_id)

            self.assertEqual(channel_folders[1]["id"], backend_folder.id)
            self.assertEqual(channel_folders[1]["name"], "Backend")
            self.assertEqual(
                channel_folders[1]["description"], "Channels for **backend** discussions"
            )
            self.assertEqual(
                channel_folders[1]["rendered_description"],
                "<p>Channels for <strong>backend</strong> discussions</p>",
            )
            self.assertEqual(channel_folders[1]["is_archived"], backend_folder.is_archived)
            self.assertEqual(channel_folders[1]["creator_id"], iago.id)

            if marketing_folder_included:
                self.assertEqual(channel_folders[2]["id"], marketing_folder.id)
                self.assertEqual(channel_folders[2]["name"], "Marketing")
                self.assertEqual(
                    channel_folders[2]["description"], "Channels for marketing discussions"
                )
                self.assertEqual(
                    channel_folders[2]["rendered_description"],
                    "<p>Channels for marketing discussions</p>",
                )
                self.assertEqual(channel_folders[2]["is_archived"], marketing_folder.is_archived)
                self.assertEqual(channel_folders[2]["creator_id"], desdemona.id)

        self.login("iago")
        result = self.client_get("/json/channel_folders")
        channel_folders_data = orjson.loads(result.content)["channel_folders"]
        check_channel_folders_in_zulip_realm(channel_folders_data)

        # Check member user can also see all channel folders.
        self.login("hamlet")
        result = self.client_get("/json/channel_folders")
        channel_folders_data = orjson.loads(result.content)["channel_folders"]
        check_channel_folders_in_zulip_realm(channel_folders_data)

        # Check guest can also see all channel folders.
        self.login("polonius")
        result = self.client_get("/json/channel_folders")
        channel_folders_data = orjson.loads(result.content)["channel_folders"]
        check_channel_folders_in_zulip_realm(channel_folders_data)

        marketing_folder.is_archived = True
        marketing_folder.save()

        result = self.client_get("/json/channel_folders")
        channel_folders_data = orjson.loads(result.content)["channel_folders"]
        check_channel_folders_in_zulip_realm(channel_folders_data, False)

        result = self.client_get(
            "/json/channel_folders", {"include_archived": orjson.dumps(True).decode()}
        )
        channel_folders_data = orjson.loads(result.content)["channel_folders"]
        check_channel_folders_in_zulip_realm(channel_folders_data)

    def test_get_channel_folders_according_to_order(self) -> None:
        iago = self.example_user("iago")
        realm = iago.realm
        self.login_user(iago)

        result = self.client_get("/json/channel_folders")
        channel_folders_data = orjson.loads(result.content)["channel_folders"]
        channel_folders_names = [item["name"] for item in channel_folders_data]
        self.assertEqual(channel_folders_names, ["Frontend", "Backend", "Marketing"])

        try_reorder_realm_channel_folders(
            realm, list(reversed([item["id"] for item in channel_folders_data]))
        )
        result = self.client_get("/json/channel_folders")
        channel_folders_data = orjson.loads(result.content)["channel_folders"]
        channel_folders_names = [item["name"] for item in channel_folders_data]
        self.assertEqual(channel_folders_names, ["Marketing", "Backend", "Frontend"])


class UpdateChannelFoldersTest(ChannelFoldersTestCase):
    def test_updating_channel_folder_name(self) -> None:
        realm = get_realm("zulip")
        channel_folder = ChannelFolder.objects.get(name="Frontend", realm=realm)
        channel_folder_id = channel_folder.id

        self.login("hamlet")

        params = {"name": "Web frontend"}
        result = self.client_patch(f"/json/channel_folders/{channel_folder_id}", params)
        self.assert_json_error(result, "Must be an organization administrator")

        self.login("iago")

        # Test invalid channel folder ID.
        result = self.client_patch("/json/channel_folders/999", params)
        self.assert_json_error(result, "Invalid channel folder ID")

        result = self.client_patch(f"/json/channel_folders/{channel_folder_id}", params)
        self.assert_json_success(result)
        channel_folder = ChannelFolder.objects.get(id=channel_folder_id)
        self.assertEqual(channel_folder.name, "Web frontend")

        params = {"name": ""}
        result = self.client_patch(f"/json/channel_folders/{channel_folder_id}", params)
        self.assert_json_error(result, "Channel folder name can't be empty.")

        params = {"name": "Backend"}
        result = self.client_patch(f"/json/channel_folders/{channel_folder_id}", params)
        self.assert_json_error(result, "Channel folder name already in use")

        # Folder names should be unique case-insensitively.
        params = {"name": "backEND"}
        result = self.client_patch(f"/json/channel_folders/{channel_folder_id}", params)
        self.assert_json_error(result, "Channel folder name already in use")

        invalid_name = "abc\000"
        params = {"name": invalid_name}
        result = self.client_patch(f"/json/channel_folders/{channel_folder_id}", params)
        self.assert_json_error(result, "Invalid character in channel folder name, at position 4.")

        long_name = "a" * (ChannelFolder.MAX_NAME_LENGTH + 1)
        params = {"name": long_name}
        result = self.client_patch(f"/json/channel_folders/{channel_folder_id}", params)
        self.assert_json_error(
            result, f"name is too long (limit: {ChannelFolder.MAX_NAME_LENGTH} characters)"
        )

    def test_updating_channel_folder_description(self) -> None:
        channel_folder = ChannelFolder.objects.get(name="Frontend", realm=get_realm("zulip"))
        channel_folder_id = channel_folder.id

        self.login("hamlet")

        params = {"description": "Channels for **frontend** discussions"}
        result = self.client_patch(f"/json/channel_folders/{channel_folder_id}", params)
        self.assert_json_error(result, "Must be an organization administrator")

        self.login("iago")

        # Test invalid channel folder ID.
        result = self.client_patch("/json/channel_folders/999", params)
        self.assert_json_error(result, "Invalid channel folder ID")

        result = self.client_patch(f"/json/channel_folders/{channel_folder_id}", params)
        self.assert_json_success(result)
        channel_folder = ChannelFolder.objects.get(id=channel_folder_id)
        self.assertEqual(channel_folder.description, "Channels for **frontend** discussions")
        self.assertEqual(
            channel_folder.rendered_description,
            "<p>Channels for <strong>frontend</strong> discussions</p>",
        )

        # Channel folder descriptions can be empty.
        params = {"description": ""}
        result = self.client_patch(f"/json/channel_folders/{channel_folder_id}", params)
        self.assert_json_success(result)
        channel_folder = ChannelFolder.objects.get(id=channel_folder_id)
        self.assertEqual(channel_folder.description, "")
        self.assertEqual(channel_folder.rendered_description, "")

        params = {"description": "a" * (ChannelFolder.MAX_DESCRIPTION_LENGTH + 1)}
        result = self.client_patch(f"/json/channel_folders/{channel_folder_id}", params)
        self.assert_json_error(
            result,
            f"description is too long (limit: {ChannelFolder.MAX_DESCRIPTION_LENGTH} characters)",
        )

    def test_archiving_and_unarchiving_channel_folder(self) -> None:
        desdemona = self.example_user("desdemona")
        realm = get_realm("zulip")
        channel_folder = ChannelFolder.objects.get(name="Frontend", realm=realm)
        channel_folder_id = channel_folder.id

        self.login("hamlet")

        params = {"is_archived": orjson.dumps(True).decode()}
        result = self.client_patch(f"/json/channel_folders/{channel_folder_id}", params)
        self.assert_json_error(result, "Must be an organization administrator")

        self.login("iago")

        # Test invalid channel folder ID.
        result = self.client_patch("/json/channel_folders/999", params)
        self.assert_json_error(result, "Invalid channel folder ID")

        result = self.client_patch(f"/json/channel_folders/{channel_folder_id}", params)
        self.assert_json_success(result)
        channel_folder = ChannelFolder.objects.get(id=channel_folder_id)
        self.assertTrue(channel_folder.is_archived)

        params = {"is_archived": orjson.dumps(False).decode()}
        result = self.client_patch(f"/json/channel_folders/{channel_folder_id}", params)
        self.assert_json_success(result)
        channel_folder = ChannelFolder.objects.get(id=channel_folder_id)
        self.assertFalse(channel_folder.is_archived)

        # Folder containing channels cannot be archived.
        stream = get_stream("Verona", realm)
        do_change_stream_folder(stream, channel_folder, acting_user=desdemona)
        params = {"is_archived": orjson.dumps(True).decode()}
        result = self.client_patch(f"/json/channel_folders/{channel_folder_id}", params)
        self.assert_json_error(
            result, "You need to remove all the channels from this folder to archive it."
        )

        do_deactivate_stream(stream, acting_user=desdemona)
        result = self.client_patch(f"/json/channel_folders/{channel_folder_id}", params)
        self.assert_json_error(
            result, "You need to remove all the channels from this folder to archive it."
        )

        do_change_stream_folder(stream, None, acting_user=desdemona)
        result = self.client_patch(f"/json/channel_folders/{channel_folder_id}", params)
        self.assert_json_success(result)
        channel_folder = ChannelFolder.objects.get(id=channel_folder_id)
        self.assertTrue(channel_folder.is_archived)


class NestedChannelFolderTest(ChannelFoldersTestCase):
    def test_set_change_and_clear_parent(self) -> None:
        realm = get_realm("zulip")
        self.login("iago")
        frontend = ChannelFolder.objects.get(name="Frontend", realm=realm)
        backend = ChannelFolder.objects.get(name="Backend", realm=realm)
        marketing = ChannelFolder.objects.get(name="Marketing", realm=realm)

        # Set a parent.
        params = {"parent_id": orjson.dumps(frontend.id).decode()}
        result = self.client_patch(f"/json/channel_folders/{backend.id}", params)
        self.assert_json_success(result)
        backend.refresh_from_db()
        self.assertEqual(backend.parent_id, frontend.id)

        # Change the parent to a different folder.
        params = {"parent_id": orjson.dumps(marketing.id).decode()}
        result = self.client_patch(f"/json/channel_folders/{backend.id}", params)
        self.assert_json_success(result)
        backend.refresh_from_db()
        self.assertEqual(backend.parent_id, marketing.id)

        # Clear the parent (back to top level) by passing null.
        params = {"parent_id": orjson.dumps(None).decode()}
        result = self.client_patch(f"/json/channel_folders/{backend.id}", params)
        self.assert_json_success(result)
        backend.refresh_from_db()
        self.assertIsNone(backend.parent_id)

    def test_cannot_be_its_own_parent(self) -> None:
        realm = get_realm("zulip")
        self.login("iago")
        frontend = ChannelFolder.objects.get(name="Frontend", realm=realm)

        params = {"parent_id": orjson.dumps(frontend.id).decode()}
        result = self.client_patch(f"/json/channel_folders/{frontend.id}", params)
        self.assert_json_error(result, "Channel folder cannot be its own parent.")

    def test_cannot_create_cycle(self) -> None:
        realm = get_realm("zulip")
        self.login("iago")
        frontend = ChannelFolder.objects.get(name="Frontend", realm=realm)
        backend = ChannelFolder.objects.get(name="Backend", realm=realm)

        # backend -> frontend
        params = {"parent_id": orjson.dumps(frontend.id).decode()}
        result = self.client_patch(f"/json/channel_folders/{backend.id}", params)
        self.assert_json_success(result)

        # frontend -> backend would create a cycle.
        params = {"parent_id": orjson.dumps(backend.id).decode()}
        result = self.client_patch(f"/json/channel_folders/{frontend.id}", params)
        self.assert_json_error(result, "Channel folder cannot be a descendant of itself.")

    def test_parent_must_be_in_same_realm(self) -> None:
        realm = get_realm("zulip")
        lear_realm = get_realm("lear")
        self.login("iago")
        frontend = ChannelFolder.objects.get(name="Frontend", realm=realm)
        devops = ChannelFolder.objects.get(name="Devops", realm=lear_realm)

        # A folder in another realm is looked up within the acting user's realm,
        # so it resolves as an invalid ID.
        params = {"parent_id": orjson.dumps(devops.id).decode()}
        result = self.client_patch(f"/json/channel_folders/{frontend.id}", params)
        self.assert_json_error(result, "Invalid channel folder ID")

    def test_nesting_depth_limit(self) -> None:
        realm = get_realm("zulip")
        iago = self.example_user("iago")
        self.login("iago")

        # Build a chain at the maximum depth: tier1 -> tier2 -> tier3.
        tier1 = check_add_channel_folder(realm, "Tier1", "", acting_user=iago)
        tier2 = check_add_channel_folder(realm, "Tier2", "", acting_user=iago, parent=tier1)
        tier3 = check_add_channel_folder(realm, "Tier3", "", acting_user=iago, parent=tier2)
        self.assertEqual(tier3.parent_id, tier2.id)

        # Creating a fourth tier under tier3 exceeds the limit.
        params = {"name": "Tier4", "description": "", "parent_id": str(tier3.id)}
        result = self.client_post("/json/channel_folders/create", params)
        self.assert_json_error(result, "Channel folders can be nested at most 3 levels deep.")

        # Moving an existing folder so that its subtree would exceed the limit
        # is also rejected: tier1 (subtree height 3) cannot be nested under another folder.
        other = check_add_channel_folder(realm, "Other", "", acting_user=iago)
        params = {"parent_id": orjson.dumps(other.id).decode()}
        result = self.client_patch(f"/json/channel_folders/{tier1.id}", params)
        self.assert_json_error(result, "Channel folders can be nested at most 3 levels deep.")

    def test_cannot_archive_folder_with_child_folders(self) -> None:
        realm = get_realm("zulip")
        iago = self.example_user("iago")
        self.login("iago")

        parent = check_add_channel_folder(realm, "Parent", "", acting_user=iago)
        check_add_channel_folder(realm, "Child", "", acting_user=iago, parent=parent)

        params = {"is_archived": orjson.dumps(True).decode()}
        result = self.client_patch(f"/json/channel_folders/{parent.id}", params)
        self.assert_json_error(
            result, "You need to remove all the channels from this folder to archive it."
        )


class ReorderChannelFolderTest(ChannelFoldersTestCase):
    def test_reorder(self) -> None:
        self.login("iago")
        realm = get_realm("zulip")
        order = list(
            ChannelFolder.objects.filter(realm=realm)
            .order_by("-order")
            .values_list("order", flat=True)
        )
        result = self.client_patch(
            "/json/channel_folders", info={"order": orjson.dumps(order).decode()}
        )
        self.assert_json_success(result)
        fields = ChannelFolder.objects.filter(realm=realm).order_by("order")
        for field in fields:
            self.assertEqual(field.id, order[field.order])

    def test_reorder_duplicates(self) -> None:
        self.login("iago")
        realm = get_realm("zulip")
        order = list(
            ChannelFolder.objects.filter(realm=realm)
            .order_by("-order")
            .values_list("order", flat=True)
        )
        frontend_folder = ChannelFolder.objects.get(name="Frontend", realm=realm)
        order.append(frontend_folder.id)
        result = self.client_patch(
            "/json/channel_folders", info={"order": orjson.dumps(order).decode()}
        )
        self.assert_json_success(result)
        fields = ChannelFolder.objects.filter(realm=realm).order_by("order")
        for field in fields:
            self.assertEqual(field.id, order[field.order])

    def test_reorder_unauthorized(self) -> None:
        self.login("hamlet")
        realm = get_realm("zulip")
        order = list(
            ChannelFolder.objects.filter(realm=realm)
            .order_by("-order")
            .values_list("order", flat=True)
        )
        result = self.client_patch(
            "/json/channel_folders", info={"order": orjson.dumps(order).decode()}
        )
        self.assert_json_error(result, "Must be an organization administrator")

    def test_reorder_invalid(self) -> None:
        self.login("iago")
        order = [100, 200, 300]
        result = self.client_patch(
            "/json/channel_folders", info={"order": orjson.dumps(order).decode()}
        )
        self.assert_json_error(result, "Invalid order mapping.")
        order = [1, 2]
        result = self.client_patch(
            "/json/channel_folders", info={"order": orjson.dumps(order).decode()}
        )
        self.assert_json_error(result, "Invalid order mapping.")


class AutoChannelFolderFromNameTest(ZulipTestCase):
    def get_folder(self, realm: Realm, name: str, parent: ChannelFolder | None) -> ChannelFolder:
        return ChannelFolder.objects.get(realm=realm, name=name, parent=parent, is_archived=False)

    def test_create_channel_auto_builds_folder_tree(self) -> None:
        from zerver.lib.streams import create_stream_if_needed

        iago = self.example_user("iago")
        realm = iago.realm

        stream, created = create_stream_if_needed(
            realm, "EAK120FT - G6E - Omar Vance - Supervisors", acting_user=iago
        )
        self.assertTrue(created)

        project = self.get_folder(realm, "EAK120FT", None)
        subproject = self.get_folder(realm, "G6E", project)
        identifier = self.get_folder(realm, "Omar Vance", subproject)

        # The channel is assigned to the leaf folder, and the folder chain is
        # linked parent -> child.
        self.assertEqual(stream.folder_id, identifier.id)
        self.assertIsNone(project.parent_id)
        self.assertEqual(subproject.parent_id, project.id)
        self.assertEqual(identifier.parent_id, subproject.id)

    def test_non_matching_names_are_not_foldered(self) -> None:
        from zerver.lib.streams import create_stream_if_needed

        iago = self.example_user("iago")
        realm = iago.realm

        # Fewer than four segments.
        stream, _ = create_stream_if_needed(realm, "EAK120FT - G6E - Omar Vance", acting_user=iago)
        self.assertIsNone(stream.folder_id)

        # More than four segments.
        stream, _ = create_stream_if_needed(realm, "a - b - c - d - e", acting_user=iago)
        self.assertIsNone(stream.folder_id)

        # No separator at all.
        stream, _ = create_stream_if_needed(realm, "general", acting_user=iago)
        self.assertIsNone(stream.folder_id)

        # An empty segment (note the doubled separator) does not match.
        stream, _ = create_stream_if_needed(realm, "a -  - c - d", acting_user=iago)
        self.assertIsNone(stream.folder_id)

        self.assertFalse(ChannelFolder.objects.filter(realm=realm).exists())

    def test_existing_folders_are_reused(self) -> None:
        from zerver.lib.streams import create_stream_if_needed

        iago = self.example_user("iago")
        realm = iago.realm

        create_stream_if_needed(
            realm, "EAK120FT - G6E - Omar Vance - Supervisors", acting_user=iago
        )
        folder_count = ChannelFolder.objects.filter(realm=realm).count()
        self.assertEqual(folder_count, 3)

        # A second channel sharing the first two tiers reuses those folders and
        # only creates the new leaf.
        create_stream_if_needed(realm, "EAK120FT - G6E - Rhea Dunn - Supervisors", acting_user=iago)
        self.assertEqual(ChannelFolder.objects.filter(realm=realm).count(), 4)
        self.assertEqual(ChannelFolder.objects.filter(realm=realm, name="EAK120FT").count(), 1)
        self.assertEqual(ChannelFolder.objects.filter(realm=realm, name="G6E").count(), 1)

    def test_same_leaf_name_under_different_parents(self) -> None:
        from zerver.lib.streams import create_stream_if_needed

        iago = self.example_user("iago")
        realm = iago.realm

        # Two channels whose folder paths end in a same-named tier under
        # different parents must both succeed (per-parent uniqueness).
        create_stream_if_needed(realm, "EAK120FT - G6E - Supervisors - All", acting_user=iago)
        create_stream_if_needed(realm, "EAK120FT - H2A - Supervisors - All", acting_user=iago)

        self.assertEqual(ChannelFolder.objects.filter(realm=realm, name="Supervisors").count(), 2)

    def test_rename_into_and_out_of_folder_pattern(self) -> None:
        from zerver.actions.streams import do_rename_stream
        from zerver.lib.streams import create_stream_if_needed

        iago = self.example_user("iago")
        realm = iago.realm

        stream, _ = create_stream_if_needed(realm, "plain channel", acting_user=iago)
        self.assertIsNone(stream.folder_id)

        # Renaming to a matching name moves the channel into the auto-built tree.
        do_rename_stream(stream, "EAK120FT - G6E - Omar Vance - Supervisors", iago)
        stream.refresh_from_db()
        identifier = self.get_folder(
            realm,
            "Omar Vance",
            self.get_folder(realm, "G6E", self.get_folder(realm, "EAK120FT", None)),
        )
        self.assertEqual(stream.folder_id, identifier.id)

        # Renaming to a non-matching name leaves the folder assignment as-is.
        do_rename_stream(stream, "just a name", iago)
        stream.refresh_from_db()
        self.assertEqual(stream.folder_id, identifier.id)
