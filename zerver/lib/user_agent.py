import re

from django.conf import settings

# Warning: If you change this parsing, please test using
#   zerver/tests/test_decorators.py
# And extend zerver/tests/fixtures/user_agents_unique with any new test cases
pattern = re.compile(
    r"""^ (?P<name> [^/ ]* [^0-9/(]* )
    (/ (?P<version> [^/ ]* ))?
    ([ /] .*)?
    $""",
    re.VERBOSE,
)


def parse_user_agent(user_agent: str) -> dict[str, str]:
    match = pattern.match(user_agent)
    assert match is not None
    return match.groupdict()


def is_client_blocked(client_name: str | None, user_agent: str = "") -> bool:
    blocked_client_names = {name.casefold() for name in settings.BLOCKED_CLIENT_NAMES}
    user_agent = user_agent.casefold()
    return (
        (client_name is not None and client_name.casefold() in blocked_client_names)
        or any(name in user_agent for name in blocked_client_names)
        or any(agent.casefold() in user_agent for agent in settings.BLOCKED_USER_AGENTS)
    )
