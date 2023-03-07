# DRC MODIFICATION
import logging
import secrets
import urllib
import os
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
from zerver.decorator import zulip_login_required, require_owner
from zerver.models import get_user_by_delivery_email, UserProfile

import subprocess
from datetime import datetime, timedelta

# SCRIPTS_DIR = f"/home/vagrant/zulip/zerver/drc_scripts"
SCRIPTS_DIR = os.path.join(os.getcwd(), 'zerver/drc_scripts')

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
    },
    'update_enable_login_emails': {
        'pretty_name': 'Disable Login Emails',
        'script_name': 'users_enable_login_emails_update.sh'
    },
    'get_user_activity': {
        'pretty_name': 'Get User Activity',
        'script_name': 'get_user_activity.sh'
    }
}


def get_script_name(request):
    for item in request.POST:
        if(item in allowed_scripts):
            return allowed_scripts[item]

    return None


# @require_server_admin
# @require_realm_owner
def run_script(request: HttpRequest, user_profile: UserProfile , script_info: str):
    context = {
        'output': '',
        'PAGE_TITLE': 'Reports',
        'title':  script_info['pretty_name']
    }
    script_name = script_info['script_name']

    if(script_name == 'users_role_get.sh'):
        output = get_user_role(request, script_name)
    elif(script_name == 'messages_user_get.sh'):
        output = get_user_messages(request, script_name)
    elif(script_name == 'conversation_between_two_users_date_range_get.sh'):
        output = get_conversation(request, script_name)
    elif(script_name == 'messages_user_get.sh'):
        output = get_user_messages(request, script_name)
    elif(script_name == 'conversation_for_a_stream_get.sh'):
        output = get_stream_messages(request, script_name)
    elif(script_name == 'subscriptions_for_user_get.sh'):
        output = get_user_subscriptions(request, script_name)
    elif(script_name == 'mutedtopics_get.sh'):
        output = get_muted_topics(request, script_name)
    elif(script_name == 'mobiledevices_get.sh'):
        output = get_mobile_devices(request, script_name)
    elif(script_name == 'users_enable_login_emails_get.sh'):
        output = enable_login_emails(request, script_name)
    elif(script_name == 'users_enable_login_emails_update.sh'):
        output = update_login_emails(request, script_name)
    elif(script_name == 'get_user_activity.sh'):
        output = get_user_activity(request, script_name)
    else:
        output = ''

    context['output'] = output

    return render(request, "/zerver/script_output.html", context)


@require_owner
def drc_maintenance(request: HttpRequest) -> HttpResponse:
    user_profile = request.user

    if request.method == 'POST':
        script = get_script_name(request)
        return run_script(request, user_profile, script)

    context = {
        'PAGE_TITLE': 'Maintenance',
        'title': 'Zulip Maintenance',
        'whoami': request.user.delivery_email
    }

    return render(
        request,
        '/zerver/drc_maintenance.html',
        context,
    )


@require_owner
def drc_reports(request: HttpRequest) -> HttpResponse:
    user_profile = request.user

    if request.method == 'POST':
        script = get_script_name(request)
        return run_script(request, user_profile, script)

    now = datetime.now().strftime("%Y-%m-%d")
    last_month = datetime.now() - timedelta(days=30)
    last_month = last_month.strftime("%Y-%m-%d")

    context = {
        'PAGE_TITLE': 'Reports',
        'title': 'Zulip Reports',
        'whoami': request.user.delivery_email,
        'today': now,
        'last_month': last_month
    }

    return render(
        request,
        '/zerver/drc_reports.html',
        context,
    )


def get_user_role(request: HttpRequest, script_name: str):
    email = request.POST.get('send_to')
    script = f"{SCRIPTS_DIR}/reports/{script_name} {email}"

    result = subprocess.run(script, stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=True)
    output = result.stdout.decode("utf-8")

    return output


def get_conversation(request: HttpRequest, script_name: str):
    email = request.POST.get('send_to')
    email_1 = request.POST.get('email_1')
    email_2 = request.POST.get('email_2')
    start_date = request.POST.get('start-date')
    end_date = request.POST.get('end-date')

    script = f"{SCRIPTS_DIR}/reports/{script_name} {email_1} {email_2} {email} {start_date} {end_date} csv"

    result = subprocess.run(script, stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=True)
    output = result.stdout.decode("utf-8")

    return output


def get_user_messages(request: HttpRequest, script_name: str):
    email = request.POST.get('send_to')
    email_1 = request.POST.get('email_1')

    script = f"{SCRIPTS_DIR}/reports/{script_name} {email} {email_1} csv"

    result = subprocess.run(script, stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=True)
    output = result.stdout.decode("utf-8")

    return output


def get_stream_messages(request: HttpRequest, script_name: str):
    email = request.POST.get('send_to')
    stream_name = request.POST.get('stream_name')

    script = f"{SCRIPTS_DIR}/reports/{script_name} {stream_name} {email} csv"

    result = subprocess.run(script, stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=True)
    output = result.stdout.decode("utf-8")

    return output


def get_user_subscriptions(request: HttpRequest, script_name: str):
    email = request.user.delivery_email
    email_1 = request.POST.get('email_1')

    script = f"{SCRIPTS_DIR}/reports/{script_name} {email_1} csv"

    result = subprocess.run(script, stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=True)
    output = result.stdout.decode("utf-8")

    return output


def get_muted_topics(request: HttpRequest, script_name: str):
    email = request.user.delivery_email
    email_1 = request.POST.get('email_to')

    script = f"{SCRIPTS_DIR}/reports/{script_name} {email_1} csv"

    result = subprocess.run(script, stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=True)
    output = result.stdout.decode("utf-8")

    return output


def get_mobile_devices(request: HttpRequest, script_name: str):
    script = f"{SCRIPTS_DIR}/reports/{script_name}"

    result = subprocess.run(script, stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=True)
    output = result.stdout.decode("utf-8")

    return output


def enable_login_emails(request: HttpRequest, script_name: str):
    script = f"{SCRIPTS_DIR}/reports/{script_name}"

    result = subprocess.run(script, stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=True)
    output = result.stdout.decode("utf-8")

    return output


def update_login_emails(request: HttpRequest, script_name: str):
    script = f"{SCRIPTS_DIR}/maint/{script_name}"

    result = subprocess.run(script, stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=True)
    output = result.stdout.decode("utf-8")

    return output


def get_user_activity(request: HttpRequest, script_name: str):
    email_1 = request.POST.get('email_1')
    start_date = request.POST.get('start-date')
    end_date = request.POST.get('end-date')

    script = f"{SCRIPTS_DIR}/reports/{script_name} {email_1} {start_date} {end_date} ./get_user_activity.txt"

    result = subprocess.run(script, stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=True)
    output = result.stdout.decode("utf-8")
    error = result.stderr.decode("utf-8")

    if(error):
        output = output + '\nERRORS FOUND IN SCRIPT:\n' +  error

    return output
