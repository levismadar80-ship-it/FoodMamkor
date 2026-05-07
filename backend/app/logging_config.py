import logging
import os
import sys

import structlog

_SENSITIVE_KEYS = frozenset(
    {
        "password",
        "token",
        "secret",
        "authorization",
        "access_token",
        "refresh_token",
        "api_key",
    }
)


def _redact_sensitive(logger, method, event_dict):
    for key in list(event_dict.keys()):
        if key.lower() in _SENSITIVE_KEYS:
            event_dict[key] = "[REDACTED]"
    return event_dict


def _add_correlation_id(logger, method, event_dict):
    try:
        from asgi_correlation_id import correlation_id

        rid = correlation_id.get()
        if rid:
            event_dict["request_id"] = rid
    except Exception:
        pass
    return event_dict


def configure_logging() -> None:
    log_level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    log_level = getattr(logging, log_level_name, logging.INFO)
    # MEH-483: default to JSON in non-dev so Railway/Sentry log searches
    # can grep on `request_id`. `LOG_FORMAT` env var still wins when set.
    # `ENV` is the canonical env var (config.py:37,113,127).
    _is_dev = os.getenv("ENV", "development").lower() == "development"
    log_format = os.getenv("LOG_FORMAT", "console" if _is_dev else "json").lower()

    shared_processors: list = [
        structlog.contextvars.merge_contextvars,
        _add_correlation_id,
        # NOTE: `structlog.stdlib.add_logger_name` intentionally OMITTED.
        # That processor reads `logger.name`, but the `PrintLogger`
        # instances produced by `PrintLoggerFactory` below have no `.name`
        # attribute. The combination crashed every `log.info(...)` call on
        # production-shape startup (MEH-260, AttributeError at
        # structlog/stdlib.py:805 "'PrintLogger' object has no attribute
        # 'name'") — never observed earlier only because staging was
        # drift-stuck on pre-MEH-240 code. If the logger name is needed
        # in output, either bind it manually (`log.bind(logger=name)`)
        # or switch `logger_factory` to `structlog.stdlib.LoggerFactory()`
        # — that path produces stdlib loggers which expose `.name` but
        # routes output through the logging module instead of direct
        # stdout writes, which Railway's log panel handles differently.
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        _redact_sensitive,
    ]

    if log_format == "json":
        renderer = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer()

    structlog.configure(
        processors=shared_processors
        + [
            structlog.processors.format_exc_info,
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(sys.stdout),
        cache_logger_on_first_use=True,
    )

    # Keep stdlib logging at the same level so existing logging.getLogger calls work.
    logging.basicConfig(
        level=log_level,
        stream=sys.stdout,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        force=True,
    )
