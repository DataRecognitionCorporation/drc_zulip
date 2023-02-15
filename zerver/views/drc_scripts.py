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

allowed_scripts = {
    'get_conversation': {
        'pretty_name': 'Get Conversation',
        'script_name': 'conversation_between_two_users_date_range_get.sh'
    },
    'messages_user_get': {
        'pretty_name': 'Get User Messages',
        'script_name': 'messages_user_get.sh'
    },
    'users_role_get': {
        'pretty_name': 'Get User Roles',
        'script_name': 'users_role_get.sh'
    },
    'subscriptions_for_user_get': {
        'pretty_name': 'Get User Subscriptions',
        'script_name': 'subscriptions_for_user_get.sh'
    },
    'muted_topics_get': {
        'pretty_name': 'Get Muted Topics',
        'script_name': 'mutedtopics_get.sh'
    },
    'conversation_for_a_stream_get': {
        'pretty_name': 'Get Stream Conversation',
        'script_name': 'conversation_for_a_stream_get.sh'
    },
    'get_mobile_devices': {
        'pretty_name': 'Get Mobile Services',
        'script_name': 'mobiledevices_get.sh'
    },
    'enable_login_emails': {
        'pretty_name': 'Enable Login Emails',
        'script_name': 'users_enable_login_emails_get.sh'
    }
}

def get_script_name(request):
    for item in request.POST:
        if(item in allowed_scripts):
            return allowed_scripts[item]

    return None


@require_server_admin
def run_script(request, script_info):
    context = {
        'output': '',
        'PAGE_TITLE': 'Reports',
        'title':  script_info['pretty_name']
    }
    # if request.method == "POST":
    script_name = script_info['script_name']
    script = f"/home/vagrant/zulip/tools/drc_scripts/reports/{script_name}"

    result = subprocess.run(script, stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=True)
    output = result.stdout.decode("utf-8")
    # if not(result.stderr == None):
    #     context['output'] = result.stderr.decode('utf-8')

    # else:
    context['output'] = output

    return render(request, "/zerver/script_output.html", context)


@require_server_admin
def drc_reports(request: HttpRequest) -> HttpResponse:
    if request.method == 'POST':
        print('****************post****************')
        # print(type(request))
        # print(request.method)
        # print(request.POST)
        script = get_script_name(request)
        print(script)
        return run_script(request, script)

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
