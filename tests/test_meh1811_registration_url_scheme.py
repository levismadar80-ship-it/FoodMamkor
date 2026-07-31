"""MEH-1811 — `registration_url` runs the http(s) scheme allowlist.

`EventCreate.registration_url` / `EventUpdate.registration_url` carried NO
validator (schemas.py:2937/2972 before this ticket) while the value lands
directly in an `href` (EventDetailClient.jsx:157, ProducerSections.jsx:379).
`rel="noopener noreferrer"` does not defend against a scheme payload — it
defends against tabnabbing. So a business owner typing `javascript:alert(1)`
into "לינק הרשמה חיצוני" got stored XSS on the event page.

Measured in Chromium (MEH-1809 / PR #2477): `<input type="url">` reports
`valid=true` for BOTH `javascript:alert(1)` and `data:text/html,<b>x`. The
native control never blocked a dangerous scheme — it only rejects strings
that do not parse as a URL. The server is therefore the only boundary.

Per ADR-032 §3.6 these assert BEHAVIOUR — the request is rejected — not that
a particular validator function was wired up. Every test here fails against
the pre-fix schema and passes after; none of them reads the validator's name.

The reused validator is `_url_scheme_validator`, the same function already
applied to website / facebook / external_order_form (schemas.py:1122, 1227,
1534). NOT `_image_url_validator`, which additionally rejects a netloc ending
in an image extension — image-specific, and the wrong sibling for a general
external link.

REUSES: tests/test_verified_email_enforcement.py — the verified-producer
wiring and the minimal /events payload; tests/test_meh1222_image_url_validation.py
— the pure-Pydantic write-boundary shape.
"""

from datetime import date
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models.models import Event
from app.schemas.schemas import (
    EventCreate,
    EventUpdate,
    ProducerCreate,
    ProducerUpdate,
)
from conftest import auth_header, make_producer, make_user

# The two schemes from the ticket's evidence block, plus three more the
# allowlist must reject for the same reason: anything that is not http(s)
# reaching an href is a scheme the page never intended to execute or embed.
DANGEROUS_SCHEMES = [
    "javascript:alert(1)",
    "JavaScript:alert(1)",  # case — the guard lowercases before comparing
    "data:text/html,<b>x",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "ftp://example.com/signup",
]

GOOD_URL = "https://example.com/signup"


# ---------- helpers ----------


def _producer_user(db, *, email: str):
    producer = make_producer(db, name=f"MEH1811 {uuid4().hex[:6]}", status="approved")
    user = make_user(db, role="producer", email=email, email_verified=True)
    user.producer_id = producer.id
    db.commit()
    db.refresh(user)
    return producer, user


def _event_payload(**overrides):
    payload = {
        "title": "סדנת אפייה",
        "event_date": date(2099, 1, 1).isoformat(),
        "category": "שוק",  # events.VALID_CATEGORIES
    }
    payload.update(overrides)
    return payload


def _event_create(**overrides):
    return EventCreate(**_event_payload(**overrides))


# ---------- the exploit, at the HTTP boundary ----------


class TestPostEventRejectsDangerousScheme:
    """The acceptance criterion verbatim: POST /events with a javascript:
    registration_url returns 422, not 201. Asserted through the real route so
    the guard is proven at the boundary an attacker actually reaches."""

    @pytest.mark.parametrize("bad", DANGEROUS_SCHEMES)
    def test_post_events_422_on_dangerous_scheme(self, client, db, bad):
        _, user = _producer_user(db, email=f"post-{uuid4().hex[:8]}@example.com")

        resp = client.post(
            "/events",
            json=_event_payload(registration_url=bad),
            headers=auth_header(user),
        )

        assert resp.status_code == 422, resp.text
        # Nothing was persisted — a 422 that still wrote the row would be a
        # pass on the status code and a failure on the actual property.
        assert db.query(Event).count() == 0

    def test_post_events_201_on_https(self, client, db):
        _, user = _producer_user(db, email=f"ok-{uuid4().hex[:8]}@example.com")

        resp = client.post(
            "/events",
            json=_event_payload(registration_url=GOOD_URL),
            headers=auth_header(user),
        )

        assert resp.status_code == 201, resp.text
        assert resp.json()["registration_url"] == GOOD_URL

    @pytest.mark.parametrize("bad", ["javascript:alert(1)", "data:text/html,<b>x"])
    def test_put_events_422_on_dangerous_scheme(self, client, db, bad):
        """EventUpdate is a separate schema and was separately unguarded — an
        event created clean could be poisoned on the edit path."""
        _, user = _producer_user(db, email=f"put-{uuid4().hex[:8]}@example.com")
        created = client.post(
            "/events",
            json=_event_payload(registration_url=GOOD_URL),
            headers=auth_header(user),
        )
        assert created.status_code == 201, created.text
        event_id = created.json()["id"]

        resp = client.put(
            f"/events/{event_id}",
            json={"registration_url": bad},
            headers=auth_header(user),
        )

        assert resp.status_code == 422, resp.text
        # The stored value is untouched — the reject did not half-apply.
        db.expire_all()
        assert db.query(Event).filter(Event.id == event_id).one().registration_url == (
            GOOD_URL
        )


# ---------- schema level: Create + Update parity ----------


class TestEventSchemaSchemeGuard:
    @pytest.mark.parametrize("bad", DANGEROUS_SCHEMES)
    def test_create_rejects(self, bad):
        with pytest.raises(ValidationError):
            _event_create(registration_url=bad)

    @pytest.mark.parametrize("bad", DANGEROUS_SCHEMES)
    def test_update_rejects(self, bad):
        with pytest.raises(ValidationError):
            EventUpdate(registration_url=bad)

    @pytest.mark.parametrize("good", [GOOD_URL, "http://example.com/signup"])
    def test_both_accept_http_and_https(self, good):
        assert _event_create(registration_url=good).registration_url == good
        assert EventUpdate(registration_url=good).registration_url == good

    def test_empty_and_whitespace_normalise_to_none(self):
        # The MEH-1626 chunk-3 convention shared by every _url_scheme_validator
        # caller: a cleared dashboard field must not 422, it must store NULL.
        for blank in ["", "   "]:
            assert _event_create(registration_url=blank).registration_url is None
            assert EventUpdate(registration_url=blank).registration_url is None

    def test_omitted_and_none_stay_none(self):
        assert _event_create().registration_url is None
        assert _event_create(registration_url=None).registration_url is None
        assert EventUpdate().registration_url is None

    def test_surrounding_whitespace_is_stripped(self):
        assert _event_create(registration_url=f"  {GOOD_URL}  ").registration_url == (
            GOOD_URL
        )


# ---------- regression: the validator's pre-existing callers ----------


class TestExistingCallersUnaffected:
    """Same function, one more caller. These three fields were already guarded
    and must behave identically — the risk of this change is a shared-helper
    edit, and the only defence against that is asserting the old callers."""

    @pytest.mark.parametrize("field", ["website", "facebook", "external_order_form"])
    def test_producer_update_still_rejects_dangerous_scheme(self, field):
        with pytest.raises(ValidationError):
            ProducerUpdate(**{field: "javascript:alert(1)"})

    @pytest.mark.parametrize("field", ["website", "facebook", "external_order_form"])
    def test_producer_update_still_accepts_https(self, field):
        assert getattr(ProducerUpdate(**{field: GOOD_URL}), field) == GOOD_URL

    def test_producer_create_still_guarded(self):
        with pytest.raises(ValidationError):
            ProducerCreate(
                name="חוות הבדיקה",
                city="תל אביב",
                website="javascript:alert(1)",
            )
