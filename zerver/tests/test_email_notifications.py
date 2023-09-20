import tempfile
from datetime import datetime, timedelta, timezone
<<<<<<< HEAD
from email.headerregistry import Address
from typing import List, Optional, Sequence, Union
from unittest import mock
=======
from typing import Dict
>>>>>>> drc_main
from unittest.mock import patch

import ldap
import orjson
from django.core import mail
from django.core.mail.message import EmailMultiAlternatives
from django.test import override_settings
from django.utils.timezone import now as timezone_now
from django_auth_ldap.config import LDAPSearch
from django_stubs_ext import StrPromise

from zerver.actions.users import do_change_user_role
from zerver.lib.email_notifications import (
    enqueue_welcome_emails,
    get_onboarding_email_schedule,
    send_account_registered_email,
)
from zerver.lib.send_email import deliver_scheduled_emails, send_custom_email
from zerver.lib.test_classes import ZulipTestCase
from zerver.models import Realm, ScheduledEmail, UserProfile, get_realm


class TestCustomEmails(ZulipTestCase):
    def test_send_custom_email_argument(self) -> None:
        hamlet = self.example_user("hamlet")
        email_subject = "subject_test"
        reply_to = "reply_to_test"
        from_name = "from_name_test"

        with tempfile.NamedTemporaryFile() as markdown_template:
            markdown_template.write(b"# Some heading\n\nSome content\n{{ realm_name }}")
            markdown_template.flush()
            send_custom_email(
                UserProfile.objects.filter(id=hamlet.id),
                options={
                    "markdown_template_path": markdown_template.name,
                    "reply_to": reply_to,
                    "subject": email_subject,
                    "from_name": from_name,
                    "dry_run": False,
                },
            )
        self.assert_length(mail.outbox, 1)
        msg = mail.outbox[0]
        self.assertEqual(msg.subject, email_subject)
        self.assert_length(msg.reply_to, 1)
        self.assertEqual(msg.reply_to[0], reply_to)
        self.assertNotIn("{% block content %}", msg.body)
        self.assertIn("# Some heading", msg.body)
        self.assertIn("Zulip Dev", msg.body)
        self.assertNotIn("{{ realm_name }}", msg.body)
        self.assertNotIn("</div>", msg.body)

        assert isinstance(msg, EmailMultiAlternatives)
        self.assertIn("Some heading</h1>", str(msg.alternatives[0][0]))
        self.assertNotIn("{{ realm_name }}", str(msg.alternatives[0][0]))

    def test_send_custom_email_remote_server(self) -> None:
        email_subject = "subject_test"
        reply_to = "reply_to_test"
        from_name = "from_name_test"
        contact_email = "zulip-admin@example.com"
        markdown_template_path = "templates/corporate/policies/index.md"
        send_custom_email(
            UserProfile.objects.none(),
            target_emails=[contact_email],
            options={
                "markdown_template_path": markdown_template_path,
                "reply_to": reply_to,
                "subject": email_subject,
                "from_name": from_name,
                "dry_run": False,
            },
        )
        self.assert_length(mail.outbox, 1)
        msg = mail.outbox[0]
        self.assertEqual(msg.subject, email_subject)
        self.assertEqual(msg.to, [contact_email])
        self.assert_length(msg.reply_to, 1)
        self.assertEqual(msg.reply_to[0], reply_to)
        self.assertNotIn("{% block content %}", msg.body)
        # Verify that the HTML version contains the footer.
        assert isinstance(msg, EmailMultiAlternatives)
        self.assertIn(
            "You are receiving this email to update you about important changes to Zulip",
            str(msg.alternatives[0][0]),
        )

    def test_send_custom_email_headers(self) -> None:
        hamlet = self.example_user("hamlet")
        markdown_template_path = (
            "zerver/tests/fixtures/email/custom_emails/email_base_headers_test.md"
        )
        send_custom_email(
            UserProfile.objects.filter(id=hamlet.id),
            options={
                "markdown_template_path": markdown_template_path,
                "dry_run": False,
            },
        )
        self.assert_length(mail.outbox, 1)
        msg = mail.outbox[0]
        self.assertEqual(msg.subject, "Test subject")
        self.assertFalse(msg.reply_to)
        self.assertEqual("Test body", msg.body)

    def test_send_custom_email_context(self) -> None:
        hamlet = self.example_user("hamlet")
        markdown_template_path = (
            "zerver/tests/fixtures/email/custom_emails/email_base_headers_test.md"
        )
        send_custom_email(
            UserProfile.objects.filter(id=hamlet.id),
            options={
                "markdown_template_path": markdown_template_path,
                "dry_run": False,
            },
        )
        self.assert_length(mail.outbox, 1)
        msg = mail.outbox[0]

        # We default to not including an unsubscribe link in the headers
        self.assertEqual(msg.extra_headers.get("X-Auto-Response-Suppress"), "All")
        self.assertIsNone(msg.extra_headers.get("List-Unsubscribe"))

        mail.outbox = []
        markdown_template_path = (
            "zerver/tests/fixtures/email/custom_emails/email_base_headers_custom_test.md"
        )

        def add_context(context: Dict[str, object], user: UserProfile) -> None:
            context["unsubscribe_link"] = "some@email"
            context["custom"] = str(user.id)

        send_custom_email(
            UserProfile.objects.filter(id=hamlet.id),
            options={
                "markdown_template_path": markdown_template_path,
                "dry_run": False,
            },
            add_context=add_context,
        )
        self.assert_length(mail.outbox, 1)
        msg = mail.outbox[0]
        self.assertEqual(msg.extra_headers.get("X-Auto-Response-Suppress"), "All")
        self.assertEqual(msg.extra_headers.get("List-Unsubscribe"), "<some@email>")
        self.assertIn(f"Test body with {hamlet.id} value", msg.body)

    def test_send_custom_email_no_argument(self) -> None:
        hamlet = self.example_user("hamlet")
        from_name = "from_name_test"
        email_subject = "subject_test"
        markdown_template_path = (
            "zerver/tests/fixtures/email/custom_emails/email_base_headers_no_headers_test.md"
        )

        from zerver.lib.send_email import NoEmailArgumentError

        self.assertRaises(
            NoEmailArgumentError,
            send_custom_email,
            UserProfile.objects.filter(id=hamlet.id),
            options={
                "markdown_template_path": markdown_template_path,
                "from_name": from_name,
                "dry_run": False,
            },
        )

        self.assertRaises(
            NoEmailArgumentError,
            send_custom_email,
            UserProfile.objects.filter(id=hamlet.id),
            options={
                "markdown_template_path": markdown_template_path,
                "subject": email_subject,
                "dry_run": False,
            },
        )

    def test_send_custom_email_doubled_arguments(self) -> None:
        hamlet = self.example_user("hamlet")
        from_name = "from_name_test"
        email_subject = "subject_test"
        markdown_template_path = (
            "zerver/tests/fixtures/email/custom_emails/email_base_headers_test.md"
        )

        from zerver.lib.send_email import DoubledEmailArgumentError

        self.assertRaises(
            DoubledEmailArgumentError,
            send_custom_email,
            UserProfile.objects.filter(id=hamlet.id),
            options={
                "markdown_template_path": markdown_template_path,
                "subject": email_subject,
                "dry_run": False,
            },
        )

        self.assertRaises(
            DoubledEmailArgumentError,
            send_custom_email,
            UserProfile.objects.filter(id=hamlet.id),
            options={
                "markdown_template_path": markdown_template_path,
                "from_name": from_name,
                "dry_run": False,
            },
        )

    def test_send_custom_email_admins_only(self) -> None:
        admin_user = self.example_user("hamlet")
        do_change_user_role(admin_user, UserProfile.ROLE_REALM_ADMINISTRATOR, acting_user=None)

        non_admin_user = self.example_user("cordelia")

        markdown_template_path = (
            "zerver/tests/fixtures/email/custom_emails/email_base_headers_test.md"
        )
        send_custom_email(
            UserProfile.objects.filter(id__in=(admin_user.id, non_admin_user.id)),
            options={
                "markdown_template_path": markdown_template_path,
                "admins_only": True,
                "dry_run": False,
            },
        )
        self.assert_length(mail.outbox, 1)
        self.assertIn(admin_user.delivery_email, mail.outbox[0].to[0])

    def test_send_custom_email_dry_run(self) -> None:
        hamlet = self.example_user("hamlet")
        email_subject = "subject_test"
        reply_to = "reply_to_test"
        from_name = "from_name_test"
        markdown_template_path = "templates/zerver/tests/markdown/test_nested_code_blocks.md"
        with patch("builtins.print") as _:
            send_custom_email(
                UserProfile.objects.filter(id=hamlet.id),
                options={
                    "markdown_template_path": markdown_template_path,
                    "reply_to": reply_to,
                    "subject": email_subject,
                    "from_name": from_name,
                    "dry_run": True,
                },
            )
            self.assert_length(mail.outbox, 0)


class TestFollowupEmails(ZulipTestCase):
    def test_day1_email_context(self) -> None:
        hamlet = self.example_user("hamlet")
        send_account_registered_email(hamlet)
        scheduled_emails = ScheduledEmail.objects.filter(users=hamlet).order_by(
            "scheduled_timestamp"
        )
        email_data = orjson.loads(scheduled_emails[0].data)
        self.assertEqual(email_data["context"]["email"], self.example_email("hamlet"))
        self.assertEqual(email_data["context"]["is_realm_admin"], False)
        self.assertEqual(
            email_data["context"]["getting_user_started_link"],
            "http://zulip.testserver/help/getting-started-with-zulip",
        )
        self.assertNotIn("ldap_username", email_data["context"])

        ScheduledEmail.objects.all().delete()

        iago = self.example_user("iago")
        send_account_registered_email(iago)
        scheduled_emails = ScheduledEmail.objects.filter(users=iago).order_by("scheduled_timestamp")
        email_data = orjson.loads(scheduled_emails[0].data)
        self.assertEqual(email_data["context"]["email"], self.example_email("iago"))
        self.assertEqual(email_data["context"]["is_realm_admin"], True)
        self.assertEqual(
            email_data["context"]["getting_organization_started_link"],
            "http://zulip.testserver/help/getting-your-organization-started-with-zulip",
        )
        self.assertEqual(
            email_data["context"]["getting_user_started_link"],
            "http://zulip.testserver/help/getting-started-with-zulip",
        )
        self.assertNotIn("ldap_username", email_data["context"])

    # See https://zulip.readthedocs.io/en/latest/production/authentication-methods.html#ldap-including-active-directory
    # for case details.
    @override_settings(
        AUTHENTICATION_BACKENDS=(
            "zproject.backends.ZulipLDAPAuthBackend",
            "zproject.backends.ZulipDummyBackend",
        ),
        # configure email search for email address in the uid attribute:
        AUTH_LDAP_REVERSE_EMAIL_SEARCH=LDAPSearch(
            "ou=users,dc=zulip,dc=com", ldap.SCOPE_ONELEVEL, "(uid=%(email)s)"
        ),
    )
    def test_day1_email_ldap_case_a_login_credentials(self) -> None:
        self.init_default_ldap_database()
        ldap_user_attr_map = {"full_name": "cn"}

        with self.settings(AUTH_LDAP_USER_ATTR_MAP=ldap_user_attr_map):
            self.login_with_return(
                "newuser_email_as_uid@zulip.com",
                self.ldap_password("newuser_email_as_uid@zulip.com"),
            )
            user = UserProfile.objects.get(delivery_email="newuser_email_as_uid@zulip.com")
            scheduled_emails = ScheduledEmail.objects.filter(users=user).order_by(
                "scheduled_timestamp"
            )

            self.assert_length(scheduled_emails, 3)
            email_data = orjson.loads(scheduled_emails[0].data)
            self.assertEqual(email_data["context"]["ldap"], True)
            self.assertEqual(
                email_data["context"]["ldap_username"], "newuser_email_as_uid@zulip.com"
            )

    @override_settings(
        AUTHENTICATION_BACKENDS=(
            "zproject.backends.ZulipLDAPAuthBackend",
            "zproject.backends.ZulipDummyBackend",
        )
    )
    def test_day1_email_ldap_case_b_login_credentials(self) -> None:
        self.init_default_ldap_database()
        ldap_user_attr_map = {"full_name": "cn"}

        with self.settings(
            LDAP_APPEND_DOMAIN="zulip.com",
            AUTH_LDAP_USER_ATTR_MAP=ldap_user_attr_map,
        ):
            self.login_with_return("newuser@zulip.com", self.ldap_password("newuser"))

            user = UserProfile.objects.get(delivery_email="newuser@zulip.com")
            scheduled_emails = ScheduledEmail.objects.filter(users=user).order_by(
                "scheduled_timestamp"
            )
            self.assert_length(scheduled_emails, 3)
            email_data = orjson.loads(scheduled_emails[0].data)
            self.assertEqual(email_data["context"]["ldap"], True)
            self.assertEqual(email_data["context"]["ldap_username"], "newuser")

    @override_settings(
        AUTHENTICATION_BACKENDS=(
            "zproject.backends.ZulipLDAPAuthBackend",
            "zproject.backends.ZulipDummyBackend",
        )
    )
    def test_day1_email_ldap_case_c_login_credentials(self) -> None:
        self.init_default_ldap_database()
        ldap_user_attr_map = {"full_name": "cn"}

        with self.settings(
            LDAP_EMAIL_ATTR="mail",
            AUTH_LDAP_USER_ATTR_MAP=ldap_user_attr_map,
        ):
            self.login_with_return("newuser_with_email", self.ldap_password("newuser_with_email"))
            user = UserProfile.objects.get(delivery_email="newuser_email@zulip.com")
            scheduled_emails = ScheduledEmail.objects.filter(users=user).order_by(
                "scheduled_timestamp"
            )
            self.assert_length(scheduled_emails, 3)
            email_data = orjson.loads(scheduled_emails[0].data)
            self.assertEqual(email_data["context"]["ldap"], True)
            self.assertEqual(email_data["context"]["ldap_username"], "newuser_with_email")

    def test_followup_emails_count(self) -> None:
        hamlet = self.example_user("hamlet")
        iago = self.example_user("iago")
        cordelia = self.example_user("cordelia")
        realm = get_realm("zulip")

        # Hamlet has account only in Zulip realm so day1, day2 and zulip_guide emails should be sent
        send_account_registered_email(self.example_user("hamlet"))
        enqueue_welcome_emails(self.example_user("hamlet"))
        scheduled_emails = ScheduledEmail.objects.filter(users=hamlet).order_by(
            "scheduled_timestamp"
        )
        self.assert_length(scheduled_emails, 3)
        self.assertEqual(
            orjson.loads(scheduled_emails[0].data)["template_prefix"],
            "zerver/emails/account_registered",
        )
        self.assertEqual(
            orjson.loads(scheduled_emails[1].data)["template_prefix"],
            "zerver/emails/onboarding_zulip_topics",
        )
        self.assertEqual(
            orjson.loads(scheduled_emails[2].data)["template_prefix"],
            "zerver/emails/onboarding_zulip_guide",
        )

        ScheduledEmail.objects.all().delete()

        # The onboarding_zulip_guide email should not be sent to non-admin users in organizations
        # that are sent the `/for/communities/` guide; see note in enqueue_welcome_emails.
        realm.org_type = Realm.ORG_TYPES["community"]["id"]
        realm.save()

        # Hamlet is not an admin so the `/for/communities/` zulip_guide should not be sent
        send_account_registered_email(self.example_user("hamlet"))
        enqueue_welcome_emails(self.example_user("hamlet"))
        scheduled_emails = ScheduledEmail.objects.filter(users=hamlet).order_by(
            "scheduled_timestamp"
        )
        self.assert_length(scheduled_emails, 2)
        self.assertEqual(
            orjson.loads(scheduled_emails[0].data)["template_prefix"],
            "zerver/emails/account_registered",
        )
        self.assertEqual(
            orjson.loads(scheduled_emails[1].data)["template_prefix"],
            "zerver/emails/onboarding_zulip_topics",
        )

        ScheduledEmail.objects.all().delete()

        # Iago is an admin so the `/for/communities/` zulip_guide should be sent
        send_account_registered_email(self.example_user("iago"))
        enqueue_welcome_emails(self.example_user("iago"))
        scheduled_emails = ScheduledEmail.objects.filter(users=iago).order_by("scheduled_timestamp")
        self.assert_length(scheduled_emails, 3)
        self.assertEqual(
            orjson.loads(scheduled_emails[0].data)["template_prefix"],
            "zerver/emails/account_registered",
        )
        self.assertEqual(
            orjson.loads(scheduled_emails[1].data)["template_prefix"],
            "zerver/emails/onboarding_zulip_topics",
        )
        self.assertEqual(
            orjson.loads(scheduled_emails[2].data)["template_prefix"],
            "zerver/emails/onboarding_zulip_guide",
        )

        ScheduledEmail.objects.all().delete()

        # The organization_type context for "education_nonprofit" orgs is simplified to be "education"
        realm.org_type = Realm.ORG_TYPES["education_nonprofit"]["id"]
        realm.save()

        # Cordelia has account in more than 1 realm so day2 email should not be sent
        send_account_registered_email(self.example_user("cordelia"))
        enqueue_welcome_emails(self.example_user("cordelia"))
        scheduled_emails = ScheduledEmail.objects.filter(users=cordelia).order_by(
            "scheduled_timestamp"
        )
        self.assert_length(scheduled_emails, 2)
        self.assertEqual(
            orjson.loads(scheduled_emails[0].data)["template_prefix"],
            "zerver/emails/account_registered",
        )
        self.assertEqual(
            orjson.loads(scheduled_emails[1].data)["template_prefix"],
            "zerver/emails/onboarding_zulip_guide",
        )
        self.assertEqual(
            orjson.loads(scheduled_emails[1].data)["context"]["organization_type"],
            "education",
        )

        ScheduledEmail.objects.all().delete()

        # Only a subset of Realm.ORG_TYPES are sent the zulip_guide_followup email
        realm.org_type = Realm.ORG_TYPES["other"]["id"]
        realm.save()

        # In this case, Cordelia should only be sent the day1 email
        send_account_registered_email(self.example_user("cordelia"))
        enqueue_welcome_emails(self.example_user("cordelia"))
        scheduled_emails = ScheduledEmail.objects.filter(users=cordelia)
        self.assert_length(scheduled_emails, 1)
        self.assertEqual(
            orjson.loads(scheduled_emails[0].data)["template_prefix"],
            "zerver/emails/account_registered",
        )

    def test_followup_emails_for_regular_realms(self) -> None:
        cordelia = self.example_user("cordelia")
        send_account_registered_email(self.example_user("cordelia"), realm_creation=True)
        enqueue_welcome_emails(self.example_user("cordelia"))
        scheduled_emails = ScheduledEmail.objects.filter(users=cordelia).order_by(
            "scheduled_timestamp"
        )
        assert scheduled_emails is not None
        self.assert_length(scheduled_emails, 2)
        self.assertEqual(
            orjson.loads(scheduled_emails[0].data)["template_prefix"],
            "zerver/emails/account_registered",
        )
        self.assertEqual(
            orjson.loads(scheduled_emails[1].data)["template_prefix"],
            "zerver/emails/onboarding_zulip_guide",
        )

        deliver_scheduled_emails(scheduled_emails[0])
        from django.core.mail import outbox

        self.assert_length(outbox, 1)

        message = outbox[0]
        self.assertIn("you have created a new Zulip organization", message.body)
        self.assertNotIn("demo org", message.body)

    def test_followup_emails_for_demo_realms(self) -> None:
        cordelia = self.example_user("cordelia")
        cordelia.realm.demo_organization_scheduled_deletion_date = timezone_now() + timedelta(
            days=30
        )
        cordelia.realm.save()
        send_account_registered_email(self.example_user("cordelia"), realm_creation=True)
        enqueue_welcome_emails(self.example_user("cordelia"))
        scheduled_emails = ScheduledEmail.objects.filter(users=cordelia).order_by(
            "scheduled_timestamp"
        )
        assert scheduled_emails is not None
        self.assert_length(scheduled_emails, 2)
        self.assertEqual(
            orjson.loads(scheduled_emails[0].data)["template_prefix"],
            "zerver/emails/account_registered",
        )
        self.assertEqual(
            orjson.loads(scheduled_emails[1].data)["template_prefix"],
            "zerver/emails/onboarding_zulip_guide",
        )

        deliver_scheduled_emails(scheduled_emails[0])
        from django.core.mail import outbox

        self.assert_length(outbox, 1)

        message = outbox[0]
        self.assertIn("you have created a new demo Zulip organization", message.body)

<<<<<<< HEAD

class TestMissedMessages(ZulipTestCase):
    def normalize_string(self, s: Union[str, StrPromise]) -> str:
        s = s.strip()
        return re.sub(r"\s+", " ", s)

    def _get_tokens(self) -> List[str]:
        return ["mm" + str(random.getrandbits(32)) for _ in range(30)]

    def _test_cases(
        self,
        msg_id: int,
        verify_body_include: List[str],
        email_subject: str,
        send_as_user: bool,
        verify_html_body: bool = False,
        show_message_content: bool = True,
        verify_body_does_not_include: Sequence[str] = [],
        trigger: str = "",
        mentioned_user_group_id: Optional[int] = None,
    ) -> None:
        othello = self.example_user("desdemona")
        hamlet = self.example_user("iago")
        tokens = self._get_tokens()
        with patch("zerver.lib.email_mirror.generate_missed_message_token", side_effect=tokens):
            handle_missedmessage_emails(
                hamlet.id,
                [
                    {
                        "message_id": msg_id,
                        "trigger": trigger,
                        "mentioned_user_group_id": mentioned_user_group_id,
                    }
                ],
            )
        if settings.EMAIL_GATEWAY_PATTERN != "":
            reply_to_addresses = [settings.EMAIL_GATEWAY_PATTERN % (t,) for t in tokens]
            reply_to_emails = [
                str(Address(display_name="Zulip", addr_spec=address))
                for address in reply_to_addresses
            ]
        else:
            reply_to_emails = ["noreply@testserver"]
        msg = mail.outbox[0]
        assert isinstance(msg, EmailMultiAlternatives)
        from_email = str(Address(display_name="Zulip notifications", addr_spec=FromAddress.NOREPLY))
        self.assert_length(mail.outbox, 1)
        if send_as_user:
            from_email = f'"{othello.full_name}" <{othello.email}>'
        self.assertEqual(self.email_envelope_from(msg), settings.NOREPLY_EMAIL_ADDRESS)
        self.assertEqual(self.email_display_from(msg), from_email)
        self.assertEqual(msg.subject, email_subject)
        self.assert_length(msg.reply_to, 1)
        self.assertIn(msg.reply_to[0], reply_to_emails)
        if verify_html_body:
            for text in verify_body_include:
                assert isinstance(msg.alternatives[0][0], str)
                self.assertIn(text, self.normalize_string(msg.alternatives[0][0]))
        else:
            for text in verify_body_include:
                self.assertIn(text, self.normalize_string(msg.body))
        for text in verify_body_does_not_include:
            self.assertNotIn(text, self.normalize_string(msg.body))

        self.assertEqual(msg.extra_headers["List-Id"], "Zulip Dev <zulip.testserver>")

    def _realm_name_in_missed_message_email_subject(
        self, realm_name_in_notifications: bool
    ) -> None:
        msg_id = self.send_personal_message(
            self.example_user("othello"),
            self.example_user("hamlet"),
            "Extremely personal message!",
        )
        verify_body_include = ["Extremely personal message!"]
        email_subject = "PMs with Othello, the Moor of Venice"

        if realm_name_in_notifications:
            email_subject = "PMs with Othello, the Moor of Venice [Zulip Dev]"
        self._test_cases(msg_id, verify_body_include, email_subject, False)

    def _extra_context_in_missed_stream_messages_mention(
        self, send_as_user: bool, show_message_content: bool = True
    ) -> None:
        for i in range(0, 11):
            self.send_stream_message(self.example_user("othello"), "Denmark", content=str(i))
        self.send_stream_message(self.example_user("othello"), "Denmark", "11", topic_name="test2")
        msg_id = self.send_stream_message(
            self.example_user("othello"), "denmark", "@**King Hamlet**"
        )

        if show_message_content:
            verify_body_include = [
                "Othello, the Moor of Venice: > 1 > 2 > 3 > 4 > 5 > 6 > 7 > 8 > 9 > 10 > @**King Hamlet** -- ",
                "You are receiving this because you were personally mentioned.",
            ]
            email_subject = "#Denmark > test"
            verify_body_does_not_include: List[str] = []
        else:
            # Test in case if message content in missed email message are disabled.
            verify_body_include = [
                "This email does not include message content because you have disabled message ",
                "http://zulip.testserver/help/pm-mention-alert-notifications ",
                "View or reply in Zulip Dev Zulip",
                " Manage email preferences: http://zulip.testserver/#settings/notifications",
            ]

            email_subject = "New messages"
            verify_body_does_not_include = [
                "Denmark > test",
                "Othello, the Moor of Venice",
                "1 2 3 4 5 6 7 8 9 10 @**King Hamlet**",
                "private",
                "group",
                "Reply to this email directly, or view it in Zulip Dev Zulip",
            ]
        self._test_cases(
            msg_id,
            verify_body_include,
            email_subject,
            send_as_user,
            show_message_content=show_message_content,
            verify_body_does_not_include=verify_body_does_not_include,
            trigger="mentioned",
        )

    def _extra_context_in_missed_stream_messages_wildcard_mention(
        self, send_as_user: bool, show_message_content: bool = True
    ) -> None:
        for i in range(1, 6):
            self.send_stream_message(self.example_user("othello"), "Denmark", content=str(i))
        self.send_stream_message(self.example_user("othello"), "Denmark", "11", topic_name="test2")
        msg_id = self.send_stream_message(self.example_user("othello"), "denmark", "@**all**")

        if show_message_content:
            verify_body_include = [
                "Othello, the Moor of Venice: > 1 > 2 > 3 > 4 > 5 > @**all** -- ",
                "You are receiving this because everyone was mentioned in #Denmark.",
            ]
            email_subject = "#Denmark > test"
            verify_body_does_not_include: List[str] = []
        else:
            # Test in case if message content in missed email message are disabled.
            verify_body_include = [
                "This email does not include message content because you have disabled message ",
                "http://zulip.testserver/help/pm-mention-alert-notifications ",
                "View or reply in Zulip Dev Zulip",
                " Manage email preferences: http://zulip.testserver/#settings/notifications",
            ]
            email_subject = "New messages"
            verify_body_does_not_include = [
                "Denmark > test",
                "Othello, the Moor of Venice",
                "1 2 3 4 5 @**all**",
                "private",
                "group",
                "Reply to this email directly, or view it in Zulip Dev Zulip",
            ]
        self._test_cases(
            msg_id,
            verify_body_include,
            email_subject,
            send_as_user,
            show_message_content=show_message_content,
            verify_body_does_not_include=verify_body_does_not_include,
            trigger="wildcard_mentioned",
        )

    def _extra_context_in_missed_stream_messages_email_notify(self, send_as_user: bool) -> None:
        for i in range(0, 11):
            self.send_stream_message(self.example_user("othello"), "Denmark", content=str(i))
        self.send_stream_message(self.example_user("othello"), "Denmark", "11", topic_name="test2")
        msg_id = self.send_stream_message(self.example_user("othello"), "denmark", "12")
        verify_body_include = [
            "Othello, the Moor of Venice: > 1 > 2 > 3 > 4 > 5 > 6 > 7 > 8 > 9 > 10 > 12 -- ",
            "You are receiving this because you have email notifications enabled for #Denmark.",
        ]
        email_subject = "#Denmark > test"
        self._test_cases(
            msg_id, verify_body_include, email_subject, send_as_user, trigger="stream_email_notify"
        )

    def _extra_context_in_missed_stream_messages_mention_two_senders(
        self, send_as_user: bool
    ) -> None:
        cordelia = self.example_user("cordelia")
        self.subscribe(cordelia, "Denmark")

        for i in range(0, 3):
            self.send_stream_message(cordelia, "Denmark", str(i))
        msg_id = self.send_stream_message(
            self.example_user("othello"), "Denmark", "@**King Hamlet**"
        )
        verify_body_include = [
            "Cordelia, Lear's daughter: > 0 > 1 > 2 Othello, the Moor of Venice: > @**King Hamlet** -- ",
            "You are receiving this because you were personally mentioned.",
        ]
        email_subject = "#Denmark > test"
        self._test_cases(
            msg_id, verify_body_include, email_subject, send_as_user, trigger="mentioned"
        )

    def _extra_context_in_missed_personal_messages(
        self,
        send_as_user: bool,
        show_message_content: bool = True,
        message_content_disabled_by_user: bool = False,
        message_content_disabled_by_realm: bool = False,
    ) -> None:
        msg_id = self.send_personal_message(
            self.example_user("othello"),
            self.example_user("hamlet"),
            "Extremely personal message!",
        )

        if show_message_content:
            verify_body_include = ["> Extremely personal message!"]
            email_subject = "PMs with Othello, the Moor of Venice"
            verify_body_does_not_include: List[str] = []
        else:
            if message_content_disabled_by_realm:
                verify_body_include = [
                    "This email does not include message content because your organization has disabled",
                    "http://zulip.testserver/help/hide-message-content-in-emails",
                    "View or reply in Zulip Dev Zulip",
                    " Manage email preferences: http://zulip.testserver/#settings/notifications",
                ]
            elif message_content_disabled_by_user:
                verify_body_include = [
                    "This email does not include message content because you have disabled message ",
                    "http://zulip.testserver/help/pm-mention-alert-notifications ",
                    "View or reply in Zulip Dev Zulip",
                    " Manage email preferences: http://zulip.testserver/#settings/notifications",
                ]
            email_subject = "New messages"
            verify_body_does_not_include = [
                "Othello, the Moor of Venice",
                "Extremely personal message!",
                "mentioned",
                "group",
                "Reply to this email directly, or view it in Zulip Dev Zulip",
            ]
        self._test_cases(
            msg_id,
            verify_body_include,
            email_subject,
            send_as_user,
            show_message_content=show_message_content,
            verify_body_does_not_include=verify_body_does_not_include,
        )

    def _reply_to_email_in_missed_personal_messages(self, send_as_user: bool) -> None:
        msg_id = self.send_personal_message(
            self.example_user("othello"),
            self.example_user("hamlet"),
            "Extremely personal message!",
        )
        verify_body_include = ["Reply to this email directly, or view it in Zulip Dev Zulip"]
        email_subject = "PMs with Othello, the Moor of Venice"
        self._test_cases(msg_id, verify_body_include, email_subject, send_as_user)

    def _reply_warning_in_missed_personal_messages(self, send_as_user: bool) -> None:
        msg_id = self.send_personal_message(
            self.example_user("othello"),
            self.example_user("hamlet"),
            "Extremely personal message!",
        )
        verify_body_include = ["Do not reply to this email."]
        email_subject = "PMs with Othello, the Moor of Venice"
        self._test_cases(msg_id, verify_body_include, email_subject, send_as_user)

    def _extra_context_in_missed_huddle_messages_two_others(
        self, send_as_user: bool, show_message_content: bool = True
    ) -> None:
        msg_id = self.send_huddle_message(
            self.example_user("othello"),
            [
                self.example_user("hamlet"),
                self.example_user("iago"),
            ],
            "Group personal message!",
        )

        if show_message_content:
            verify_body_include = [
                "Othello, the Moor of Venice: > Group personal message! -- Reply"
            ]
            email_subject = "Group PMs with Iago and Othello, the Moor of Venice"
            verify_body_does_not_include: List[str] = []
        else:
            verify_body_include = [
                "This email does not include message content because you have disabled message ",
                "http://zulip.testserver/help/pm-mention-alert-notifications ",
                "View or reply in Zulip Dev Zulip",
                " Manage email preferences: http://zulip.testserver/#settings/notifications",
            ]
            email_subject = "New messages"
            verify_body_does_not_include = [
                "Iago",
                "Othello, the Moor of Venice Othello, the Moor of Venice",
                "Group personal message!",
                "mentioned",
                "Reply to this email directly, or view it in Zulip Dev Zulip",
            ]
        self._test_cases(
            msg_id,
            verify_body_include,
            email_subject,
            send_as_user,
            show_message_content=show_message_content,
            verify_body_does_not_include=verify_body_does_not_include,
        )

    def _extra_context_in_missed_huddle_messages_three_others(self, send_as_user: bool) -> None:
        msg_id = self.send_huddle_message(
            self.example_user("othello"),
            [
                self.example_user("hamlet"),
                self.example_user("iago"),
                self.example_user("cordelia"),
            ],
            "Group personal message!",
        )

        verify_body_include = ["Othello, the Moor of Venice: > Group personal message! -- Reply"]
        email_subject = (
            "Group PMs with Cordelia, Lear's daughter, Iago, and Othello, the Moor of Venice"
        )
        self._test_cases(msg_id, verify_body_include, email_subject, send_as_user)

    def _extra_context_in_missed_huddle_messages_many_others(self, send_as_user: bool) -> None:
        msg_id = self.send_huddle_message(
            self.example_user("othello"),
            [
                self.example_user("hamlet"),
                self.example_user("iago"),
                self.example_user("cordelia"),
                self.example_user("prospero"),
            ],
            "Group personal message!",
        )

        verify_body_include = ["Othello, the Moor of Venice: > Group personal message! -- Reply"]
        email_subject = "Group PMs with Cordelia, Lear's daughter, Iago, and 2 others"
        self._test_cases(msg_id, verify_body_include, email_subject, send_as_user)

    def _deleted_message_in_missed_stream_messages(self, send_as_user: bool) -> None:
        msg_id = self.send_stream_message(
            self.example_user("othello"), "denmark", "@**King Hamlet** to be deleted"
        )

        hamlet = self.example_user("hamlet")
        self.login("othello")
        result = self.client_patch("/json/messages/" + str(msg_id), {"content": " "})
        self.assert_json_success(result)
        handle_missedmessage_emails(hamlet.id, [{"message_id": msg_id}])
        self.assert_length(mail.outbox, 0)

    def _deleted_message_in_missed_personal_messages(self, send_as_user: bool) -> None:
        msg_id = self.send_personal_message(
            self.example_user("othello"),
            self.example_user("hamlet"),
            "Extremely personal message! to be deleted!",
        )

        hamlet = self.example_user("hamlet")
        self.login("othello")
        result = self.client_patch("/json/messages/" + str(msg_id), {"content": " "})
        self.assert_json_success(result)
        handle_missedmessage_emails(hamlet.id, [{"message_id": msg_id}])
        self.assert_length(mail.outbox, 0)

    def _deleted_message_in_missed_huddle_messages(self, send_as_user: bool) -> None:
        msg_id = self.send_huddle_message(
            self.example_user("othello"),
            [
                self.example_user("hamlet"),
                self.example_user("iago"),
            ],
            "Group personal message!",
        )

        hamlet = self.example_user("hamlet")
        iago = self.example_user("iago")
        self.login("othello")
        result = self.client_patch("/json/messages/" + str(msg_id), {"content": " "})
        self.assert_json_success(result)
        handle_missedmessage_emails(hamlet.id, [{"message_id": msg_id}])
        self.assert_length(mail.outbox, 0)
        handle_missedmessage_emails(iago.id, [{"message_id": msg_id}])
        self.assert_length(mail.outbox, 0)

    def test_extra_context_in_missed_stream_messages(self) -> None:
        self._extra_context_in_missed_stream_messages_mention(False)

    def test_extra_context_in_missed_stream_messages_wildcard(self) -> None:
        self._extra_context_in_missed_stream_messages_wildcard_mention(False)

    def test_extra_context_in_missed_stream_messages_two_senders(self) -> None:
        self._extra_context_in_missed_stream_messages_mention_two_senders(False)

    def test_extra_context_in_missed_stream_messages_email_notify(self) -> None:
        self._extra_context_in_missed_stream_messages_email_notify(False)

    @override_settings(SEND_MISSED_MESSAGE_EMAILS_AS_USER=True)
    def test_deleted_message_in_missed_stream_messages_as_user(self) -> None:
        self._deleted_message_in_missed_stream_messages(True)

    def test_deleted_message_in_missed_stream_messages(self) -> None:
        self._deleted_message_in_missed_stream_messages(False)

    @override_settings(SEND_MISSED_MESSAGE_EMAILS_AS_USER=True)
    def test_deleted_message_in_missed_personal_messages_as_user(self) -> None:
        self._deleted_message_in_missed_personal_messages(True)

    def test_deleted_message_in_missed_personal_messages(self) -> None:
        self._deleted_message_in_missed_personal_messages(False)

    @override_settings(SEND_MISSED_MESSAGE_EMAILS_AS_USER=True)
    def test_deleted_message_in_missed_huddle_messages_as_user(self) -> None:
        self._deleted_message_in_missed_huddle_messages(True)

    def test_deleted_message_in_missed_huddle_messages(self) -> None:
        self._deleted_message_in_missed_huddle_messages(False)

    def test_relative_to_full_url(self) -> None:
        def convert(test_data: str) -> str:
            fragment = lxml.html.fragment_fromstring(test_data, create_parent=True)
            relative_to_full_url(fragment, "http://example.com")
            return lxml.html.tostring(fragment, encoding="unicode")

        zulip_realm = get_realm("zulip")
        zephyr_realm = get_realm("zephyr")
        # Run `relative_to_full_url()` function over test fixtures present in
        # 'markdown_test_cases.json' and check that it converts all the relative
        # URLs to absolute URLs.
        fixtures = orjson.loads(self.fixture_data("markdown_test_cases.json"))
        test_fixtures = {}
        for test in fixtures["regular_tests"]:
            test_fixtures[test["name"]] = test
        for test_name in test_fixtures:
            test_data = test_fixtures[test_name]["expected_output"]
            output_data = convert(test_data)
            if re.search(r"""(?<=\=['"])/(?=[^<]+>)""", output_data) is not None:
                raise AssertionError(
                    "Relative URL present in email: "
                    + output_data
                    + "\nFailed test case's name is: "
                    + test_name
                    + "\nIt is present in markdown_test_cases.json"
                )

        # Specific test cases.

        # A path similar to our emoji path, but not in a link:
        test_data = "<p>Check out the file at: '/static/generated/emoji/images/emoji/'</p>"
        actual_output = convert(test_data)
        expected_output = (
            "<div><p>Check out the file at: '/static/generated/emoji/images/emoji/'</p></div>"
        )
        self.assertEqual(actual_output, expected_output)

        # An uploaded file
        test_data = '<a href="/user_uploads/{realm_id}/1f/some_random_value">/user_uploads/{realm_id}/1f/some_random_value</a>'
        test_data = test_data.format(realm_id=zephyr_realm.id)
        actual_output = convert(test_data)
        expected_output = (
            '<div><a href="http://example.com/user_uploads/{realm_id}/1f/some_random_value">'
            + "/user_uploads/{realm_id}/1f/some_random_value</a></div>"
        )
        expected_output = expected_output.format(realm_id=zephyr_realm.id)
        self.assertEqual(actual_output, expected_output)

        # A profile picture like syntax, but not actually in an HTML tag
        test_data = '<p>Set src="/avatar/username@example.com?s=30"</p>'
        actual_output = convert(test_data)
        expected_output = '<div><p>Set src="/avatar/username@example.com?s=30"</p></div>'
        self.assertEqual(actual_output, expected_output)

        # A narrow URL which begins with a '#'.
        test_data = (
            '<p><a href="#narrow/stream/test/topic/test.20topic/near/142"'
            + 'title="#narrow/stream/test/topic/test.20topic/near/142">Conversation</a></p>'
        )
        actual_output = convert(test_data)
        expected_output = (
            '<div><p><a href="http://example.com/#narrow/stream/test/topic/test.20topic/near/142" '
            + 'title="http://example.com/#narrow/stream/test/topic/test.20topic/near/142">Conversation</a></p></div>'
        )
        self.assertEqual(actual_output, expected_output)

        # Scrub inline images.
        test_data = (
            '<p>See this <a href="/user_uploads/{realm_id}/52/fG7GM9e3afz_qsiUcSce2tl_/avatar_103.jpeg" target="_blank" '
            + 'title="avatar_103.jpeg">avatar_103.jpeg</a>.</p>'
            + '<div class="message_inline_image"><a href="/user_uploads/{realm_id}/52/fG7GM9e3afz_qsiUcSce2tl_/avatar_103.jpeg" '
            + 'target="_blank" title="avatar_103.jpeg"><img src="/user_uploads/{realm_id}/52/fG7GM9e3afz_qsiUcSce2tl_/avatar_103.jpeg"></a></div>'
        )
        test_data = test_data.format(realm_id=zulip_realm.id)
        actual_output = convert(test_data)
        expected_output = (
            '<div><p>See this <a href="http://example.com/user_uploads/{realm_id}/52/fG7GM9e3afz_qsiUcSce2tl_/avatar_103.jpeg" target="_blank" '
            + 'title="avatar_103.jpeg">avatar_103.jpeg</a>.</p></div>'
        )
        expected_output = expected_output.format(realm_id=zulip_realm.id)
        self.assertEqual(actual_output, expected_output)

        # A message containing only an inline image URL preview, we do
        # somewhat more extensive surgery.
        test_data = (
            '<div class="message_inline_image"><a href="https://www.google.com/images/srpr/logo4w.png" '
            + 'target="_blank" title="https://www.google.com/images/srpr/logo4w.png">'
            + '<img data-src-fullsize="/thumbnail/https%3A//www.google.com/images/srpr/logo4w.png?size=0x0" '
            + 'src="/thumbnail/https%3A//www.google.com/images/srpr/logo4w.png?size=0x100"></a></div>'
        )
        actual_output = convert(test_data)
        expected_output = (
            '<div><p><a href="https://www.google.com/images/srpr/logo4w.png" '
            + 'target="_blank" title="https://www.google.com/images/srpr/logo4w.png">'
            + "https://www.google.com/images/srpr/logo4w.png</a></p></div>"
        )
        self.assertEqual(actual_output, expected_output)

    def test_spoilers_in_html_emails(self) -> None:
        test_data = '<div class="spoiler-block"><div class="spoiler-header">\n\n<p><a>header</a> text</p>\n</div><div class="spoiler-content" aria-hidden="true">\n\n<p>content</p>\n</div></div>\n\n<p>outside spoiler</p>'
        fragment = lxml.html.fromstring(test_data)
        fix_spoilers_in_html(fragment, "en")
        actual_output = lxml.html.tostring(fragment, encoding="unicode")
        expected_output = '<div><div class="spoiler-block">\n\n<p><a>header</a> text <span class="spoiler-title" title="Open Zulip to see the spoiler content">(Open Zulip to see the spoiler content)</span></p>\n</div>\n\n<p>outside spoiler</p></div>'
        self.assertEqual(actual_output, expected_output)

        # test against our markdown_test_cases so these features do not get out of sync.
        fixtures = orjson.loads(self.fixture_data("markdown_test_cases.json"))
        test_fixtures = {}
        for test in fixtures["regular_tests"]:
            if "spoiler" in test["name"]:
                test_fixtures[test["name"]] = test
        for test_name in test_fixtures:
            fragment = lxml.html.fromstring(test_fixtures[test_name]["expected_output"])
            fix_spoilers_in_html(fragment, "en")
            output_data = lxml.html.tostring(fragment, encoding="unicode")
            assert "spoiler-header" not in output_data
            assert "spoiler-content" not in output_data
            assert "spoiler-block" in output_data
            assert "spoiler-title" in output_data

    def test_spoilers_in_text_emails(self) -> None:
        content = "@**King Hamlet**\n\n```spoiler header text\nsecret-text\n```"
        msg_id = self.send_stream_message(self.example_user("othello"), "Denmark", content)
        verify_body_include = ["header text", "Open Zulip to see the spoiler content"]
        verify_body_does_not_include = ["secret-text"]
        email_subject = "#Denmark > test"
        send_as_user = False
        self._test_cases(
            msg_id,
            verify_body_include,
            email_subject,
            send_as_user,
            trigger="mentioned",
            verify_body_does_not_include=verify_body_does_not_include,
        )

    def test_fix_emoji(self) -> None:
        # An emoji.
        test_data = (
            '<p>See <span aria-label="cloud with lightning and rain" class="emoji emoji-26c8" role="img" title="cloud with lightning and rain">'
            + ":cloud_with_lightning_and_rain:</span>.</p>"
        )
        fragment = lxml.html.fromstring(test_data)
        fix_emojis(fragment, "http://example.com", "google")
        actual_output = lxml.html.tostring(fragment, encoding="unicode")
        expected_output = (
            '<p>See <img alt=":cloud_with_lightning_and_rain:" src="http://example.com/static/generated/emoji/images-google-64/26c8.png" '
            + 'title="cloud with lightning and rain" style="height: 20px;">.</p>'
        )
        self.assertEqual(actual_output, expected_output)
=======
    def test_onboarding_zulip_guide_with_invalid_org_type(self) -> None:
        cordelia = self.example_user("cordelia")
        realm = get_realm("zulip")

        invalid_org_type_id = 999
        realm.org_type = invalid_org_type_id
        realm.save()

        with self.assertLogs(level="ERROR") as m:
            enqueue_welcome_emails(self.example_user("cordelia"))

        scheduled_emails = ScheduledEmail.objects.filter(users=cordelia)
        self.assert_length(scheduled_emails, 0)
        self.assertEqual(
            m.output,
            [f"ERROR:root:Unknown organization type '{invalid_org_type_id}'"],
        )

>>>>>>> drc_main

class TestFollowupEmailDelay(ZulipTestCase):
    def test_get_onboarding_email_schedule(self) -> None:
        user_profile = self.example_user("hamlet")
        dates_joined = {
            "Monday": datetime(2018, 1, 1, 1, 0, 0, 0, tzinfo=timezone.utc),
            "Tuesday": datetime(2018, 1, 2, 1, 0, 0, 0, tzinfo=timezone.utc),
            "Wednesday": datetime(2018, 1, 3, 1, 0, 0, 0, tzinfo=timezone.utc),
            "Thursday": datetime(2018, 1, 4, 1, 0, 0, 0, tzinfo=timezone.utc),
            "Friday": datetime(2018, 1, 5, 1, 0, 0, 0, tzinfo=timezone.utc),
            "Saturday": datetime(2018, 1, 6, 1, 0, 0, 0, tzinfo=timezone.utc),
            "Sunday": datetime(2018, 1, 7, 1, 0, 0, 0, tzinfo=timezone.utc),
        }
        days_delayed = {
            "2": timedelta(days=2, hours=-1),
            "4": timedelta(days=4, hours=-1),
            "6": timedelta(days=6, hours=-1),
        }

        # joined Monday
        user_profile.date_joined = dates_joined["Monday"]
        onboarding_email_schedule = get_onboarding_email_schedule(user_profile)

        # onboarding_zulip_topics email sent on Wednesday
        self.assertEqual(
            onboarding_email_schedule["onboarding_zulip_topics"],
            days_delayed["2"],
        )
        self.assertEqual((dates_joined["Monday"] + days_delayed["2"]).isoweekday(), 3)

        # onboarding_zulip_guide sent on Friday
        self.assertEqual(
            onboarding_email_schedule["onboarding_zulip_guide"],
            days_delayed["4"],
        )
        self.assertEqual((dates_joined["Monday"] + days_delayed["4"]).isoweekday(), 5)

        # joined Tuesday
        user_profile.date_joined = dates_joined["Tuesday"]
        onboarding_email_schedule = get_onboarding_email_schedule(user_profile)

        # onboarding_zulip_topics email sent on Thursday
        self.assertEqual(
            onboarding_email_schedule["onboarding_zulip_topics"],
            days_delayed["2"],
        )
        self.assertEqual((dates_joined["Tuesday"] + days_delayed["2"]).isoweekday(), 4)

        # onboarding_zulip_guide sent on Monday
        self.assertEqual(
            onboarding_email_schedule["onboarding_zulip_guide"],
            days_delayed["6"],
        )
        self.assertEqual((dates_joined["Tuesday"] + days_delayed["6"]).isoweekday(), 1)

        # joined Wednesday
        user_profile.date_joined = dates_joined["Wednesday"]
        onboarding_email_schedule = get_onboarding_email_schedule(user_profile)

        # onboarding_zulip_topics email sent on Friday
        self.assertEqual(
            onboarding_email_schedule["onboarding_zulip_topics"],
            days_delayed["2"],
        )
        self.assertEqual((dates_joined["Wednesday"] + days_delayed["2"]).isoweekday(), 5)

        # onboarding_zulip_guide sent on Tuesday
        self.assertEqual(
            onboarding_email_schedule["onboarding_zulip_guide"],
            days_delayed["6"],
        )
        self.assertEqual((dates_joined["Wednesday"] + days_delayed["6"]).isoweekday(), 2)

        # joined Thursday
        user_profile.date_joined = dates_joined["Thursday"]
        onboarding_email_schedule = get_onboarding_email_schedule(user_profile)

        # onboarding_zulip_topics email sent on Monday
        self.assertEqual(
            onboarding_email_schedule["onboarding_zulip_topics"],
            days_delayed["4"],
        )
        self.assertEqual((dates_joined["Thursday"] + days_delayed["4"]).isoweekday(), 1)

        # onboarding_zulip_guide sent on Wednesday
        self.assertEqual(
            onboarding_email_schedule["onboarding_zulip_guide"],
            days_delayed["6"],
        )
        self.assertEqual((dates_joined["Thursday"] + days_delayed["6"]).isoweekday(), 3)

        # joined Friday
        user_profile.date_joined = dates_joined["Friday"]
        onboarding_email_schedule = get_onboarding_email_schedule(user_profile)

        # onboarding_zulip_topics email sent on Tuesday
        self.assertEqual(
            onboarding_email_schedule["onboarding_zulip_topics"],
            days_delayed["4"],
        )
        self.assertEqual((dates_joined["Friday"] + days_delayed["4"]).isoweekday(), 2)

        # onboarding_zulip_guide sent on Thursday
        self.assertEqual(
            onboarding_email_schedule["onboarding_zulip_guide"],
            days_delayed["6"],
        )
        self.assertEqual((dates_joined["Friday"] + days_delayed["6"]).isoweekday(), 4)

        # joined Saturday
        user_profile.date_joined = dates_joined["Saturday"]
        onboarding_email_schedule = get_onboarding_email_schedule(user_profile)

        # onboarding_zulip_topics email sent on Monday
        self.assertEqual(
            onboarding_email_schedule["onboarding_zulip_topics"],
            days_delayed["2"],
        )
        self.assertEqual((dates_joined["Saturday"] + days_delayed["2"]).isoweekday(), 1)

        # onboarding_zulip_guide sent on Wednesday
        self.assertEqual(
            onboarding_email_schedule["onboarding_zulip_guide"],
            days_delayed["4"],
        )
        self.assertEqual((dates_joined["Saturday"] + days_delayed["4"]).isoweekday(), 3)

        # joined Sunday
        user_profile.date_joined = dates_joined["Sunday"]
        onboarding_email_schedule = get_onboarding_email_schedule(user_profile)

        # onboarding_zulip_topics email sent on Tuesday
        self.assertEqual(
            onboarding_email_schedule["onboarding_zulip_topics"],
            days_delayed["2"],
        )
        self.assertEqual((dates_joined["Sunday"] + days_delayed["2"]).isoweekday(), 2)

        # onboarding_zulip_guide sent on Thursday
        self.assertEqual(
            onboarding_email_schedule["onboarding_zulip_guide"],
            days_delayed["4"],
        )
        self.assertEqual((dates_joined["Sunday"] + days_delayed["4"]).isoweekday(), 4)

        # Time offset of America/Phoenix is -07:00
        user_profile.timezone = "America/Phoenix"

        # Test date_joined == Friday in UTC, but Thursday in the user's time zone
        user_profile.date_joined = datetime(2018, 1, 5, 1, 0, 0, 0, tzinfo=timezone.utc)
        onboarding_email_schedule = get_onboarding_email_schedule(user_profile)

        # onboarding_zulip_topics email sent on Monday
        self.assertEqual(
            onboarding_email_schedule["onboarding_zulip_topics"],
            days_delayed["4"],
        )

        # onboarding_zulip_guide sent on Wednesday
        self.assertEqual(
            onboarding_email_schedule["onboarding_zulip_guide"],
            days_delayed["6"],
        )


class TestCustomWelcomeEmailSender(ZulipTestCase):
    def test_custom_welcome_email_sender(self) -> None:
        name = "Nonreg Email"
        email = self.nonreg_email("test")
        with override_settings(
            WELCOME_EMAIL_SENDER={
                "name": name,
                "email": email,
            }
        ):
            hamlet = self.example_user("hamlet")
            enqueue_welcome_emails(hamlet)
            scheduled_emails = ScheduledEmail.objects.filter(users=hamlet).order_by(
                "scheduled_timestamp"
            )
            email_data = orjson.loads(scheduled_emails[0].data)
            self.assertEqual(email_data["from_name"], name)
            self.assertEqual(email_data["from_address"], email)
