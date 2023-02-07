import logging
import secrets
import urllib
from email.headerregistry import Address
from functools import wraps
from typing import TYPE_CHECKING, Any, Callable, Dict, List, Mapping, Optional, cast
from urllib.parse import urlencode

import jwt
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.views import LoginView as DjangoLoginView
from django.contrib.auth.views import PasswordResetView as DjangoPasswordResetView
from django.contrib.auth.views import logout_then_login as django_logout_then_login
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.forms import Form
from django.http import HttpRequest, HttpResponse, HttpResponseRedirect, HttpResponseServerError
from django.shortcuts import redirect, render
from django.template.response import SimpleTemplateResponse
from django.urls import reverse
from django.utils.html import escape
from django.utils.http import url_has_allowed_host_and_scheme
from django.utils.translation import gettext as _
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_safe
from django.template import loader
from django.views.generic import TemplateView
from django.views.decorators.csrf import csrf_protect
from django.utils.decorators import method_decorator
from zerver.decorator import zulip_login_required, require_server_admin

import subprocess

@require_server_admin
def run_script(request):
    context = {
        'output': '',
        'PAGE_TITLE': 'Reports',
        'title': 'Script Name Here'
    }
    if request.method == "POST":
        script = "/home/vagrant/zulip/test.sh"
        result = subprocess.run(script, stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=True)
        output = result.stdout.decode("utf-8")
        context['output'] = output
    return render(request, "/zerver/script_output.html", context)


@require_server_admin
def drc_reports(request: HttpRequest) -> HttpResponse:
    if request.method == 'POST':
        print('****************post****************')
        print(type(request))
        print(request.method)
        print(request.content_params)
        return run_script(request)

    context = {
        'PAGE_TITLE': 'Reports',
        'title': 'Zulip Reports'
    }

    return render(
        request,
        '/zerver/drc_reports.html',
        context,
    )


@require_server_admin
def drc_maintenance(request: HttpRequest) -> HttpResponse:
    if request.method == 'POST':
        print(request)
        return run_script(request)

    context = {
        'PAGE_TITLE': 'Maintenance',
        'title': 'Zulip Maintenance'
    }

    return render(
        request,
        '/zerver/drc_maintenance.html',
        context,
    )










# @method_decorator(csrf_exempt, name='dispatch')
# @zulip_login_required
# @require_server_admin
# class DRC_Rerpot_View(TemplateView):
#     template_name = '/zerver/drc_reports.html'
#
#     def add_test_context(self, context) -> Dict[str, Any]:
#         context['test'] = 'this_is_a_test!!!!!'
#         return context
#
#
#     def get_context_data(self, **kwargs: Any) -> Dict[str, Any]:
#         context: Dict[str, Any] = super().get_context_data(**kwargs)
#         context['PAGE_TITLE'] = 'Reports'
#         context = self.add_test_context(context)
#         return context
#
#     def post(self, request):
#         return run_script(request)
#
#     # def __init__(self, request: HttpRequest):
