#!/usr/bin/env python3
import configparser
import glob
import re
from pathlib import Path


def configure_supervisor(path: Path, visited: set[Path]) -> None:
    path = path.resolve()
    if path in visited:
        return
    visited.add(path)
    config = configparser.ConfigParser(interpolation=None, strict=False)
    with path.open() as source:
        config.read_file(source)
    if config.has_section("include"):
        for pattern in config.get("include", "files").split():
            for included in glob.glob(str(path.parent / pattern)):
                configure_supervisor(Path(included), visited)
    for section in config.sections():
        if section.startswith("program:"):
            config[section].update(
                redirect_stderr="false",
                stdout_logfile="/dev/stdout",
                stdout_logfile_maxbytes="0",
                stdout_logfile_backups="0",
                stderr_logfile="/dev/stderr",
                stderr_logfile_maxbytes="0",
                stderr_logfile_backups="0",
            )
        elif section == "supervisord":
            config[section].update(logfile="/dev/stdout", logfile_maxbytes="0", logfile_backups="0")
    with path.open("w") as destination:
        config.write(destination)


def configure_nginx(path: Path, visited: set[Path]) -> None:
    path = path.resolve()
    if path in visited:
        return
    visited.add(path)
    config = path.read_text()
    for pattern in re.findall(r"^\s*include\s+([^;]+);", config, re.MULTILINE):
        for included in glob.glob(str(Path("/etc/nginx") / pattern.strip())):
            configure_nginx(Path(included), visited)
    config = re.sub(r"(\baccess_log\s+)/var/log/nginx/[^\s;]+", r"\1/dev/stdout", config)
    config = re.sub(r"(\berror_log\s+)/var/log/nginx/[^\s;]+", r"\1/dev/stderr", config)
    path.write_text(config)


if __name__ == "__main__":
    configure_supervisor(Path("/etc/supervisor/supervisord.conf"), set())
    configure_nginx(Path("/etc/nginx/nginx.conf"), set())
