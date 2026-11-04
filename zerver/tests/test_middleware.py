import time
from unittest.mock import patch

from bs4 import BeautifulSoup
from django.http import HttpResponse
from django.test import override_settings

from zerver.actions.realm_settings import do_set_realm_property
from zerver.lib.realm_icon import get_realm_icon_url
from zerver.lib.request import RequestNotes
from zerver.lib.test_classes import ZulipTestCase
from zerver.lib.test_helpers import HostRequestMock
from zerver.lib.utils import assert_is_not_none
from zerver.middleware import LogRequests, is_slow_query, write_log_line
from zerver.models.realms import get_realm
from zilencer.models import RemoteZulipServer
from zproject import default_settings


@override_settings(
    BLOCKED_CLIENT_NAMES=default_settings.BLOCKED_CLIENT_NAMES,
    BLOCKED_USER_AGENTS=default_settings.BLOCKED_USER_AGENTS,
)
class BlockClientsTest(ZulipTestCase):
    error_message = "Mobile and desktop apps are disabled. Please use a web browser."

    def test_blocked_apps(self) -> None:
        for user_agent in [
            "ZulipMobile/27.0 (Android 14)",
            "ZulipMobile/27.0 (iOS 17.4)",
            "ZulipFlutter/0.0.15+15 (Android 14)",
            "ZulipFlutter",
            "ZulipElectron/5.0.0 Mozilla/5.0",
            "ZulipDesktop/0.4.4 (Mac)",
            "ZulipAndroid/1.0",
            "ZulipiOS/1.0",
            "Dart/3.5 (dart:io)",
            "Mozilla/5.0 Chrome/120.0 Electron/28.0 Safari/537.36",
            "zulipmobile/27.0",
            "ZulipMobile/27.0 ISLAND",
        ]:
            for path in ["/login/", "/login_local/", "/api/v1/server_settings"]:
                with self.subTest(user_agent=user_agent, path=path):
                    response = self.client_get(path, HTTP_USER_AGENT=user_agent)
                    self.assert_json_error(response, self.error_message, 403)

    @override_settings(EDIRECT_REDIRECT="https://example.com/sso")
    def test_app_blocking_precedes_login_redirect(self) -> None:
        response = self.client_get("/login/", HTTP_USER_AGENT="ZulipElectron/5.0.0")
        self.assert_json_error(response, self.error_message, 403)

        response = self.client_get("/login/")
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], "https://example.com/sso")

    def test_client_parameter_cannot_hide_blocked_user_agent(self) -> None:
        for client in ["website", "Unspecified", ""]:
            with self.subTest(client=client):
                response = self.client_get(
                    "/api/v1/server_settings",
                    {"client": client},
                    HTTP_USER_AGENT="ZulipFlutter/0.0.15+15 (iOS 17.4)",
                )
                self.assert_json_error(response, self.error_message, 403)
                response = self.client_post(
                    "/api/v1/fetch_api_key",
                    {"client": client},
                    HTTP_USER_AGENT="ZulipMobile/27.0 (Android 14)",
                )
                self.assert_json_error(response, self.error_message, 403)

    def test_blocked_client_parameter(self) -> None:
        for client in ["ZulipMobile", "ZulipFlutter", "ZulipElectron", "zulipmobile"]:
            with self.subTest(client=client):
                response = self.client_get("/api/v1/server_settings", {"client": client})
                self.assert_json_error(response, self.error_message, 403)
                response = self.client_post("/api/v1/fetch_api_key", {"client": client})
                self.assert_json_error(response, self.error_message, 403)

    def test_existing_app_credentials_are_blocked(self) -> None:
        hamlet = self.example_user("hamlet")
        self.login("hamlet")
        for user_agent in ["ZulipMobile/27.0", "ZulipFlutter", "ZulipElectron/5.0.0"]:
            with self.subTest(user_agent=user_agent):
                response = self.client_get("/", HTTP_USER_AGENT=user_agent)
                self.assert_json_error(response, self.error_message, 403)
                response = self.api_get(hamlet, "/api/v1/users/me", HTTP_USER_AGENT=user_agent)
                self.assert_json_error(response, self.error_message, 403)

        self.assert_json_success(
            self.api_get(hamlet, "/api/v1/users/me", HTTP_USER_AGENT="Mozilla/5.0")
        )

    def test_browsers_are_allowed(self) -> None:
        for user_agent in [
            "",
            "Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36",
            "Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36",
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Mobile/15E148 Safari/604.1",
            "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) Mobile/15E148 Safari/604.1",
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) ISLAND/1.0",
        ]:
            with self.subTest(user_agent=user_agent):
                for path in ["/login/", "/login_local/"]:
                    response = self.client_get(path, HTTP_USER_AGENT=user_agent)
                    self.assertEqual(response.status_code, 200)
                response = self.client_get("/api/v1/server_settings", HTTP_USER_AGENT=user_agent)
                self.assert_json_success(response)

        response = self.client_get("/api/v1/server_settings", skip_user_agent=True)
        self.assert_json_success(response)

    def test_blocking_settings(self) -> None:
        with self.settings(BLOCKED_CLIENT_NAMES=set(), BLOCKED_USER_AGENTS=[]):
            response = self.client_get(
                "/api/v1/server_settings", HTTP_USER_AGENT="ZulipMobile/27.0"
            )
            self.assert_json_success(response)

        with self.settings(BLOCKED_CLIENT_NAMES=set(), BLOCKED_USER_AGENTS=["CustomApp"]):
            response = self.client_get("/api/v1/server_settings", HTTP_USER_AGENT="customapp/1.0")
            self.assert_json_error(response, self.error_message, 403)


class SlowQueryTest(ZulipTestCase):
    SLOW_QUERY_TIME = 10
    log_data = {
        "extra": "[transport=websocket]",
        "time_started": 0,
        "markdown_requests_start": 0,
        "markdown_time_start": 0,
        "remote_cache_time_start": 0,
        "remote_cache_requests_start": 0,
    }

    def test_is_slow_query(self) -> None:
        self.assertFalse(is_slow_query(1.1, "/some/random/url"))
        self.assertTrue(is_slow_query(2, "/some/random/url"))
        self.assertTrue(is_slow_query(5.1, "/activity"))
        self.assertFalse(is_slow_query(2, "/activity"))
        self.assertFalse(is_slow_query(2, "/realm_activity/whatever"))
        self.assertFalse(is_slow_query(2, "/user_activity/whatever"))

    def test_slow_query_log(self) -> None:
        self.log_data["time_started"] = time.time() - self.SLOW_QUERY_TIME
        with (
            self.assertLogs("zulip.slow_queries", level="INFO") as slow_query_logger,
            self.assertLogs("zulip.requests", level="INFO") as middleware_normal_logger,
        ):
            write_log_line(
                self.log_data,
                path="/some/endpoint/",
                method="GET",
                remote_ip="123.456.789.012",
                requester_for_logs="unknown",
                client_name="?",
            )
            self.assert_length(middleware_normal_logger.output, 1)
            self.assert_length(slow_query_logger.output, 1)

            self.assertRegex(
                slow_query_logger.output[0],
                r"123\.456\.789\.012 GET     200 10\.\ds .* \(unknown via \?\)",
            )


class OpenGraphTest(ZulipTestCase):
    def check_title_and_description(
        self,
        path: str,
        title: str,
        in_description: list[str],
        not_in_description: list[str],
        status_code: int = 200,
    ) -> None:
        response = self.client_get(path)
        self.assertEqual(response.status_code, status_code)
        bs = BeautifulSoup(response.content, features="lxml")
        open_graph_title = assert_is_not_none(bs.select_one('meta[property="og:title"]')).get(
            "content"
        )
        self.assertEqual(open_graph_title, title)

        open_graph_description = assert_is_not_none(
            bs.select_one('meta[property="og:description"]')
        ).get("content")
        assert isinstance(open_graph_description, str)
        for substring in in_description:
            self.assertIn(substring, open_graph_description)
        for substring in not_in_description:
            self.assertNotIn(substring, open_graph_description)

    def test_index_pages(self) -> None:
        self.check_title_and_description(
            "/api/",
            "Zulip API documentation",
            [
                (
                    "Zulip's APIs allow you to integrate other services with Zulip. This "
                    "guide should help you find the API you need:"
                )
            ],
            # This is added to maintain coverage for the not_in_description
            # block since we might want to keep using that for future tests.
            ["No such article."],
        )

    def test_nonexistent_page(self) -> None:
        self.check_title_and_description(
            "/api/not-a-real-page",
            # Probably we should make this "Zulip help center"
            "No such article. | Zulip API documentation",
            [
                "No such article.",
                "Your feedback helps us make Zulip better for everyone! Please contact us",
            ],
            [],
            # Test that our open graph logic doesn't throw a 500
            404,
        )

    def test_login_page_simple_description(self) -> None:
        name = "Zulip Dev"
        description = (
            "The Zulip development environment default organization. It's great for testing!"
        )

        self.check_title_and_description("/login/", name, [description], [])

    def test_login_page_markdown_description(self) -> None:
        realm = get_realm("zulip")
        description = (
            "Welcome to **Clojurians Zulip** - the place where the Clojure community meets.\n\n"
            "Before you signup/login:\n\n"
            "* note-1\n"
            "* note-2\n"
            "* note-3\n\n"
            "Enjoy!"
        )
        do_set_realm_property(realm, "description", description, acting_user=None)

        self.check_title_and_description(
            "/login/",
            "Zulip Dev",
            [
                "Welcome to Clojurians Zulip - the place where the Clojure community meets",
                "* note-1 * note-2 * note-3 | Enjoy!",
            ],
            [],
        )

    def test_login_page_realm_icon(self) -> None:
        realm = get_realm("zulip")
        realm.icon_source = "U"
        realm.save(update_fields=["icon_source"])
        realm_icon = get_realm_icon_url(realm)

        response = self.client_get("/login/")
        self.assertEqual(response.status_code, 200)

        bs = BeautifulSoup(response.content, features="lxml")
        open_graph_image = assert_is_not_none(bs.select_one('meta[property="og:image"]')).get(
            "content"
        )
        self.assertEqual(open_graph_image, f"{realm.url}{realm_icon}")

    def test_login_page_realm_icon_absolute_url(self) -> None:
        realm = get_realm("zulip")
        realm.icon_source = "U"
        realm.save(update_fields=["icon_source"])
        icon_url = f"https://foo.s3.amazonaws.com/{realm.id}/realm/icon.png?version={1}"
        with patch("zerver.lib.realm_icon.get_uploaded_realm_icon_url", return_value=icon_url):
            response = self.client_get("/login/")
        self.assertEqual(response.status_code, 200)

        bs = BeautifulSoup(response.content, features="lxml")
        open_graph_image = assert_is_not_none(bs.select_one('meta[property="og:image"]')).get(
            "content"
        )
        self.assertEqual(open_graph_image, icon_url)

    def test_no_realm_api_page_og_url(self) -> None:
        response = self.client_get("/api/", subdomain="")
        self.assertEqual(response.status_code, 200)

        bs = BeautifulSoup(response.content, features="lxml")
        open_graph_url = assert_is_not_none(bs.select_one('meta[property="og:url"]')).get("content")

        assert isinstance(open_graph_url, str)
        self.assertTrue(open_graph_url.endswith("/api/"))


class LogRequestsTest(ZulipTestCase):
    meta_data = {"REMOTE_ADDR": "127.0.0.1"}

    def test_requester_for_logs_as_user(self) -> None:
        hamlet = self.example_user("hamlet")
        request = HostRequestMock(user_profile=hamlet, meta_data=self.meta_data)
        RequestNotes.get_notes(request).log_data = None

        with self.assertLogs("zulip.requests", level="INFO") as m:
            LogRequests(lambda _: HttpResponse())(request)
            self.assertIn(hamlet.format_requester_for_logs(), m.output[0])

    def test_requester_for_logs_as_remote_server(self) -> None:
        remote_server = RemoteZulipServer()
        request = HostRequestMock(remote_server=remote_server, meta_data=self.meta_data)
        RequestNotes.get_notes(request).log_data = None

        with self.assertLogs("zulip.requests", level="INFO") as m:
            LogRequests(lambda _: HttpResponse())(request)
            self.assertIn(remote_server.format_requester_for_logs(), m.output[0])

    def test_requester_for_logs_unauthenticated(self) -> None:
        request = HostRequestMock(meta_data=self.meta_data)
        RequestNotes.get_notes(request).log_data = None

        expected_requester = "unauth@root"
        with self.assertLogs("zulip.requests", level="INFO") as m:
            LogRequests(lambda _: HttpResponse())(request)
            self.assertIn(expected_requester, m.output[0])
