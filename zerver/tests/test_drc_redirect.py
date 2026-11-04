from django.test import override_settings

from zerver.lib.test_classes import ZulipTestCase

PORTAL_URL = "https://portal.example.com/#/login/DRCPORTAL"


class EdirectLoginTest(ZulipTestCase):
    @override_settings(EDIRECT_REDIRECT=PORTAL_URL)
    def test_login_redirects_to_portal(self) -> None:
        result = self.client_get("/login/")
        self.assertEqual(result.status_code, 302)
        self.assertEqual(result["Location"], PORTAL_URL)

    @override_settings(EDIRECT_REDIRECT=PORTAL_URL)
    def test_login_local_serves_login_page(self) -> None:
        result = self.client_get("/login_local/")
        self.assert_in_success_response(["Log in to Zulip"], result)

    @override_settings(EDIRECT_REDIRECT=None)
    def test_login_without_portal_serves_login_page(self) -> None:
        result = self.client_get("/login/")
        self.assert_in_success_response(["Log in to Zulip"], result)
