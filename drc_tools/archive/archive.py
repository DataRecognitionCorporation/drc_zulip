#!/usr/bin/python3
# PYTHON_ARGCOMPLETE_OK

import argcomplete
import argparse
import requests
import time
import traceback
import yaml
import zulip

from datetime import datetime

from typing import TypedDict, Any


class RateLimitError(Exception):
    def __init__(self, message: str, retry_after=None):
        super().__init__(message)
        self.retry_after = retry_after


class Channel(TypedDict):
    name: str
    stream_id: int
    description: str
    date_created: int
    invite_only: bool
    is_archived: bool       # new in zulip 10 - not yet available so defaults to False
    is_recently_active: bool
    message_retention_days: int
    subscriber_count: int   # new in zulip 11 - not yet available so defaults to -1
    subscribers: list[int]
    messages: list['Message']  # List of messages in the channel


class Message(TypedDict):
    id: int
    sender_id: int
    content: str
    timestamp: int
    type: str
    subject: str
    stream_id: int



common_parser = argparse.ArgumentParser(add_help=False)
common_parser.add_argument('-e', '--env', type=str, required=True, choices=['dev', 'prod'], help='Environment to archive.')
common_parser.add_argument('-a', '--apply', action='store_true', help='Apply the changes instead of just printing them. Default is to just dry run')
common_parser.add_argument('-d', '--days', type=int, default=30, help='Number of days to keep messages before archiving.')

parser = argparse.ArgumentParser(
    description='Archive and purge old messages and channels ',
    formatter_class=argparse.ArgumentDefaultsHelpFormatter,
)
subparsers = parser.add_subparsers(dest='command', required=True, help='Whether to archive channel (stream) messages or private messages.')

channels_parser = subparsers.add_parser(
    'channels',
    parents=[common_parser],
    help='Archive and purge old messages in channels (streams).',
    formatter_class=argparse.ArgumentDefaultsHelpFormatter,
)

private_parser = subparsers.add_parser(
    'private',
    parents=[common_parser],
    help='Archive and purge old private messages.',
    formatter_class=argparse.ArgumentDefaultsHelpFormatter,
)

argcomplete.autocomplete(parser)
args = parser.parse_args()


try:
    assert args.env in ['dev', 'prod'], "Environment must be either 'dev' or 'prod'."

    if args.env == 'dev':
        CLIENT = zulip.Client(config_file="./zuliprc_dev")
    else:
        CLIENT = zulip.Client(config_file="./zuliprc_prod")
except zulip.ConfigNotFoundError:
    print("Error: Could not find Zulip config file. Please ensure that the config file exists and is readable.")
    exit(1)
except Exception as e:
    print("Error: Could not connect to the Zulip server. Please check your environment and network connectivity.")
    traceback.print_exc()
    exit(1)


try:
    with open('config.yaml', 'r') as file:
        CONFIG = yaml.safe_load(file)
    assert(CONFIG is not None), "Config file is empty or invalid."
    assert(type(CONFIG) is dict), "Config file must be in a yaml."
except:
    print("Error: Could not read config.yaml. Please ensure the file exists and is readable.")
    exit(1)

CHANNEL_EXCEPTIONS = []

if 'channel-exceptions' in CONFIG:
    assert(type(CONFIG['channel-exceptions']) is list), "Channel exceptions must be a list."
    CHANNEL_EXCEPTIONS = CONFIG['channel-exceptions']


def retry_request(func, *args, max_retries=3, backoff=None, **kwargs):
    for attempt in range(max_retries):
        try:
            return func(*args, **kwargs)
        except (requests.exceptions.RequestException, RateLimitError) as e:
            print(f"Request failed on attempt {attempt + 1}/{max_retries}: {e}")
            if attempt == max_retries - 1:
                raise
            if e.retry_after is not None:
                time.sleep(e.retry_after + 1)


def _fetch_subscribers(stream_name: str) -> list[int]:
    results = CLIENT.get_subscribers(stream=stream_name)
    if 'code' in results and results['code'] == 'RATE_LIMIT_HIT':
        raise RateLimitError(f"Rate limited, retry-after={results.get('retry-after')}", retry_after=results.get('retry-after'))
    assert 'subscribers' in results, f"Expected 'subscribers' key in response, got: {results}"
    assert type(results['subscribers']) is list, f"Expected 'subscribers' to be a list, got: {type(results['subscribers'])}"
    return results['subscribers']


def get_subscribers_for_channel(stream_name: str) -> list[int]:
    return retry_request(_fetch_subscribers, stream_name, backoff=1)



def _fetch_all_channels() -> list[Channel]:
    results = CLIENT.get_streams(include_all_active=True, exclude_archived=False)
    if 'code' in results and results['code'] == 'RATE_LIMIT_HIT':
        raise RateLimitError(f"Rate limited, retry-after={results.get('retry-after')}", retry_after=results.get('retry-after'))
    return results['streams']



def get_all_channels() -> list[Channel]:
    results = retry_request(_fetch_all_channels, backoff=1)

    all_channels: list[Channel] = []
    count = 0

    for channel in results:
        if channel['name'] in CHANNEL_EXCEPTIONS:
            print(f"Skipping channel {channel['name']} as it is in the exceptions list.")
            continue

        if count == -30:
            break

        count = count + 1
        print(f"Channel: {channel['name']}, ID: {channel['stream_id']}, Description: {channel['description']}")
        DEFAULTS = {'is_archived': False, 'subscriber_count': -1, 'is_recently_active': False}
        channel_data = {**DEFAULTS, **channel}

        # subscribers = get_subscribers_for_channel(channel_data['name'])
        subscribers = []
        messages: [Message] = get_all_messages(channel_data['name'])

        temp_channel: Channel = {
            'name': channel_data['name'],
            'stream_id': channel_data['stream_id'],
            'description': channel_data['description'],
            'date_created': channel_data['date_created'],
            'invite_only': channel_data['invite_only'],
            'is_archived': channel_data['is_archived'],
            'is_recently_active': channel_data['is_recently_active'],
            'message_retention_days': channel_data['message_retention_days'],
            'subscriber_count': len(subscribers),
            'subscribers': subscribers,
            'messages': messages
        }

        all_channels.append(temp_channel)

    print(f'number of channels: {len(all_channels)}')
    return all_channels



REQUEST_TIMEOUT = 60.0  # seconds; default zulip client timeout (15s) is too short for large message fetches/deletes


def _fetch_all_messages(request: dict[str, Any]) -> dict[str, Any]:
    results = CLIENT.call_endpoint(url="messages", method="GET", request=request, timeout=REQUEST_TIMEOUT)
    if 'code' in results and results['code'] == 'RATE_LIMIT_HIT':
        raise RateLimitError(f"Rate limited, retry-after={results.get('retry-after')}", retry_after=results.get('retry-after'))
    return results


def _delete_message(message_id: int) -> dict[str, Any]:
    result = CLIENT.call_endpoint(url=f"messages/{message_id}", method="DELETE", timeout=REQUEST_TIMEOUT)
    if 'code' in result and result['code'] == 'RATE_LIMIT_HIT':
        raise RateLimitError(f"Rate limited, retry-after={result.get('retry-after')}", retry_after=result.get('retry-after'))
    return result


def delete_message(message_id: int) -> dict[str, Any]:
    return retry_request(_delete_message, message_id, backoff=1)


def get_all_messages(stream_name: str) -> [Message]:
    all_messages: list[Message] = []

    request = {
        "apply_markdown": False,
        "anchor": "oldest",
        "num_before": 0,
        "num_after": 5000,
        "narrow": [
            {"operator": "channel", "operand": stream_name},
        ],
    }
    result = retry_request(_fetch_all_messages, request, backoff=1)
    if not(result['found_newest'] or result['found_oldest']):
        print(f'ALl messeges for channel {stream_name} not been retrieved. Found newest: {result["found_newest"]}, Found oldest: {result["found_oldest"]}')

    for r in result['messages']:
        msg: Message = {
            'id': r['id'],
            'sender_id': r['sender_id'],
            'content': r['content'],
            'timestamp': r['timestamp'],
            'msg_type': r['type'],
            'subject': r['subject'],
            'stream_id': r['stream_id'],
        }
        all_messages.append(msg)
    return all_messages


def report_and_maybe_delete_messages(label: str, messages: list[Message], cutoff_timestamp: float) -> None:
    print(f"  Number of messages: {len(messages)}")

    if not messages:
        print("  No messages found.")
        return

    oldest_message = min(messages, key=lambda m: m['timestamp'])
    newest_message = max(messages, key=lambda m: m['timestamp'])

    oldest_date = datetime.fromtimestamp(oldest_message['timestamp']).strftime('%Y-%m-%d %H:%M:%S')
    newest_date = datetime.fromtimestamp(newest_message['timestamp']).strftime('%Y-%m-%d %H:%M:%S')

    print(f"  Oldest message: {oldest_date} (id: {oldest_message['id']}, subject: {oldest_message['subject']})")
    print(f"  Newest message: {newest_date} (id: {newest_message['id']}, subject: {newest_message['subject']})")

    old_messages = [m for m in messages if m['timestamp'] < cutoff_timestamp]
    print(f"  Messages older than {args.days} days: {len(old_messages)}")

    if old_messages:
        deleted_count = 0
        failed_count = 0
        for msg in old_messages:
            if args.apply:
                try:
                    delete_message(msg['id'])
                    deleted_count += 1
                except Exception as e:
                    failed_count += 1
                    print(f"    Failed to delete message id {msg['id']}: {e}")
            else:
                deleted_count += 1

        action = "Deleted" if args.apply else "Would delete (dry run)"
        print(f"  {action} {deleted_count} message(s) older than {args.days} days in {label}.")
        if failed_count:
            print(f"  Failed to delete {failed_count} message(s) in {label}.")


cutoff_timestamp = time.time() - (args.days * 86400)

if args.command == 'channels':
    all_channels: list[Channel] = get_all_channels()

    for c in all_channels:
        print(f"Channel: {c['name']}")
        report_and_maybe_delete_messages(f"channel '{c['name']}'", c['messages'], cutoff_timestamp)

elif args.command == 'private':
    print("Private messages")
    print("  Not yet implemented.")



