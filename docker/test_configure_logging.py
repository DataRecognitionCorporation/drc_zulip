import configparser
import importlib.util
import json
import logging
import sys
import tempfile
import unittest
from pathlib import Path

from zerver.lib.container_logging import ContainerJSONFormatter

spec = importlib.util.spec_from_file_location(
    "configure_logging", Path(__file__).with_name("configure-logging.py")
)
assert spec is not None and spec.loader is not None
configure_logging = importlib.util.module_from_spec(spec)
spec.loader.exec_module(configure_logging)


class ContainerLoggingTest(unittest.TestCase):
    def test_supervisor_includes_and_process_expansion(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "child.conf").write_text(
                "[program:worker]\ncommand=worker --shard %(process_num)s\n"
                "user=zulip\nredirect_stderr=true\nstdout_logfile=/var/log/worker.log\n"
            )
            main = root / "supervisord.conf"
            main.write_text(
                "[supervisord]\nlogfile=/var/log/supervisord.log\n"
                "[include]\nfiles=child.conf\n"
            )
            for _ in range(2):
                configure_logging.configure_supervisor(main, set())
            config = configparser.ConfigParser(interpolation=None)
            config.read([str(main), str(root / "child.conf")])
            self.assertEqual(config["program:worker"]["command"], "worker --shard %(process_num)s")
            self.assertEqual(config["program:worker"]["user"], "zulip")
            self.assertEqual(config["program:worker"]["redirect_stderr"], "false")
            self.assertEqual(config["program:worker"]["stdout_logfile"], "/dev/stdout")
            self.assertEqual(config["program:worker"]["stderr_logfile"], "/dev/stderr")
            self.assertEqual(config["program:worker"]["stdout_logfile_maxbytes"], "0")
            self.assertEqual(config["program:worker"]["stderr_logfile_maxbytes"], "0")
            self.assertEqual(config["supervisord"]["logfile_maxbytes"], "0")

    def test_nginx_includes_preserve_format_and_disabled_logs(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            child = root / "site.conf"
            child.write_text("access_log /var/log/nginx/access.log custom;\naccess_log off;\n")
            main = root / "nginx.conf"
            main.write_text(f"http {{\ninclude {child};\nerror_log /var/log/nginx/error.log warn;\n}}\n")
            for _ in range(2):
                configure_logging.configure_nginx(main, set())
            self.assertIn("error_log /dev/stderr warn;", main.read_text())
            self.assertIn("access_log /dev/stdout zulip_json;", child.read_text())
            self.assertIn("access_log off;", child.read_text())
            self.assertEqual(main.read_text().count("log_format zulip_json "), 1)
            self.assertNotIn("$request_uri", main.read_text())
            self.assertNotIn("$args", main.read_text())

    def test_json_exception_is_one_line_and_does_not_include_request(self) -> None:
        try:
            raise ValueError("failed\nwith details")
        except ValueError:
            record = logging.LogRecord(
                "zulip.test", logging.ERROR, __file__, 1, "Failure: %s", ("example",), sys.exc_info()
            )
        record.request = "private request payload"
        output = ContainerJSONFormatter().format(record)
        event = json.loads(output)
        self.assertNotIn("\n", output)
        self.assertEqual(event["message"], "Failure: example")
        self.assertEqual(event["error.type"], "ValueError")
        self.assertIn("ValueError", event["error.stack_trace"])
        self.assertNotIn("private request payload", output)
        self.assertEqual(event["log.level"], "error")
        self.assertTrue(event["@timestamp"].endswith("Z"))


if __name__ == "__main__":
    unittest.main()
