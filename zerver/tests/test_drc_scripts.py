import csv
from datetime import datetime, timezone
from io import StringIO
from unittest.mock import patch

from django.core import mail
from django.test import override_settings

from zerver.lib.test_classes import ZulipTestCase
from zerver.models import Message
from zerver.views.drc_scripts import DELIMITER


class ConversationReportTest(ZulipTestCase):
    def test_conversation_date_range(self) -> None:
        hamlet = self.example_user("hamlet")
        othello = self.example_user("othello")
        before_start = self.send_personal_message(hamlet, othello, "Before start")
        at_start = self.send_personal_message(hamlet, othello, "At start")
        on_end = self.send_personal_message(othello, hamlet, "On end date")
        after_end = self.send_personal_message(hamlet, othello, "After end")
        group_message = self.send_group_direct_message(
            hamlet, [othello, self.example_user("cordelia")], "Group message"
        )
        stream_message = self.send_stream_message(hamlet, "Denmark", "Channel message")
        for message_id, date_sent in [
            (before_start, datetime(2026, 10, 2, 23, 59, 59, tzinfo=timezone.utc)),
            (at_start, datetime(2026, 10, 3, tzinfo=timezone.utc)),
            (on_end, datetime(2026, 11, 2, 23, 59, 59, tzinfo=timezone.utc)),
            (after_end, datetime(2026, 11, 3, tzinfo=timezone.utc)),
            (group_message, datetime(2026, 11, 2, tzinfo=timezone.utc)),
            (stream_message, datetime(2026, 11, 2, tzinfo=timezone.utc)),
        ]:
            Message.objects.filter(id=message_id).update(date_sent=date_sent)

        admin = self.example_user("iago")
        self.login_user(admin)
        with patch("zerver.views.drc_scripts.send_report") as send_report:
            result = self.client_post(
                "/drc_admin/",
                {
                    "get_conversation": "1",
                    "send_to": admin.delivery_email,
                    "email_1": hamlet.delivery_email,
                    "email_2": othello.delivery_email,
                    "start-date": "2026-10-03",
                    "end-date": "2026-11-02",
                },
            )
        self.assert_json_success(result)
        self.assertEqual(
            result.json()["html"], f"Conversation has been sent to {admin.delivery_email}"
        )
        send_report.assert_called_once()
        self.assertEqual(send_report.call_args.args[0], [admin.delivery_email])
        rows = list(csv.DictReader(StringIO(send_report.call_args.args[3]), delimiter=DELIMITER))
        self.assertEqual([int(row["message_id"]) for row in rows], [at_start, on_end])
        self.assertEqual(
            [(row["sender_email"], row["recipient_email"]) for row in rows],
            [
                (hamlet.delivery_email, othello.delivery_email),
                (othello.delivery_email, hamlet.delivery_email),
            ],
        )

    def test_no_one_to_one_conversation(self) -> None:
        hamlet = self.example_user("hamlet")
        othello = self.example_user("othello")
        self.send_group_direct_message(hamlet, [othello, self.example_user("cordelia")])
        self.login_user(self.example_user("iago"))
        with patch("zerver.views.drc_scripts.send_report") as send_report:
            result = self.client_post(
                "/drc_admin/",
                {
                    "get_conversation": "1",
                    "send_to": hamlet.delivery_email,
                    "email_1": hamlet.delivery_email,
                    "email_2": othello.delivery_email,
                    "start-date": "2000-01-01",
                    "end-date": "2100-01-01",
                },
            )
        self.assert_json_success(result)
        self.assertEqual(
            result.json()["html"],
            f"No conversation between {hamlet.delivery_email} and {othello.delivery_email} "
            "between dates 2000-01-01 and 2100-01-01.",
        )
        send_report.assert_not_called()

    def test_self_conversation(self) -> None:
        hamlet = self.example_user("hamlet")
        message_id = self.send_personal_message(hamlet, hamlet, "Note to self")
        self.send_personal_message(hamlet, self.example_user("othello"), "Another conversation")
        self.login_user(self.example_user("iago"))
        with patch("zerver.views.drc_scripts.send_report") as send_report:
            result = self.client_post(
                "/drc_admin/",
                {
                    "get_conversation": "1",
                    "send_to": hamlet.delivery_email,
                    "email_1": hamlet.delivery_email,
                    "email_2": hamlet.delivery_email,
                    "start-date": "2000-01-01",
                    "end-date": "2100-01-01",
                },
            )
        self.assert_json_success(result)
        send_report.assert_called_once()
        rows = list(csv.DictReader(StringIO(send_report.call_args.args[3]), delimiter=DELIMITER))
        self.assertEqual([int(row["message_id"]) for row in rows], [message_id])


class ReportRecipientTest(ZulipTestCase):
    @override_settings(BLOCK_EMAIL_TO_NON_ADMIN_USERS=True)
    def test_reports_are_only_emailed_to_owners_and_admins(self) -> None:
        self.login("iago")
        for name in ["polonius", "hamlet", "shiva"]:
            result = self.client_post(
                "/drc_admin/",
                {"users_role_get": "1", "send_to": self.example_user(name).delivery_email},
            )
            self.assert_json_error(
                result, "Reports cannot be emailed to guests, members or moderators."
            )
        self.assert_length(mail.outbox, 0)

        owner = self.example_user("desdemona")
        result = self.client_post(
            "/drc_admin/", {"users_role_get": "1", "send_to": owner.delivery_email}
        )
        self.assert_json_success(result)
        self.assert_length(mail.outbox, 1)
        self.assertEqual(mail.outbox[0].to, [owner.delivery_email])
        self.assertIn("user_roles.csv", mail.outbox[0].message().as_string())
