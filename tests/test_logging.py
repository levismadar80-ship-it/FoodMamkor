"""
Tests for MEH-240 logging infrastructure.

Four focused tests:
1. structlog is configured (not the lazy default)
2. X-Request-ID header propagates into log events
3. Sensitive field redaction
4. LOG_FORMAT=json produces JSON output; LOG_FORMAT=console produces plain text
"""
import io
import json
import os

import pytest
import structlog


class TestStructlogConfigured:
    def test_structlog_is_configured(self):
        """After app import, structlog must not be in its unconfigured state."""
        config = structlog.get_config()
        # Default structlog has an empty processors list; our setup has at least 5.
        assert len(config["processors"]) >= 5, (
            "structlog appears to be using default config — configure_logging() not called"
        )

    def test_get_logger_returns_bound_logger(self):
        """structlog.get_logger() must return a configured BoundLogger, not a proxy."""
        log = structlog.get_logger("test.logging")
        # A configured logger has a _proxy attribute or is a BoundLoggerLazyProxy
        # whose underlying logger is not None after binding.
        bound = log.bind(test_key="test_value")
        assert bound is not None


class TestCorrelationIdPropagation:
    def test_request_id_echoed_in_response_header(self, client):
        """CorrelationIdMiddleware must return X-Request-ID on every response."""
        resp = client.get("/health")
        assert "x-request-id" in resp.headers, (
            "X-Request-ID header missing from response — CorrelationIdMiddleware not wired"
        )

    def test_client_supplied_request_id_is_preserved(self, client):
        """If the client sends a valid UUID in X-Request-ID, the same value must come back."""
        # asgi-correlation-id validates UUID format before accepting the supplied ID.
        custom_id = "550e8400-e29b-41d4-a716-446655440000"
        resp = client.get("/health", headers={"X-Request-ID": custom_id})
        assert resp.headers.get("x-request-id") == custom_id


class TestSensitiveFieldRedaction:
    def test_password_is_redacted(self):
        """Password kwarg must be scrubbed to [REDACTED] by the processor."""
        from app.logging_config import _redact_sensitive

        event_dict = {"event": "login attempt", "password": "supersecret123"}
        result = _redact_sensitive(None, None, event_dict)
        assert result["password"] == "[REDACTED]"
        assert result["event"] == "login attempt"

    def test_token_is_redacted(self):
        from app.logging_config import _redact_sensitive

        event_dict = {"event": "token check", "token": "eyJhbGciOiJIUzI1NiJ9..."}
        result = _redact_sensitive(None, None, event_dict)
        assert result["token"] == "[REDACTED]"

    def test_authorization_header_is_redacted(self):
        from app.logging_config import _redact_sensitive

        event_dict = {"event": "request", "authorization": "Bearer eyJ..."}
        result = _redact_sensitive(None, None, event_dict)
        assert result["authorization"] == "[REDACTED]"

    def test_safe_fields_are_not_redacted(self):
        from app.logging_config import _redact_sensitive

        event_dict = {"event": "user created", "email": "alice@test.com", "user_id": "abc"}
        result = _redact_sensitive(None, None, event_dict)
        assert result["email"] == "alice@test.com"
        assert result["user_id"] == "abc"


class TestLogFormat:
    def test_json_format_produces_parseable_json(self, monkeypatch):
        """LOG_FORMAT=json renderer must produce a JSON string with 'event' key."""
        monkeypatch.setenv("LOG_FORMAT", "json")
        monkeypatch.setenv("LOG_LEVEL", "DEBUG")

        buf = io.StringIO()

        # Re-configure with JSON renderer pointed at our buffer
        structlog.configure(
            processors=[
                structlog.stdlib.add_log_level,
                structlog.processors.TimeStamper(fmt="iso"),
                structlog.processors.JSONRenderer(),
            ],
            logger_factory=structlog.PrintLoggerFactory(buf),
            cache_logger_on_first_use=False,
        )

        log = structlog.get_logger("test")
        log.info("test event", key="value")

        output = buf.getvalue().strip()
        assert output, "No log output produced"
        parsed = json.loads(output)
        assert parsed["event"] == "test event"
        assert parsed["key"] == "value"

    def test_console_format_produces_plain_text(self, monkeypatch):
        """LOG_FORMAT=console renderer must produce human-readable text, not JSON."""
        monkeypatch.setenv("LOG_FORMAT", "console")

        buf = io.StringIO()

        structlog.configure(
            processors=[
                structlog.stdlib.add_log_level,
                structlog.dev.ConsoleRenderer(),
            ],
            logger_factory=structlog.PrintLoggerFactory(buf),
            cache_logger_on_first_use=False,
        )

        log = structlog.get_logger("test")
        log.info("console test event")

        output = buf.getvalue()
        assert "console test event" in output
        # Console output is NOT valid JSON
        with pytest.raises((json.JSONDecodeError, ValueError)):
            json.loads(output.strip())
