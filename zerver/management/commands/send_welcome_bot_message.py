from argparse import ArgumentParser
from typing import Any

from zerver.lib.management import ZulipBaseCommand
<<<<<<< HEAD
from zerver.lib.onboarding import send_initial_pms
=======
from zerver.lib.onboarding import send_initial_direct_message
>>>>>>> drc_main


class Command(ZulipBaseCommand):
    help = """Sends the initial welcome bot message."""

    def add_arguments(self, parser: ArgumentParser) -> None:
        self.add_user_list_args(
            parser,
            help="Email addresses of user(s) to send welcome bot messages to.",
            all_users_help="Send to every user on the realm.",
        )
        self.add_realm_args(parser)

    def handle(self, *args: Any, **options: str) -> None:
        for user_profile in self.get_users(options, self.get_realm(options), is_bot=False):
<<<<<<< HEAD
            send_initial_pms(user_profile)
=======
            send_initial_direct_message(user_profile)
>>>>>>> drc_main
