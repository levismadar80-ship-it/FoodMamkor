"""MEH-3725 — a rejected token stays a warning; a broken library or an
unreachable provider goes to Sentry.

Both verifiers catch every exception and return None, so the user sees the
same "invalid token" either way. That is right for a forged or expired token
and wrong when google-auth or PyJWT itself is broken (a major bump, an import
failure) or Google's certs cannot be fetched: then EVERY sign-in fails and
nothing alerted. Same blind spot as the anthropic 2.x bump (#5154).

The Google cases run the REAL google-auth verifier; only the network layer
(the transport object it is handed) is faked.
"""

from __future__ import annotations

import json

import pytest

from app.services import oauth_verifiers as ov


class _CertsResponse:
    status = 200
    headers: dict[str, str] = {}
    data = json.dumps(
        {"k1": "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n"}
    ).encode()


class _FakeTransport:
    """google.auth.transport.Request stand-in: answers the certs fetch."""

    def __call__(self, url, method="GET", body=None, headers=None, timeout=None, **kw):
        return _CertsResponse()


class _DeadTransport:
    def __call__(self, *a, **kw):
        import google.auth.exceptions as gexc

        raise gexc.TransportError("certs unreachable")


@pytest.fixture(autouse=True)
def _reset_throttle(monkeypatch):
    monkeypatch.setattr(ov, "_last_verifier_report_at", {}, raising=False)


@pytest.fixture
def reported(monkeypatch):
    sent: list[tuple[str, BaseException]] = []
    monkeypatch.setattr(
        ov,
        "_report_unexpected_verifier_error",
        lambda p, e: sent.append((p, e)),
        raising=False,
    )
    return sent


@pytest.fixture
def google_configured(monkeypatch):
    monkeypatch.setattr(
        ov.settings, "google_client_id", "cid.apps.googleusercontent.com"
    )


def _use_transport(monkeypatch, transport_cls):
    import google.auth.transport.requests as greq

    monkeypatch.setattr(greq, "Request", transport_cls)


@pytest.mark.parametrize("token", ["garbage", "a.b.c", "eyJhbGciOiJSUzI1NiJ9.e30.sig"])
def test_google_rejected_token_is_none_and_not_reported(
    monkeypatch, reported, google_configured, token
):
    _use_transport(monkeypatch, _FakeTransport)
    assert ov.verify_google_token(token) is None
    assert reported == []


def test_google_certs_unreachable_is_reported(monkeypatch, reported, google_configured):
    _use_transport(monkeypatch, _DeadTransport)
    assert ov.verify_google_token("garbage") is None
    assert [p for p, _ in reported] == ["google"]
    assert type(reported[0][1]).__name__ == "TransportError"


def test_google_library_api_change_is_reported(
    monkeypatch, reported, google_configured
):
    import google.oauth2.id_token as gid

    def _changed(*a, **kw):
        raise TypeError("verify_oauth2_token() got an unexpected keyword argument")

    monkeypatch.setattr(gid, "verify_oauth2_token", _changed)
    assert ov.verify_google_token("anything") is None
    assert [p for p, _ in reported] == ["google"]


@pytest.fixture
def apple_configured(monkeypatch):
    monkeypatch.setattr(ov.settings, "apple_client_id", "com.example.app")
    monkeypatch.setattr(
        ov, "_APPLE_JWKS_CACHE", {"keys": [{"kid": "k1"}], "fetched_at": 10**12}
    )


@pytest.mark.parametrize("token", ["garbage", "eyJhbGciOiJSUzI1NiJ9.e30.sig"])
def test_apple_rejected_token_is_none_and_not_reported(
    monkeypatch, reported, apple_configured, token
):
    monkeypatch.setattr(ov.time, "time", lambda: 10**12 + 1)
    assert ov.verify_apple_token(token) is None
    assert reported == []


def test_apple_library_api_change_is_reported(monkeypatch, reported, apple_configured):
    import jwt as pyjwt

    monkeypatch.setattr(ov.time, "time", lambda: 10**12 + 1)
    monkeypatch.setattr(
        pyjwt,
        "get_unverified_header",
        lambda _t: (_ for _ in ()).throw(TypeError("api changed")),
    )
    assert ov.verify_apple_token("anything") is None
    assert [p for p, _ in reported] == ["apple"]


class _GarbledCerts:
    def __call__(self, *a, **kw):
        class _R:
            status = 200
            headers: dict[str, str] = {}
            data = b"<html>maintenance</html>"

        return _R()


def test_google_garbled_certs_body_is_reported(
    monkeypatch, reported, google_configured
):
    _use_transport(monkeypatch, _GarbledCerts)
    assert ov.verify_google_token("a.b.c") is None
    assert [p for p, _ in reported] == ["google"]


def test_apple_keys_unreachable_with_no_cache_is_reported(monkeypatch, reported):
    import requests

    monkeypatch.setattr(ov.settings, "apple_client_id", "com.example.app")
    monkeypatch.setattr(ov, "_APPLE_JWKS_CACHE", {"keys": None, "fetched_at": None})
    monkeypatch.setattr(
        requests,
        "get",
        lambda *a, **kw: (_ for _ in ()).throw(requests.ConnectionError("down")),
    )
    assert ov.verify_apple_token("eyJhbGciOiJSUzI1NiJ9.e30.sig") is None
    assert [p for p, _ in reported] == ["apple"]


def test_sentry_event_carries_the_class_never_the_token(monkeypatch):
    """The review found the raw id_token in frame locals of a captured
    exception. The report must be a message with the class name only."""
    import sentry_sdk

    sent: list[str] = []
    captured_exceptions: list[object] = []

    class _Scope:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def set_tag(self, *a):
            pass

    monkeypatch.setattr(sentry_sdk, "new_scope", lambda: _Scope(), raising=False)
    monkeypatch.setattr(
        sentry_sdk, "capture_message", lambda m, level=None: sent.append(m)
    )
    monkeypatch.setattr(
        sentry_sdk, "capture_exception", lambda *a, **k: captured_exceptions.append(a)
    )
    token = "eyJSECRET.TOKEN.VALUE"
    ov._report_unexpected_verifier_error("google", TypeError(f"bad {token}"))
    assert captured_exceptions == []
    assert sent and token not in sent[0] and "TypeError" in sent[0]
    # Throttled: the same failure again inside the window is not re-sent.
    ov._report_unexpected_verifier_error("google", TypeError("again"))
    assert len(sent) == 1
