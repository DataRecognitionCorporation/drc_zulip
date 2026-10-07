import configparser
import importlib.util
import tempfile
import unittest
from pathlib import Path

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
            main.write_text(f"include {child};\nerror_log /var/log/nginx/error.log warn;\n")
            for _ in range(2):
                configure_logging.configure_nginx(main, set())
            self.assertIn("error_log /dev/stderr warn;", main.read_text())
            self.assertIn("access_log /dev/stdout custom;", child.read_text())
            self.assertIn("access_log off;", child.read_text())


if __name__ == "__main__":
    unittest.main()
