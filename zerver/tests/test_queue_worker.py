import base64
import datetime
import os
import signal
import time
from collections import defaultdict
from contextlib import contextmanager
from inspect import isabstract
from typing import Any, Callable, Dict, Iterator, List, Mapping, Optional
from unittest.mock import MagicMock, patch

import orjson
import time_machine
from django.conf import settings
from django.db.utils import IntegrityError
from django.test import override_settings

from zerver.lib.email_mirror import RateLimitedRealmMirror
from zerver.lib.email_mirror_helpers import encode_email_address
from zerver.lib.queue import MAX_REQUEST_RETRIES
from zerver.lib.rate_limiter import RateLimiterLockingError
from zerver.lib.remote_server import PushNotificationBouncerRetryLaterError
from zerver.lib.send_email import EmailNotDeliveredError, FromAddress
from zerver.lib.test_classes import ZulipTestCase
from zerver.lib.test_helpers import mock_queue_publish
from zerver.models import (
    NotificationTriggers,
    PreregistrationUser,
    ScheduledMessageNotificationEmail,
    UserActivity,
    UserProfile,
    get_client,
    get_realm,
    get_stream,
)
from zerver.tornado.event_queue import build_offline_notification
from zerver.worker import queue_processors
from zerver.worker.queue_processors import (
    EmailSendingWorker,
    FetchLinksEmbedData,
    LoopQueueProcessingWorker,
    MissedMessageWorker,
    QueueProcessingWorker,
    get_active_worker_queues,
)

Event = Dict[str, Any]


class FakeClient:
    def __init__(self, prefetch: int = 0) -> None:
        self.queues: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

    def enqueue(self, queue_name: str, data: Dict[str, Any]) -> None:
        self.queues[queue_name].append(data)

    def start_json_consumer(
        self,
        queue_name: str,
        callback: Callable[[List[Dict[str, Any]]], None],
        batch_size: int = 1,
        timeout: Optional[int] = None,
    ) -> None:
        chunk: List[Dict[str, Any]] = []
        queue = self.queues[queue_name]
        while queue:
            chunk.append(queue.pop(0))
            if len(chunk) >= batch_size or not len(queue):
                callback(chunk)
                chunk = []

    def local_queue_size(self) -> int:
        return sum(len(q) for q in self.queues.values())


@contextmanager
def simulated_queue_client(client: FakeClient) -> Iterator[None]:
    with patch.object(queue_processors, "SimpleQueueClient", lambda *args, **kwargs: client):
        yield


class WorkerTest(ZulipTestCase):
    def test_UserActivityWorker(self) -> None:
        fake_client = FakeClient()

        user = self.example_user("hamlet")
        UserActivity.objects.filter(
            user_profile=user.id,
            client=get_client("ios"),
        ).delete()

        data = dict(
            user_profile_id=user.id,
            client_id=get_client("ios").id,
            time=time.time(),
            query="send_message",
        )
        fake_client.enqueue("user_activity", data)

        # Now process the event a second time and confirm count goes
        # up. Ideally, we'd use an event with a slightly newer
        # time, but it's not really important.
        fake_client.enqueue("user_activity", data)
        with simulated_queue_client(fake_client):
            worker = queue_processors.UserActivityWorker()
            worker.setup()
            worker.start()
            activity_records = UserActivity.objects.filter(
                user_profile=user.id,
                client=get_client("ios"),
            )
            self.assert_length(activity_records, 1)
            self.assertEqual(activity_records[0].count, 2)

    def test_push_notifications_worker(self) -> None:
        """
        The push notifications system has its own comprehensive test suite,
        so we can limit ourselves to simple unit testing the queue processor,
        without going deeper into the system - by mocking the handle_push_notification
        functions to immediately produce the effect we want, to test its handling by the queue
        processor.
        """
        fake_client = FakeClient()

        def fake_publish(
            queue_name: str, event: Dict[str, Any], processor: Callable[[Any], None]
        ) -> None:
            fake_client.enqueue(queue_name, event)

        def generate_new_message_notification() -> Dict[str, Any]:
            return build_offline_notification(1, 1)

        def generate_remove_notification() -> Dict[str, Any]:
            return {
                "type": "remove",
                "user_profile_id": 1,
                "message_ids": [1],
            }

        with simulated_queue_client(fake_client):
            worker = queue_processors.PushNotificationsWorker()
            worker.setup()
            with patch(
                "zerver.worker.queue_processors.handle_push_notification"
            ) as mock_handle_new, patch(
                "zerver.worker.queue_processors.handle_remove_push_notification"
            ) as mock_handle_remove, patch(
                "zerver.worker.queue_processors.initialize_push_notifications"
            ):
                event_new = generate_new_message_notification()
                event_remove = generate_remove_notification()
                fake_client.enqueue("missedmessage_mobile_notifications", event_new)
                fake_client.enqueue("missedmessage_mobile_notifications", event_remove)

                worker.start()
                mock_handle_new.assert_called_once_with(event_new["user_profile_id"], event_new)
                mock_handle_remove.assert_called_once_with(
                    event_remove["user_profile_id"], event_remove["message_ids"]
                )

            with patch(
                "zerver.worker.queue_processors.handle_push_notification",
                side_effect=PushNotificationBouncerRetryLaterError("test"),
            ) as mock_handle_new, patch(
                "zerver.worker.queue_processors.handle_remove_push_notification",
                side_effect=PushNotificationBouncerRetryLaterError("test"),
            ) as mock_handle_remove, patch(
                "zerver.worker.queue_processors.initialize_push_notifications"
            ):
                event_new = generate_new_message_notification()
                event_remove = generate_remove_notification()
                fake_client.enqueue("missedmessage_mobile_notifications", event_new)
                fake_client.enqueue("missedmessage_mobile_notifications", event_remove)

                with mock_queue_publish(
                    "zerver.lib.queue.queue_json_publish", side_effect=fake_publish
                ), self.assertLogs("zerver.worker.queue_processors", "WARNING") as warn_logs:
                    worker.start()
                    self.assertEqual(mock_handle_new.call_count, 1 + MAX_REQUEST_RETRIES)
                    self.assertEqual(mock_handle_remove.call_count, 1 + MAX_REQUEST_RETRIES)
                self.assertEqual(
                    warn_logs.output,
                    [
                        "WARNING:zerver.worker.queue_processors:Maximum retries exceeded for trigger:1 event:push_notification",
                    ]
                    * 2,
                )

    @patch("zerver.worker.queue_processors.mirror_email")
    def test_mirror_worker(self, mock_mirror_email: MagicMock) -> None:
        fake_client = FakeClient()
        stream = get_stream("Denmark", get_realm("zulip"))
        stream_to_address = encode_email_address(stream)
        data = [
            dict(
                msg_base64=base64.b64encode(b"\xf3test").decode(),
                time=time.time(),
                rcpt_to=stream_to_address,
            ),
        ] * 3
        for element in data:
            fake_client.enqueue("email_mirror", element)

        with simulated_queue_client(fake_client):
            worker = queue_processors.MirrorWorker()
            worker.setup()
            worker.start()

        self.assertEqual(mock_mirror_email.call_count, 3)

    @patch("zerver.worker.queue_processors.mirror_email")
    @override_settings(RATE_LIMITING_MIRROR_REALM_RULES=[(10, 2)])
    def test_mirror_worker_rate_limiting(self, mock_mirror_email: MagicMock) -> None:
        fake_client = FakeClient()
        realm = get_realm("zulip")
        RateLimitedRealmMirror(realm).clear_history()
        stream = get_stream("Denmark", realm)
        stream_to_address = encode_email_address(stream)
        data = [
            dict(
                msg_base64=base64.b64encode(b"\xf3test").decode(),
                time=time.time(),
                rcpt_to=stream_to_address,
            ),
        ] * 5
        for element in data:
            fake_client.enqueue("email_mirror", element)

        with simulated_queue_client(fake_client), self.assertLogs(
            "zerver.worker.queue_processors", level="WARNING"
        ) as warn_logs:
            start_time = time.time()
            with patch("time.time", return_value=start_time):
                worker = queue_processors.MirrorWorker()
                worker.setup()
                worker.start()
                # Of the first 5 messages, only 2 should be processed
                # (the rest being rate-limited):
                self.assertEqual(mock_mirror_email.call_count, 2)

                # If a new message is sent into the stream mirror, it will get rejected:
                fake_client.enqueue("email_mirror", data[0])
                worker.start()
                self.assertEqual(mock_mirror_email.call_count, 2)

                # However, message notification emails don't get rate limited:
                with self.settings(EMAIL_GATEWAY_PATTERN="%s@example.com"):
                    address = "mm" + ("x" * 32) + "@example.com"
                    event = dict(
                        msg_base64=base64.b64encode(b"\xf3test").decode(),
                        time=time.time(),
                        rcpt_to=address,
                    )
                    fake_client.enqueue("email_mirror", event)
                    worker.start()
                    self.assertEqual(mock_mirror_email.call_count, 3)

            # After some time passes, emails get accepted again:
            with patch("time.time", return_value=(start_time + 11.0)):
                fake_client.enqueue("email_mirror", data[0])
                worker.start()
                self.assertEqual(mock_mirror_email.call_count, 4)

                # If RateLimiterLockingError is thrown, we rate-limit the new message:
                with patch(
                    "zerver.lib.rate_limiter.RedisRateLimiterBackend.incr_ratelimit",
                    side_effect=RateLimiterLockingError,
                ):
                    with self.assertLogs("zerver.lib.rate_limiter", "WARNING") as mock_warn:
                        fake_client.enqueue("email_mirror", data[0])
                        worker.start()
                        self.assertEqual(mock_mirror_email.call_count, 4)
                        self.assertEqual(
                            mock_warn.output,
                            [
                                "WARNING:zerver.lib.rate_limiter:Deadlock trying to incr_ratelimit for RateLimitedRealmMirror:zulip"
                            ],
                        )
        self.assertEqual(
            warn_logs.output,
            [
                "WARNING:zerver.worker.queue_processors:MirrorWorker: Rejecting an email from: None to realm: zulip - rate limited."
            ]
            * 5,
        )

    def test_email_sending_worker_retries(self) -> None:
        """Tests the retry_send_email_failures decorator to make sure it
        retries sending the email 3 times and then gives up."""
        fake_client = FakeClient()

        data = {
            "template_prefix": "zerver/emails/confirm_new_email",
            "to_emails": [self.example_email("hamlet")],
            "from_name": "Zulip Account Security",
            "from_address": FromAddress.NOREPLY,
            "context": {},
        }
        fake_client.enqueue("email_senders", data)

        def fake_publish(
            queue_name: str, event: Dict[str, Any], processor: Optional[Callable[[Any], None]]
        ) -> None:
            fake_client.enqueue(queue_name, event)

        with simulated_queue_client(fake_client):
            worker = queue_processors.EmailSendingWorker()
            worker.setup()
            with patch(
                "zerver.lib.send_email.build_email", side_effect=EmailNotDeliveredError
            ), mock_queue_publish(
                "zerver.lib.queue.queue_json_publish", side_effect=fake_publish
            ), self.assertLogs(
                level="ERROR"
            ) as m:
                worker.start()
                self.assertIn("failed due to exception EmailNotDeliveredError", m.output[0])

        self.assertEqual(data["failed_tries"], 1 + MAX_REQUEST_RETRIES)

    def test_invites_worker(self) -> None:
        fake_client = FakeClient()
        inviter = self.example_user("iago")
        prereg_alice = PreregistrationUser.objects.create(
            email=self.nonreg_email("alice"), referred_by=inviter, realm=inviter.realm
        )
        PreregistrationUser.objects.create(
            email=self.nonreg_email("bob"), referred_by=inviter, realm=inviter.realm
        )
        invite_expires_in_minutes = 4 * 24 * 60
        data: List[Dict[str, Any]] = [
            dict(
                prereg_id=prereg_alice.id,
                referrer_id=inviter.id,
                invite_expires_in_minutes=invite_expires_in_minutes,
            ),
            dict(
                prereg_id=prereg_alice.id,
                referrer_id=inviter.id,
                email_language="en",
                invite_expires_in_minutes=invite_expires_in_minutes,
            ),
            # Nonexistent prereg_id, as if the invitation was deleted
            dict(
                prereg_id=-1,
                referrer_id=inviter.id,
                invite_expires_in_minutes=invite_expires_in_minutes,
            ),
        ]
        for element in data:
            fake_client.enqueue("invites", element)

        with simulated_queue_client(fake_client):
            worker = queue_processors.ConfirmationEmailWorker()
            worker.setup()
            with patch("zerver.actions.user_settings.send_email"), patch(
                "zerver.worker.queue_processors.send_future_email"
            ) as send_mock:
                worker.start()
                self.assertEqual(send_mock.call_count, 2)

    def test_error_handling(self) -> None:
        processed = []

        @queue_processors.assign_queue("unreliable_worker", is_test_queue=True)
        class UnreliableWorker(queue_processors.QueueProcessingWorker):
            def consume(self, data: Mapping[str, Any]) -> None:
                if data["type"] == "unexpected behaviour":
                    raise Exception("Worker task not performing as expected!")
                processed.append(data["type"])

        fake_client = FakeClient()
        for msg in ["good", "fine", "unexpected behaviour", "back to normal"]:
            fake_client.enqueue("unreliable_worker", {"type": msg})

        fn = os.path.join(settings.QUEUE_ERROR_DIR, "unreliable_worker.errors")
        try:
            os.remove(fn)
        except OSError:  # nocoverage # error handling for the directory not existing
            pass

        with simulated_queue_client(fake_client):
            worker = UnreliableWorker()
            worker.setup()
            with self.assertLogs(level="ERROR") as m:
                worker.start()
                self.assertEqual(
                    m.records[0].message, "Problem handling data on queue unreliable_worker"
                )
                self.assertIn(m.records[0].stack_info, m.output[0])

        self.assertEqual(processed, ["good", "fine", "back to normal"])
        with open(fn) as f:
            line = f.readline().strip()
        events = orjson.loads(line.split("\t")[1])
        self.assert_length(events, 1)
        event = events[0]
        self.assertEqual(event["type"], "unexpected behaviour")

        processed = []

        @queue_processors.assign_queue("unreliable_loopworker", is_test_queue=True)
        class UnreliableLoopWorker(queue_processors.LoopQueueProcessingWorker):
            def consume_batch(self, events: List[Dict[str, Any]]) -> None:
                for event in events:
                    if event["type"] == "unexpected behaviour":
                        raise Exception("Worker task not performing as expected!")
                    processed.append(event["type"])

        for msg in ["good", "fine", "unexpected behaviour", "back to normal"]:
            fake_client.enqueue("unreliable_loopworker", {"type": msg})

        fn = os.path.join(settings.QUEUE_ERROR_DIR, "unreliable_loopworker.errors")
        try:
            os.remove(fn)
        except OSError:  # nocoverage # error handling for the directory not existing
            pass

        with simulated_queue_client(fake_client):
            loopworker = UnreliableLoopWorker()
            loopworker.setup()
            with self.assertLogs(level="ERROR") as m:
                loopworker.start()
                self.assertEqual(
                    m.records[0].message, "Problem handling data on queue unreliable_loopworker"
                )
                self.assertIn(m.records[0].stack_info, m.output[0])

        self.assertEqual(processed, ["good", "fine"])
        with open(fn) as f:
            line = f.readline().strip()
        events = orjson.loads(line.split("\t")[1])
        self.assert_length(events, 4)

        self.assertEqual(
            [event["type"] for event in events],
            ["good", "fine", "unexpected behaviour", "back to normal"],
        )

    def test_timeouts(self) -> None:
        processed = []

        @queue_processors.assign_queue("timeout_worker", is_test_queue=True)
        class TimeoutWorker(queue_processors.QueueProcessingWorker):
            MAX_CONSUME_SECONDS = 1

            def consume(self, data: Mapping[str, Any]) -> None:
                if data["type"] == "timeout":
                    time.sleep(5)
                processed.append(data["type"])

        fake_client = FakeClient()
        for msg in ["good", "fine", "timeout", "back to normal"]:
            fake_client.enqueue("timeout_worker", {"type": msg})

        fn = os.path.join(settings.QUEUE_ERROR_DIR, "timeout_worker.errors")
        try:
            os.remove(fn)
        except OSError:  # nocoverage # error handling for the directory not existing
            pass

        with simulated_queue_client(fake_client):
            worker = TimeoutWorker()
            worker.setup()
            worker.ENABLE_TIMEOUTS = True
            with self.assertLogs(level="ERROR") as m:
                worker.start()
                self.assertEqual(
                    m.records[0].message,
                    "Timed out in timeout_worker after 1 seconds processing 1 events",
                )
                self.assertIn(m.records[0].stack_info, m.output[0])

        self.assertEqual(processed, ["good", "fine", "back to normal"])
        with open(fn) as f:
            line = f.readline().strip()
        events = orjson.loads(line.split("\t")[1])
        self.assert_length(events, 1)
        event = events[0]
        self.assertEqual(event["type"], "timeout")

    def test_embed_links_timeout(self) -> None:
        @queue_processors.assign_queue("timeout_worker", is_test_queue=True)
        class TimeoutWorker(FetchLinksEmbedData):
            MAX_CONSUME_SECONDS = 1

            def consume(self, data: Mapping[str, Any]) -> None:
                # Send SIGALRM to ourselves to simulate a timeout.
                pid = os.getpid()
                os.kill(pid, signal.SIGALRM)

        fake_client = FakeClient()
        fake_client.enqueue(
            "timeout_worker",
            {
                "type": "timeout",
                "message_id": 15,
                "urls": ["first", "second"],
            },
        )

        with simulated_queue_client(fake_client):
            worker = TimeoutWorker()
            worker.setup()
            worker.ENABLE_TIMEOUTS = True
            with self.assertLogs(level="WARNING") as m:
                worker.start()
                self.assertEqual(
                    m.records[0].message,
                    "Timed out in timeout_worker after 1 seconds while fetching URLs for message 15: ['first', 'second']",
                )

    def test_worker_noname(self) -> None:
        class TestWorker(queue_processors.QueueProcessingWorker):
            def __init__(self) -> None:
                super().__init__()

            def consume(self, data: Mapping[str, Any]) -> None:
                pass  # nocoverage # this is intentionally not called

        with self.assertRaises(queue_processors.WorkerDeclarationError):
            TestWorker()

    def test_get_active_worker_queues(self) -> None:
        test_queue_names = set(get_active_worker_queues(only_test_queues=True))
        worker_queue_names = {
            queue_class.queue_name
            for base in [QueueProcessingWorker, EmailSendingWorker, LoopQueueProcessingWorker]
            for queue_class in base.__subclasses__()
            if not isabstract(queue_class)
        }

        # Verify that the set of active worker queues equals the set
        # of subclasses without is_test_queue set.
        self.assertEqual(set(get_active_worker_queues()), worker_queue_names - test_queue_names)
