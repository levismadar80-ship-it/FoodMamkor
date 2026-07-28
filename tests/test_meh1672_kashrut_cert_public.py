"""MEH-1672 — public kashrut-certificate proxy.

`GET /producers/{id}/kashrut-cert/{badge_code}` streams an approved, in-date
certificate photo. It is a PROXY, not a redirect, because `cert_url` points at
a `type=upload` Cloudinary asset that is public forever to anyone holding the
address (`upload.py:353-360` uploads with no `type=`). Handing that address to
visitors would publish a link no expiry could revoke.

Every unauthorized case is 404, never 403 — a 403 confirms that a
pending/rejected/expired certificate exists, which is the queue state MEH-254
keeps unenumerable.

The four authorization states from the card's acceptance criterion 7, plus the
counting assert from its <verification_step>: ZERO occurrences of cert_url /
the raw Cloudinary address in any public API response.
"""

from datetime import datetime, timedelta

import app.routers.producers as producers_module
from app.models.models import KashrutBadgeRequest
from conftest import make_producer, make_user

CERT_URL = "https://res.cloudinary.com/demo/image/upload/v1/mehamakor/kashrut/abc123.jpg"
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"0" * 64


class _FakeStream:
    """Context-manager stand-in for httpx.stream()'s return value — the
    proxy streams + caps DURING download (adversarial review), so the fake
    must support the same `with ... as upstream: upstream.iter_bytes()`
    shape rather than a plain response object."""

    def __init__(self, status_code=200, content=PNG_BYTES, content_type="image/jpeg", chunk_size=32):
        self.status_code = status_code
        self.headers = {"content-type": content_type}
        self._content = content
        self._chunk_size = chunk_size

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        return False

    def iter_bytes(self):
        size = self._chunk_size or max(len(self._content), 1)
        for i in range(0, len(self._content), size):
            yield self._content[i : i + size]


def _stub_upstream(monkeypatch, response=None, *, capture_kwargs=None):
    """Replace httpx.stream so no test reaches Cloudinary. `capture_kwargs`,
    if given, records each call's (method, url, kwargs) instead of url only."""
    calls = []

    def fake_stream(method, url, **kwargs):
        if capture_kwargs is not None:
            calls.append((method, url, kwargs))
        else:
            calls.append(url)
        return response or _FakeStream()

    monkeypatch.setattr(producers_module.httpx, "stream", fake_stream)
    return calls


def _certified(
    db,
    *,
    status="approved",
    req_status="approved",
    expires_in_days=90,
    badge_code="badatz",
    cert_url=CERT_URL,
):
    producer = make_producer(db, status=status)
    producer.kashrut_badges = [badge_code]
    producer.kashrut_verified_at = datetime.utcnow()
    producer.kashrut_expires_at = (
        None if expires_in_days is None else datetime.utcnow() + timedelta(days=expires_in_days)
    )
    db.add(
        KashrutBadgeRequest(
            producer_id=producer.id,
            badge_code=badge_code,
            cert_url=cert_url,
            status=req_status,
        )
    )
    db.commit()
    db.refresh(producer)
    return producer


def _fetch(client, producer, badge_code="badatz"):
    return client.get(f"/producers/{producer.id}/kashrut-cert/{badge_code}")


# --- the four authorization states -----------------------------------------


def test_approved_and_in_date_serves_the_image(client, db, monkeypatch):
    calls = _stub_upstream(monkeypatch)
    producer = _certified(db)
    resp = _fetch(client, producer)
    assert resp.status_code == 200, resp.text
    assert resp.content == PNG_BYTES
    assert resp.headers["content-type"].startswith("image/")
    # Proxied, not redirected: the upstream was fetched server-side and the
    # client never saw a Location header.
    assert calls == [CERT_URL]
    assert "location" not in {k.lower() for k in resp.headers}


def test_pending_or_rejected_request_is_404(client, db, monkeypatch):
    _stub_upstream(monkeypatch)
    for req_status in ("pending", "rejected"):
        producer = _certified(db, req_status=req_status)
        assert _fetch(client, producer).status_code == 404


def test_expired_certificate_is_404(client, db, monkeypatch):
    _stub_upstream(monkeypatch)
    producer = _certified(db, expires_in_days=-1)
    assert _fetch(client, producer).status_code == 404


def test_unapproved_producer_is_404(client, db, monkeypatch):
    _stub_upstream(monkeypatch)
    for status in ("pending", "rejected", "inactive"):
        producer = _certified(db, status=status)
        assert _fetch(client, producer).status_code == 404


# --- adjacent guards -------------------------------------------------------


def test_a_badge_code_without_an_approved_cert_is_404(client, db, monkeypatch):
    _stub_upstream(monkeypatch)
    producer = _certified(db, badge_code="badatz")
    # Same producer, different badge — must not serve the badatz certificate.
    assert _fetch(client, producer, badge_code="mehadrin").status_code == 404


def test_non_image_upstream_is_refused(client, db, monkeypatch):
    """The column is plain text; the content-type check is the second lock."""
    _stub_upstream(monkeypatch, _FakeStream(content_type="text/html"))
    producer = _certified(db)
    assert _fetch(client, producer).status_code == 404


def test_svg_upstream_is_refused_despite_starting_with_image(client, db, monkeypatch):
    """Adversarial review: image/svg+xml passes a naive startswith("image/")
    check but is a stored-XSS vector when re-served on our own origin (a
    direct navigation renders it as a document and runs inline <script>).
    The allowlist must be exact-match, not a prefix check."""
    _stub_upstream(monkeypatch, _FakeStream(content_type="image/svg+xml"))
    producer = _certified(db)
    assert _fetch(client, producer).status_code == 404


def test_content_type_charset_param_does_not_defeat_the_allowlist(client, db, monkeypatch):
    """A real upstream can append ; charset=... — the allowlist match must
    strip parameters rather than exact-match the whole header value."""
    _stub_upstream(monkeypatch, _FakeStream(content_type="image/jpeg; charset=binary"))
    producer = _certified(db)
    assert _fetch(client, producer).status_code == 200


def test_a_non_cloudinary_cert_url_is_refused_before_any_fetch(client, db, monkeypatch):
    """Adversarial review (SSRF): cert_url is producer-submitted and only
    validated as https://, so the proxy must never fetch an off-host address —
    169.254.169.254 (cloud metadata) stands in for "anywhere on the internet"."""
    calls = _stub_upstream(monkeypatch)
    producer = _certified(db, cert_url="https://169.254.169.254/latest/meta-data/")
    assert _fetch(client, producer).status_code == 404
    assert calls == []  # never reached httpx.stream at all


def test_upstream_fetch_does_not_follow_redirects(client, db, monkeypatch):
    """A cloudinary-hosted URL that redirects off-host must not be followed —
    the allowlist check happens before the fetch, so a redirect can't defeat it."""
    calls = _stub_upstream(monkeypatch, capture_kwargs=True)
    producer = _certified(db)
    assert _fetch(client, producer).status_code == 200
    assert calls == [("GET", CERT_URL, {"timeout": 10.0, "follow_redirects": False})]


def test_oversized_upstream_body_is_capped_not_buffered(client, db, monkeypatch):
    """Adversarial review: httpx.get().content would buffer the whole body
    before any size check could run — streaming + capping DURING download is
    the only way a check actually bounds memory. A body over _MAX_CERT_BYTES
    must 502, not 200 with a giant response."""
    oversized = PNG_BYTES + b"0" * producers_module._MAX_CERT_BYTES
    _stub_upstream(monkeypatch, _FakeStream(content=oversized, chunk_size=4096))
    producer = _certified(db)
    resp = _fetch(client, producer)
    assert resp.status_code == 502, resp.text


def test_a_body_under_the_cap_still_serves_correctly(client, db, monkeypatch):
    """The cap doesn't break normal-sized certs streamed in multiple chunks."""
    _stub_upstream(monkeypatch, _FakeStream(chunk_size=7))  # forces several chunks
    producer = _certified(db)
    resp = _fetch(client, producer)
    assert resp.status_code == 200, resp.text
    assert resp.content == PNG_BYTES


def test_upstream_404_is_not_masked_as_success(client, db, monkeypatch):
    _stub_upstream(monkeypatch, _FakeStream(status_code=404))
    producer = _certified(db)
    assert _fetch(client, producer).status_code == 404


def test_legacy_null_expiry_still_serves(client, db, monkeypatch):
    """Matches KashrutBadgeStrip.jsx:40 — a NULL expiry stays visible."""
    _stub_upstream(monkeypatch)
    producer = _certified(db, expires_in_days=None)
    assert _fetch(client, producer).status_code == 200


# --- the counting assert: no URL ever crosses the wire ---------------------


def test_public_detail_lists_badge_codes_and_never_a_url(client, db, monkeypatch):
    _stub_upstream(monkeypatch)
    producer = _certified(db)
    resp = client.get(f"/producers/{producer.id}")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["kashrut_certs"] == [{"badge_code": "badatz"}]
    # ZERO occurrences of the raw address, its host, or the column name.
    raw = resp.text
    assert CERT_URL not in raw
    assert "res.cloudinary.com/demo/image/upload/v1/mehamakor/kashrut" not in raw
    assert "cert_url" not in raw
    assert "secure_url" not in raw


def test_expired_producer_advertises_no_certs(client, db, monkeypatch):
    """The list and the proxy agree — one rule, two call sites."""
    _stub_upstream(monkeypatch)
    producer = _certified(db, expires_in_days=-1)
    resp = client.get(f"/producers/{producer.id}")
    assert resp.status_code == 200, resp.text
    assert resp.json()["kashrut_certs"] == []


def test_pending_request_advertises_no_certs(client, db, monkeypatch):
    _stub_upstream(monkeypatch)
    producer = _certified(db, req_status="pending")
    resp = client.get(f"/producers/{producer.id}")
    assert resp.status_code == 200, resp.text
    assert resp.json()["kashrut_certs"] == []
