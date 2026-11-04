from typing import Any

from django.conf import settings
from django.http import HttpRequest, HttpResponse, HttpResponseRedirect

from zerver.views.auth import login_page


def edirect(request: HttpRequest, **kwargs: Any) -> HttpResponse:
    """Send /login/ to the external SSO portal; the standard Zulip login
    page remains available at /login_local/ for local logins."""
    if settings.EDIRECT_REDIRECT is None:
        return login_page(request, **kwargs)
    return HttpResponseRedirect(settings.EDIRECT_REDIRECT)
