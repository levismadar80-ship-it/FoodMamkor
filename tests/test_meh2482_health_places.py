"""
Module:   test_meh2482_health_places
Purpose:  GET /health/places makes the real Places call with the real server
          key and turns the answer into a monitorable status: 200 disabled /
          200 ok / 503 error-with-Google's-status-word. Never the key, never
          the raw body, never an exception.
Related:  backend/app/routers/health.py (_places_probe, places_health)
History:  MEH-2482 (creation) — the 403 of 28/10/2026 ran unnoticed for two
          weeks because nothing asked Google anything on a schedule.
"""

from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from app.routers import health as health_mod

HEALTH = health_mod
URL = "/health/places"


def _resp(status: int, body) -> httpx.Response:
    req = httpx.Request("POST", HEALTH._PLACES_AUTOCOMPLETE_URL)
    if isinstance(body, (dict, list)):
        return httpx.Response(status, json=body, request=req)
    return httpx.Response(status, text=body, request=req)


def test_disabled_when_no_server_key(client: TestClient, monkeypatch):
    monkeypatch.setattr(HEALTH.settings, "google_places_api_key", "")
    with patch.object(HEALTH.httpx, "post") as post:
        r = client.get(URL)
        post.assert_not_called()
    assert r.status_code == 200
    assert r.json() == {"status": "disabled"}


def test_ok_when_google_answers_2xx(client: TestClient, monkeypatch):
    monkeypatch.setattr(HEALTH.settings, "google_places_api_key", "test-key-not-real")
    with patch.object(HEALTH.httpx, "post", return_value=_resp(200, {"suggestions": []})) as post:
        r = client.get(URL)
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
    # The probe makes the SAME call the browser makes: same endpoint, key
    # header, Israel-only, Hebrew. A probe against a different call proves
    # nothing about the one that fails.
    kwargs = post.call_args.kwargs
    assert post.call_args.args[0] == HEALTH._PLACES_AUTOCOMPLETE_URL
    assert kwargs["headers"]["X-Goog-Api-Key"] == "test-key-not-real"
    assert kwargs["json"]["includedRegionCodes"] == ["il"]
    assert kwargs["json"]["languageCode"] == "he"
    assert kwargs["timeout"] == HEALTH._PLACES_PROBE_TIMEOUT_SECONDS


def test_503_with_google_status_word_on_permission_denied(client: TestClient, monkeypatch):
    monkeypatch.setattr(HEALTH.settings, "google_places_api_key", "test-key-not-real")
    google_body = {
        "error": {"code": 403, "message": "The caller does not have permission", "status": "PERMISSION_DENIED"}
    }
    with patch.object(HEALTH.httpx, "post", return_value=_resp(403, google_body)), patch.object(
        HEALTH, "_report_places_error"
    ) as report:
        r = client.get(URL)
    assert r.status_code == 503
    assert r.json() == {"status": "error", "http": 403, "code": "PERMISSION_DENIED"}
    # The key never leaves the server, in any field.
    assert "test-key-not-real" not in r.text
    report.assert_called_once_with({"status": "error", "http": 403, "code": "PERMISSION_DENIED"})


def test_503_unknown_code_on_non_json_error_body(client: TestClient, monkeypatch):
    monkeypatch.setattr(HEALTH.settings, "google_places_api_key", "test-key-not-real")
    with patch.object(HEALTH.httpx, "post", return_value=_resp(502, "<html>bad gateway</html>")), patch.object(
        HEALTH, "_report_places_error"
    ):
        r = client.get(URL)
    assert r.status_code == 503
    assert r.json() == {"status": "error", "http": 502, "code": "unknown"}


def test_503_when_google_does_not_answer(client: TestClient, monkeypatch):
    monkeypatch.setattr(HEALTH.settings, "google_places_api_key", "test-key-not-real")
    with patch.object(
        HEALTH.httpx, "post", side_effect=httpx.ConnectTimeout("timed out")
    ), patch.object(HEALTH, "_report_places_error"):
        r = client.get(URL)
    assert r.status_code == 503
    assert r.json() == {"status": "error", "http": None, "code": "ConnectTimeout"}


def test_sentry_report_is_throttled_to_one_per_window(monkeypatch):
    # Review finding on #3730: a public, per-IP-limited endpoint hammered during
    # an outage must not turn one incident into thousands of Sentry events.
    # Discriminates: with the window removed, `captured` reads 3.
    captured = []

    class _Scope:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def set_tag(self, *a):
            pass

    import sentry_sdk

    monkeypatch.setattr(sentry_sdk, "new_scope", lambda: _Scope(), raising=False)
    monkeypatch.setattr(sentry_sdk, "capture_message", lambda *a, **k: captured.append(a), raising=False)
    monkeypatch.setattr(HEALTH, "_last_places_report_at", 0.0)
    body = {"status": "error", "http": 403, "code": "PERMISSION_DENIED"}
    for _ in range(3):
        HEALTH._report_places_error(body)
    assert len(captured) == 1
    # And a new window reports again.
    monkeypatch.setattr(HEALTH, "_last_places_report_at", 0.0)
    HEALTH._report_places_error(body)
    assert len(captured) == 2
