"""MEH-2611 — newsletter subscribers are mirrored into Resend Contacts.

Two layers:
  * the router hands every subscribe / unsubscribe to the sync service
    (patched here, so no network), including a REPEAT signup;
  * the sync service itself, driven against a fake `resend` module, creates
    a global contact in the `newsletter` segment, falls back to update +
    segment-add when the contact exists, and never raises.
"""

import sys
import types

import pytest

from app.config import settings
from app.models import NewsletterSubscriber
from app.routers import marketing
from app.routers.marketing import create_unsubscribe_token
from app.services import newsletter_sync


@pytest.fixture
def calls(monkeypatch):
    seen = []
    monkeypatch.setattr(marketing, "sync_subscribe", lambda e: seen.append(("sub", e)))
    monkeypatch.setattr(
        marketing, "sync_unsubscribe", lambda e: seen.append(("unsub", e))
    )
    monkeypatch.setattr(marketing, "send_email", lambda *a, **k: None)
    return seen


class TestRouterHandsOffToSync:
    def test_new_signup_syncs(self, client, calls):
        resp = client.post("/newsletter", json={"email": "New.Reader@Gmail.com"})
        assert resp.status_code == 201, resp.text
        assert calls == [("sub", "new.reader@gmail.com")]

    def test_repeat_signup_still_syncs(self, client, db, calls):
        db.add(NewsletterSubscriber(email="again@gmail.com"))
        db.commit()
        resp = client.post("/newsletter", json={"email": "again@gmail.com"})
        assert resp.status_code == 201, resp.text
        assert calls == [("sub", "again@gmail.com")]

    def test_unsubscribe_syncs(self, client, db, calls):
        db.add(NewsletterSubscriber(email="bye@gmail.com"))
        db.commit()
        token = create_unsubscribe_token("bye@gmail.com")
        resp = client.post("/newsletter/unsubscribe", json={"token": token})
        assert resp.status_code == 200, resp.text
        assert calls == [("unsub", "bye@gmail.com")]

    def test_bad_token_does_not_sync(self, client, calls):
        resp = client.post("/newsletter/unsubscribe", json={"token": "nope"})
        assert resp.status_code == 400
        assert calls == []


class _NotFound(Exception):
    code = 404


def _fake_resend(
    *, existing=False, segments=None, fail=None, create_fail=None, get_fail=None
):
    log = []
    mod = types.ModuleType("resend")

    class Segments:
        @staticmethod
        def list():
            log.append(("segments.list",))
            return {"data": list(segments or [])}

        @staticmethod
        def create(params):
            log.append(("segments.create", params["name"]))
            return {"id": "seg-new"}

    class ContactSegments:
        @staticmethod
        def add(params):
            log.append(("contact.segment.add", params["email"], params["segment_id"]))

    class Contacts:
        Segments = ContactSegments

        @staticmethod
        def create(params):
            log.append(("contacts.create", params))
            if create_fail:
                raise create_fail

        @staticmethod
        def get(email):
            log.append(("contacts.get", email))
            err = get_fail or (None if existing else _NotFound("not found"))
            if err:
                raise err
            return {"email": email}

        @staticmethod
        def remove(email):
            log.append(("contacts.remove", email))
            if fail:
                raise fail

    mod.Segments = Segments
    mod.Contacts = Contacts
    return mod, log


@pytest.fixture
def fake(monkeypatch):
    monkeypatch.setattr(settings, "resend_api_key", "re_test")
    monkeypatch.setattr(newsletter_sync, "_segment_id", None)
    reported = []
    monkeypatch.setattr(
        newsletter_sync,
        "capture_background_exception",
        lambda exc, task: reported.append(exc),
    )

    def install(**kw):
        mod, log = _fake_resend(**kw)
        monkeypatch.setitem(sys.modules, "resend", mod)
        return log, reported

    return install


class TestSyncService:
    def test_creates_segment_once_and_global_contact(self, fake):
        log, reported = fake()
        newsletter_sync.sync_subscribe("a@gmail.com")
        newsletter_sync.sync_subscribe("b@gmail.com")
        assert log.count(("segments.create", "newsletter")) == 1
        creates = [c[1] for c in log if c[0] == "contacts.create"]
        assert creates[0] == {
            "email": "a@gmail.com",
            "unsubscribed": False,
            "segments": [{"id": "seg-new"}],
        }
        assert "audience_id" not in creates[0]
        assert reported == []

    def test_reuses_existing_segment_by_name(self, fake):
        log, _ = fake(segments=[{"id": "seg-old", "name": "newsletter"}])
        newsletter_sync.sync_subscribe("a@gmail.com")
        assert not any(c[0] == "segments.create" for c in log)

    def test_existing_contact_keeps_opt_out_but_joins_segment(self, fake):
        # Anonymous signup must not undo someone's unsubscribe (security review).
        # `create` is never called for an existing address, so it does not
        # matter whether Resend's create would upsert.
        log, reported = fake(
            existing=True, segments=[{"id": "s1", "name": "newsletter"}]
        )
        newsletter_sync.sync_subscribe("back@gmail.com")
        assert not any(c[0] in ("contacts.update", "contacts.create") for c in log)
        assert ("contact.segment.add", "back@gmail.com", "s1") in log
        assert reported == []

    def test_non_duplicate_create_error_is_reported_not_masked(self, fake):
        # A 429 / restricted key on create must surface as itself, not as a
        # segment-add failure.
        boom = RuntimeError("rate_limit_exceeded")
        log, reported = fake(
            create_fail=boom, segments=[{"id": "s1", "name": "newsletter"}]
        )
        newsletter_sync.sync_subscribe("a@gmail.com")
        assert reported == [boom]
        assert not any(c[0] == "contact.segment.add" for c in log)

    def test_lookup_error_other_than_404_is_reported(self, fake):
        log, reported = fake(get_fail=RuntimeError("restricted_api_key"))
        newsletter_sync.sync_subscribe("a@gmail.com")
        assert len(reported) == 1
        assert not any(c[0] == "contacts.create" for c in log)

    def test_site_unsubscribe_deletes_contact(self, fake):
        # Mirrors the row delete, so a later genuine site signup starts clean
        # (create path) instead of staying silently unsubscribed in Resend.
        log, reported = fake()
        newsletter_sync.sync_unsubscribe("bye@gmail.com")
        assert log == [("contacts.remove", "bye@gmail.com")]
        assert reported == []

    def test_unsubscribe_of_unknown_contact_is_quiet(self, fake):
        _, reported = fake(fail=_NotFound("not found"))
        newsletter_sync.sync_unsubscribe("ghost@gmail.com")
        assert reported == []

    def test_failure_is_reported_never_raised(self, fake):
        _, reported = fake(fail=RuntimeError("restricted_api_key"))
        newsletter_sync.sync_unsubscribe("x@gmail.com")
        assert len(reported) == 1

    def test_no_key_and_reserved_domain_do_nothing(self, fake, monkeypatch):
        log, _ = fake()
        newsletter_sync.sync_subscribe("e2e@example.com")
        monkeypatch.setattr(settings, "resend_api_key", "")
        newsletter_sync.sync_subscribe("real@gmail.com")
        assert log == []
