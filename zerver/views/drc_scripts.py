from django.db.models.deletion import sql
from django.http import HttpRequest, HttpResponse
from django.shortcuts import render

from zerver.models import UserProfile
import os
from zerver.models.users import get_user_profile_by_email
from zerver.lib.exceptions import (
    AccessDeniedError,
    IncompatibleParametersError,
    UnauthorizedError,
)
from zerver.lib.send_email import send_email
from django.db import connection
from psycopg2.sql import SQL, Literal
import csv
from io import StringIO

from datetime import datetime, timedelta

SCRIPTS_DIR = os.path.join(os.getcwd(), 'zerver/drc_scripts')
DELIMITER = '|'


def send_report(to_emails: list, context={}, request=None, csv_values=None, csv_file_name='data.csv'):
    send_email(
        "zerver/emails/drc_reports",
        to_user_ids = None,
        to_emails = to_emails,
        from_name = 'noreply',
        from_address = 'noreply@zulip.com',
        reply_to_email = 'noreply@zulip.com',
        language = None,
        context = context,
        realm = None,
        connection = None,
        dry_run = False,
        request = request,
        csvfile_values = csv_values,
        csv_file_name = csv_file_name,
    )


def dictfetchall(cursor):
    """
    Return all rows from a cursor as a dict.
    Assume the column names are unique.
    """
    columns = [col[0] for col in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def csv_to_html_table(csv_string: str, delimeter = DELIMITER) -> str:
    # Split the CSV string into rows
    rows = csv_string.splitlines()

    # Extract the headers (first row)
    headers = rows[0].split(delimeter)

    # Start HTML table
    html = '<table border="1" style="border-collapse: collapse; width: 100%;">'

    # Add header row
    html += '<tr>'
    for header in headers:
        html += f'<th>{header}</th>'
    html += '</tr>'

    # Add data rows
    for row in rows[1:]:
        html += '<tr>'
        cells = row.split(delimeter)
        for cell in cells:
            html += f'<td>{cell}</td>'
        html += '</tr>'

    # Close the table
    html += '</table>'

    return html


def results_as_csv(results, delimiter=DELIMITER):
    csvfile = StringIO()
    writer = csv.writer(csvfile, delimiter=delimiter)
    header = results[0].keys()
    writer.writerow(header)
    for result in results:
        writer.writerow(result.values())

    return csvfile


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
    return_val = None
    for item in request.POST:
        if(item in allowed_scripts):
            return_val = allowed_scripts[item]
            return return_val

    raise IncompatibleParametersError([])


def run_script(request: HttpRequest, script_info: str):
    context = {
        'output': '',
        'PAGE_TITLE': 'Reports',
        'title': script_info['pretty_name']
    }
    script_name = script_info['script_name']

    if(script_name == 'users_role_get.sh'):
        output = get_user_role(request)
    elif(script_name == 'messages_user_get.sh'):
        output = get_user_messages(request)
    elif(script_name == 'conversation_between_two_users_date_range_get.sh'):
        output = get_conversation(request)
    elif(script_name == 'messages_user_get.sh'):
        output = get_user_messages(request)
    elif(script_name == 'conversation_for_a_stream_get.sh'):
        output = get_stream_messages(request)
    elif(script_name == 'subscriptions_for_user_get.sh'):
        output = get_user_subscriptions(request)
    elif(script_name == 'mutedtopics_get.sh'):
        output = get_muted_topics(request)
    elif(script_name == 'mobiledevices_get.sh'):
        output = get_mobile_devices(request)
    elif(script_name == 'users_enable_login_emails_get.sh'):
        output = enable_login_emails(request)
    elif(script_name == 'users_enable_login_emails_update.sh'):
        output = update_login_emails(request)
    elif(script_name == 'get_user_activity.sh'):
        output = get_user_activity(request)
    else:
        output = ''

    context['output'] = output

    return render(request, "/zerver/script_output.html", context)


def drc_maintenance(request: HttpRequest) -> HttpResponse:
    try:
        user_profile: UserProfile = get_user_profile_by_email(request.user.delivery_email)
    except:
        raise AccessDeniedError

    if(user_profile.role > 200):
        raise UnauthorizedError


    if request.method == 'POST':
        script = get_script_name(request)
        return run_script(request, script)

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


def drc_reports(request: HttpRequest) -> HttpResponse:
    try:
        user_profile: UserProfile = get_user_profile_by_email(request.user.delivery_email)
    except:
        raise AccessDeniedError

    if(user_profile.role > 200):
        raise UnauthorizedError


    if request.method == 'POST':
        script = get_script_name(request)
        return run_script(request, script)

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


def get_user_role(request: HttpRequest):
    email = request.POST.get('send_to')

    csv_file_name = 'user_roles.csv'

    sqlstmt = SQL(
        """
        SELECT role,full_name,delivery_email,is_active
        FROM zerver_userprofile
        WHERE zerver_userprofile.role <= 400
        ORDER BY ROLE,is_active,full_name;
        """
    )
    with connection.cursor() as cursor:
        cursor.execute(sqlstmt)
        results = dictfetchall(cursor)

    csvfile = results_as_csv(results)

    context = {
        'email_subject': 'Get User Roles',
        'email_body': 'Please see attached report for roles.'
    }
    send_report([email], context, request, csvfile.getvalue(), csv_file_name)

    return csv_to_html_table(csvfile.getvalue(), DELIMITER)


def get_conversation(request: HttpRequest):
    email = request.POST.get('send_to')
    email_1 = request.POST.get('email_1')
    email_2 = request.POST.get('email_2')
    start_date = request.POST.get('start-date')
    end_date = request.POST.get('end-date')

    csv_file_name = 'conversation.csv'

    sqlstmt = SQL(
        """
        SELECT message.id AS message_id, content AS message_content, message.edit_history AS message_edits, message.last_edit_time AS last_edited,
        profile_sending.full_name AS sender, profile_sending.delivery_email AS sender_email, profile_recieving.full_name AS recipient,
        profile_recieving.delivery_email AS recipient_email, client.name AS sending_device,date_sent
        FROM zerver_message AS message
        INNER JOIN zerver_userprofile AS profile_sending ON message.sender_id = profile_sending.id
        INNER JOIN zerver_recipient AS recipients ON message.recipient_id = recipients.id
        INNER JOIN zerver_userprofile AS profile_recieving ON recipients.type_id = profile_recieving.id
        INNER JOIN zerver_client AS client ON message.sending_client_id = client.id
        WHERE ((profile_sending.delivery_email = {email_1} AND profile_recieving.delivery_email = {email_2})
        OR (profile_sending.delivery_email = {email_2} AND profile_recieving.delivery_email = {email_1}))
        AND date_sent BETWEEN {start_date} AND {end_date}
        ORDER BY date_sent;
        """
    ).format(
        email_1=Literal(email_1),
        email_2=Literal(email_2),
        start_date=Literal(start_date),
        end_date=Literal(end_date),
    )

    with connection.cursor() as cursor:
        cursor.execute(sqlstmt)
        results = dictfetchall(cursor)

    if(results != []):
        csvfile = results_as_csv(results)
        context = {
            'email_subject': 'Get Conversation',
            'email_body': 'Please see attached for report.'
        }
        send_report([email], context, request, csvfile.getvalue(), csv_file_name)
        output = f'Conversation has been sent to {email}'
    else:
        output = f'No conversation between {email_1} and {email_2} between dates {start_date} and {end_date}.'

    return output


def get_user_messages(request: HttpRequest):
    email = request.POST.get('send_to')
    email_1 = request.POST.get('email_1')

    csv_file_name = 'user_messages.csv'

    sqlstmt = SQL(
        """
        SELECT message.content AS message_content,
        message.date_sent AS message_sent,
        message.edit_history AS message_edits,
        message.last_edit_time AS message_last_edited,
        profile_sending.full_name AS sender,
        profile_sending.delivery_email AS sender_email,
        profile_recieving.full_name AS recipient,
        profile_recieving.delivery_email AS recipient_email,
        client.name AS sending_device
        FROM zerver_message AS message
        INNER JOIN zerver_userprofile AS profile_sending ON message.sender_id = profile_sending.id
        INNER JOIN zerver_recipient AS recipients ON message.recipient_id = recipients.id
        INNER JOIN zerver_userprofile AS profile_recieving ON recipients.type_id = profile_recieving.id
        INNER JOIN zerver_client AS client ON message.sending_client_id = client.id
        WHERE ((profile_sending.delivery_email = {email_1}) OR (profile_recieving.delivery_email = {email_1})) ORDER BY date_sent;
        """
    ).format(
        email_1=Literal(email_1),
    )

    with connection.cursor() as cursor:
        cursor.execute(sqlstmt)
        results = dictfetchall(cursor)

    if(results != []):
        csvfile = results_as_csv(results)
        context = {
            'email_subject': 'Get User Messages',
            'email_body': 'Please see attached for report.'
        }
        send_report([email], context, request, csvfile.getvalue(), csv_file_name)
        output = f'Messages have been sent to {email}'
    else:
        output = f'No messages found for user {email_1}.'

    return output


def get_stream_messages(request: HttpRequest):
    email = request.POST.get('send_to')
    stream_name = request.POST.get('stream_name')
    csv_file_name = 'stream_messages.csv'

    sqlstmt = SQL(
        """
        SELECT message.id AS message_id, content AS message_content, profile_sending.full_name AS sender, profile_sending.delivery_email AS sender_email, client.name AS sending_device,date_sent
        FROM zerver_message as message
        INNER JOIN zerver_recipient AS recipients ON recipients.id = message.recipient_id
        INNER JOIN zerver_stream as stream on recipients.type_id = stream.id
        INNER JOIN zerver_userprofile AS profile_sending ON message.sender_id = profile_sending.id
        INNER JOIN zerver_client AS client ON message.sending_client_id = client.id
        WHERE stream.name = {stream_name}
        ORDER BY message.date_sent;
        """
    ).format(
        stream_name=Literal(stream_name),
    )

    with connection.cursor() as cursor:
        cursor.execute(sqlstmt)
        results = dictfetchall(cursor)

    if(results != []):
        csvfile = results_as_csv(results)
        context = {
            'email_subject': 'Get Stream Messages',
            'email_body': 'Please see attached for report.'
        }
        send_report([email], context, request, csvfile.getvalue(), csv_file_name)
        output = f'Messages have been sent to {email}'
    else:
        output = f'No messages found for stream {stream_name}.'

    return output


def get_user_subscriptions(request: HttpRequest):
    email = request.user.delivery_email
    email_1 = request.POST.get('email_1')

    sqlstmt = SQL(
        """
        SELECT userprofile.full_name AS full_name, userprofile.delivery_email AS email, stream.name AS stream, subscription.active AS active,
        subscription.is_muted AS muted, subscription.is_user_active AS user_active FROM zerver_subscription AS subscription
        INNER JOIN zerver_userprofile AS userprofile ON userprofile.id = subscription.user_profile_id INNER JOIN zerver_recipient AS recipient
        ON recipient.id = subscription.recipient_id INNER JOIN zerver_stream AS stream ON stream.id = recipient.type_id
        WHERE userprofile.delivery_email = {email_1} ORDER BY active DESC, stream
        """
    ).format(
        email_1=Literal(email_1),
    )

    with connection.cursor() as cursor:
        cursor.execute(sqlstmt)
        results = dictfetchall(cursor)

    if(results != []):
        csvfile = results_as_csv(results)
        output = csv_to_html_table(csvfile.getvalue())

    else:
        output = f'No subscriptions found for {email_1}.'

    return output


# TODO: Fix sql querry.... zerver_mutedtopic no longer exists
def get_muted_topics(request: HttpRequest):
    email = request.user.delivery_email

    sqlstmt = SQL(
        """
        SELECT UPID.full_name AS user_name,
            UPID.delivery_email AS user_email,
            MUTED_TOPIC.topic_name,
            RID.full_name AS rept_name,
            RID.delivery_email AS rcpt_email,
            STREAM.name
        FROM zerver_usertopic AS MUTED_TOPIC
        JOIN zerver_userprofile AS UPID ON UPID.id = MUTED_TOPIC.user_profile_id
        JOIN zerver_userprofile AS RID ON RID.id = MUTED_TOPIC.recipient_id
        JOIN zerver_stream AS STREAM ON STREAM.id = MUTED_TOPIC.stream_id
        ORDER BY user_name
        """
    )

    with connection.cursor() as cursor:
        cursor.execute(sqlstmt)
        results = dictfetchall(cursor)

    if(results != []):
        csvfile = results_as_csv(results)
        output = csv_to_html_table(csvfile.getvalue())
    else:
        output = 'No muted topics found.'


    return output


def get_mobile_devices(request: HttpRequest):
    sqlstmt = SQL(
        """
        SELECT DISTINCT profile_sending.full_name AS sender, profile_sending.delivery_email AS sender_email,
        client.name AS sending_device FROM zerver_message AS message INNER JOIN zerver_userprofile AS profile_sending
        ON message.sender_id = profile_sending.id INNER JOIN zerver_client AS client ON message.sending_client_id = client.id
        WHERE client.name = 'ZulipMobile' ORDER BY sender_email
        """
    )

    with connection.cursor() as cursor:
        cursor.execute(sqlstmt)
        results = dictfetchall(cursor)

    if(results != []):
        csvfile = results_as_csv(results)
        output = csv_to_html_table(csvfile.getvalue())
    else:
        output = 'No mobile devices found.'

    return output


def enable_login_emails(request: HttpRequest):
    sqlstmt = SQL(
        """
        SELECT full_name, delivery_email
        FROM zerver_userprofile
        WHERE enable_login_emails = 'true';
        """
    )

    with connection.cursor() as cursor:
        cursor.execute(sqlstmt)
        results = dictfetchall(cursor)

    if(results != []):
        csvfile = results_as_csv(results)
        output = csv_to_html_table(csvfile.getvalue())
    else:
        output = 'No users found with enable login emails set.'

    return output


def update_login_emails(request: HttpRequest):
    sqlstmt = SQL(
        """
        SELECT full_name, delivery_email
        FROM zerver_userprofile
        WHERE enable_login_emails ='true';
        """
    )

    with connection.cursor() as cursor:
        cursor.execute(sqlstmt)
        results = dictfetchall(cursor)

    if(results != []):
        csvfile = results_as_csv(results)
        csv_table = csv_to_html_table(csvfile.getvalue())

        sqlstmt = SQL(
            """
            UPDATE zulip.zerver_userprofile
            SET enable_login_emails = 'false'
            WHERE enable_login_emails = 'true';
            """
        )

        with connection.cursor() as cursor:
            cursor.execute(sqlstmt)


        output = 'The following accounts have had enable login emails set to false...<br><br>' + csv_table

    else:
        output = 'No users found with enable login emails set.'

    return output


def get_user_activity(request: HttpRequest):
    email_1 = request.POST.get('email_1')
    start_date = request.POST.get('start-date')
    end_date = request.POST.get('end-date')
    sqlstmt = SQL(
        """
        SELECT userprofile.full_name AS FULL_NAME,
        userprofile.delivery_email AS EMAIL,
        userprofile.last_login AS LAST_LOGIN
        FROM zerver_userprofile AS userprofile
        WHERE userprofile.delivery_email ilike {email_1};
        """
    ).format(
        email_1 = Literal(email_1)
    )

    with connection.cursor() as cursor:
        cursor.execute(sqlstmt)
        login_results = dictfetchall(cursor)


    sqlstmt = SQL(
        """
        SELECT userprofile.full_name AS FULL_NAME,
            userprofile.delivery_email AS EMAIL,
            usercount.property AS PROPERTY,
            usercount.end_time AS END_TIME,
            usercount.value AS VALUE
        FROM zerver_userprofile AS userprofile
        JOIN analytics_usercount AS usercount ON usercount.user_id = userprofile.id
        WHERE userprofile.delivery_email ilike {email_1}
            AND usercount.property <> 'active_users_audit:is_bot:day'
            AND usercount.end_time BETWEEN {start_date} AND {end_date}
        ORDER BY usercount.end_time DESC;
        """
    ).format(
        email_1 = Literal(email_1),
        start_date = Literal(start_date),
        end_date = Literal(end_date)
    )

    with connection.cursor() as cursor:
        cursor.execute(sqlstmt)
        analytics_results = dictfetchall(cursor)


    sqlstmt = SQL(
        """
        SELECT userprofile.full_name AS FULL_NAME,
            userprofile.delivery_email AS EMAIL,
            useractivity."query" AS QUERY,
            useractivity."count" AS COUNT,
            useractivity.last_visit AS LAST_VISIT
        FROM zerver_userprofile AS userprofile
        JOIN zerver_useractivity as useractivity ON useractivity.user_profile_id = userprofile.id
        WHERE userprofile.delivery_email ilike {email_1}
            AND useractivity.last_visit BETWEEN {start_date} AND {end_date}
        ORDER BY useractivity.last_visit DESC;
        """
    ).format(
        email_1 = Literal(email_1),
        start_date = Literal(start_date),
        end_date = Literal(end_date)
    )

    with connection.cursor() as cursor:
        cursor.execute(sqlstmt)
        user_activity_results = dictfetchall(cursor)


    sqlstmt = SQL(
        """
        SELECT userprofile.full_name AS FULL_NAME,
            userprofile.delivery_email AS EMAIL,
            message.date_sent AS DATE_SENT
        FROM zerver_userprofile AS userprofile
        JOIN zerver_usermessage AS usermessage ON usermessage.user_profile_id = userprofile.id
        JOIN zerver_message AS message ON message.id = usermessage.message_id
        WHERE userprofile.delivery_email ilike {email_1}
            AND message.date_sent BETWEEN {start_date} AND {end_date}
        ORDER BY message.date_sent DESC;
        """
    ).format(
        email_1 = Literal(email_1),
        start_date = Literal(start_date),
        end_date = Literal(end_date)
    )

    with connection.cursor() as cursor:
        cursor.execute(sqlstmt)
        messages_sent_results = dictfetchall(cursor)


    sqlstmt = SQL(
        """
        SELECT userprofile.full_name AS FULL_NAME,
            userprofile.delivery_email AS EMAIL,
            stream.name AS STREAM_NAME,
            mutedtopic.topic_name AS MUTED_TOPIC,
            mutedtopic.date_muted AS DATE_MUTED
        FROM zerver_userprofile AS userprofile
        JOIN zerver_usertopic AS mutedtopic ON mutedtopic.user_profile_id = userprofile.id
        JOIN zerver_stream  as stream ON stream.id = mutedtopic.stream_id
        WHERE userprofile.delivery_email ilike {email_1}
            AND mutedtopic.date_muted BETWEEN {start_date} AND {end_date}
        ORDER BY userprofile.delivery_email, mutedtopic.date_muted DESC;
        """
    ).format(
        email_1 = Literal(email_1),
        start_date = Literal(start_date),
        end_date = Literal(end_date)
    )

    #with connection.cursor() as cursor:
        #cursor.execute(sqlstmt)
        #muted_topics_results = dictfetchall(cursor)


    if(login_results != []):
        login_data = csv_to_html_table(results_as_csv(login_results).getvalue())
    else:
        login_data = 'Not found'

    if(analytics_results != []):
        analytics_data = csv_to_html_table(results_as_csv(analytics_results).getvalue())
    else:
        analytics_data = 'Not found'

    if(user_activity_results != []):
        user_activity_data = csv_to_html_table(results_as_csv(user_activity_results).getvalue())
    else:
        user_activity_data = 'Not found'

    if(messages_sent_results != []):
        messages_sent_data = csv_to_html_table(results_as_csv(messages_sent_results).getvalue())
    else:
        messages_sent_data = 'Not found'

    output = f'''
    User Email: {email_1}
    Start Date: {start_date}
    End Date: {end_date}

    <b>User Login Data:</b> {login_data}
    <b>Analytics Data:</b> {analytics_data}
    <b>User Activity Data:</b> {user_activity_data}
    <b>Messages Sent Data:</b> {messages_sent_data}
    '''
    return output









