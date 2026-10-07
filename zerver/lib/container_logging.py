import json
import logging
from datetime import datetime, timezone


class ContainerJSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        event: dict[str, object] = {
            "@timestamp": datetime.fromtimestamp(record.created, timezone.utc)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z"),
            "ecs.version": "8.11.0",
            "service.name": "zulip",
            "event.dataset": "zulip.application",
            "log.level": record.levelname.lower(),
            "log.logger": record.name,
            "process.pid": record.process,
            "message": record.getMessage(),
        }
        if record.exc_info is not None:
            exception_type, exception, _ = record.exc_info
            if exception_type is not None:
                event["error.type"] = exception_type.__name__
                event["error.message"] = str(exception)
                event["error.stack_trace"] = self.formatException(record.exc_info)
        if record.stack_info:
            event["log.origin.stack_trace"] = record.stack_info
        return json.dumps(event, ensure_ascii=True)
