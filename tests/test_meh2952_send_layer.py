"""MEH-2952 — no email or WhatsApp reaches anyone when the send was caused by
a test business or a test user (`producers.is_test` / `users.is_test`).

Decided by the product owner (option «a»): no allowlist, no new env var —
staging and production alike drop the send and log it. The mechanism is one
keyword on the three send-layer functions:

    send_email(..., test_cause=False)
    send_text(to, body, test_cause=False)
    send_template(to, template, test_cause=False)

`test_cause=True` returns before any other check and before any transport
call. Every caller that sends *because of* a business or a user computes the
flag from the row it already holds; callers caused by neither (newsletter,
contact form, outreach thank-you, business suggestions, the WhatsApp watchdog
and opt-out, the unwired rating dispatcher) pass nothing.

What this file proves, in order:

1. The send layer itself: a flagged send never reaches Resend / Graph; an
   unflagged control does (so the recorder is live, not silent).
2. The production-profile guard the product owner asked for: production
   settings, WhatsApp configured, and `OTP_TEST_NUMBERS` / `OTP_TEST_CODE`
   set to values that INCLUDE the recipient — a send caused by a test
   business is still impossible, at the send layer and through two real
   routes (admin approve, the owner's OTP request).
3. One behaviour test per caller group (admin-notified, owner, consumer,
   own-auth): a test row sends nothing, an ordinary row sends.
4. The inventory guard: every send-layer call under backend/app is pinned to
   a group, and every non-«none» call passes a NON-constant `test_cause=`.
   A new, removed or unflagged site turns it red. The classifier ships with
   a self-test on synthetic source and a case anchored to a real repo file.

Transport is recorded at the lowest level the app reaches: the Resend client
returned by `configure_resend`, and `httpx.post` inside services/whatsapp.py
(only Graph `/messages` URLs — IndexNow also uses httpx.post).
"""

from __future__ import annotations

import ast
import logging
from datetime import timedelta
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.config import settings
from app.models.models import (
    ProducerLocation,
    ProducerRecipe,
    ProducerReview,
    ProducerWhatsAppClick,
    RescueOffer,
    RescueOrder,
)
from app.utils.clock import israel_today, utc_now
from app.services import email as email_module
from app.services import whatsapp as whatsapp_module
from app.services.whatsapp_templates import OtpCodeV1, ProducerApprovedV1
from tests.conftest import (
    SUBMIT_READY_IMAGE,
    auth_header,
    make_producer,
    make_submit_ready_producer,
    make_user,
)

REPO = Path(__file__).resolve().parents[1]
APP_DIR = REPO / "backend" / "app"

# Recipient domains here are deliberately NOT RFC 2606 reserved: send_email
# drops example.com / *.test before the API call (MEH-2550), which would make
# a "nothing sent" assertion pass for the wrong reason.
ADMIN_EMAIL = "ops@mehamakor-ops.co.il"
ADMIN_WA = "+972500000001"
OTP_NUMBER = "+972501112233"  # the recipient, and on the OTP test list
OTP_CODE = "246810"


# ---------------------------------------------------------------------------
# transport recorder
# ---------------------------------------------------------------------------


class _OkResp:
    status_code = 200

    def raise_for_status(self):
        return None

    def json(self):
        return {"messages": [{"id": "wamid.meh2952"}]}


@pytest.fixture
def transport(monkeypatch):
    """Configure both channels and record every call that reaches a transport."""
    box = SimpleNamespace(emails=[], whatsapp=[])

    monkeypatch.setattr(settings, "resend_api_key", "re_meh2952_test")
    monkeypatch.setattr(settings, "whatsapp_phone_number_id", "PNID")
    monkeypatch.setattr(settings, "whatsapp_access_token", "TOKEN")
    monkeypatch.setattr(settings, "admin_email", ADMIN_EMAIL)
    monkeypatch.setattr(settings, "admin_whatsapp_to", ADMIN_WA)

    class _Emails:
        @staticmethod
        def send(params):
            box.emails.append(params)

    monkeypatch.setattr(
        email_module, "configure_resend", lambda key: SimpleNamespace(Emails=_Emails)
    )

    real_post = whatsapp_module.httpx.post

    def _post(url, *args, **kwargs):
        if "/messages" in str(url):
            box.whatsapp.append(kwargs.get("json"))
            return _OkResp()
        return real_post(url, *args, **kwargs)

    monkeypatch.setattr(whatsapp_module.httpx, "post", _post)
    return box


def _to(emails):
    return sorted(e["to"] for e in emails)


def _wa_to(messages):
    return sorted(m["to"] for m in messages)


# ---------------------------------------------------------------------------
# 1. the send layer
# ---------------------------------------------------------------------------


def test_send_email_with_test_cause_never_reaches_resend(transport, caplog):
    with caplog.at_level(logging.INFO, logger="app.services.email"):
        email_module.send_email(
            "owner@sample.co.il", "נושא", "גוף", html="<p>x</p>", test_cause=True
        )
    assert transport.emails == []
    lines = [r.getMessage() for r in caplog.records if r.levelno == logging.INFO]
    assert any(
        "[EMAIL] skipped: caused by a test row" in m and "***@sample.co.il" in m
        for m in lines
    ), lines
    # The full address never reaches the log (MEH-1613 privacy bar).
    assert not any("owner@sample.co.il" in m for m in lines)


def test_send_email_control_without_test_cause_does_reach_resend(transport):
    email_module.send_email("owner@sample.co.il", "נושא", "גוף")
    assert _to(transport.emails) == ["owner@sample.co.il"]


def test_send_email_test_cause_is_checked_before_every_other_check(
    transport, monkeypatch
):
    """`test_cause` returns first: an empty recipient or a missing key would
    otherwise reach the Sentry reporter — a test row must not page anyone."""
    reported = []
    monkeypatch.setattr(email_module, "_report", lambda *a, **k: reported.append(a))
    email_module.send_email("", "נושא", "גוף", test_cause=True)
    monkeypatch.setattr(settings, "resend_api_key", "")
    email_module.send_email("a@sample.co.il", "נושא", "גוף", test_cause=True)
    assert reported == []
    # Control: the same two calls without the flag DO report.
    email_module.send_email("", "נושא", "גוף")
    assert len(reported) == 1


@pytest.mark.parametrize("fn", ["send_text", "send_template"])
def test_whatsapp_with_test_cause_never_posts(transport, caplog, fn):
    send = getattr(whatsapp_module, fn)
    payload = "שלום" if fn == "send_text" else ProducerApprovedV1(producer_name="x")
    with caplog.at_level(logging.INFO, logger="app.services.whatsapp"):
        ok = send("+972501234567", payload, test_cause=True)
    assert ok is False
    assert transport.whatsapp == []
    lines = [r.getMessage() for r in caplog.records]
    assert any("[WHATSAPP] skipped: caused by a test row" in m for m in lines), lines
    assert not any("972501234567" in m for m in lines), "phone must be masked"


@pytest.mark.parametrize("fn", ["send_text", "send_template"])
def test_whatsapp_control_without_test_cause_does_post(transport, fn):
    send = getattr(whatsapp_module, fn)
    payload = "שלום" if fn == "send_text" else ProducerApprovedV1(producer_name="x")
    assert send("+972501234567", payload) is True
    assert _wa_to(transport.whatsapp) == ["972501234567"]


# ---------------------------------------------------------------------------
# 2. production-profile guard (required by the product owner)
# ---------------------------------------------------------------------------


@pytest.fixture
def production(monkeypatch, transport):
    monkeypatch.setattr(settings, "env", "production")
    monkeypatch.setattr(settings, "railway_environment", "production")
    monkeypatch.setattr(settings, "otp_test_numbers", OTP_NUMBER)
    monkeypatch.setattr(settings, "otp_test_code", OTP_CODE)
    return transport


def test_production_profile_send_layer_refuses_a_test_caused_whatsapp(production):
    assert whatsapp_module.send_text(OTP_NUMBER, OTP_CODE, test_cause=True) is False
    assert (
        whatsapp_module.send_template(
            OTP_NUMBER, OtpCodeV1(code=OTP_CODE), test_cause=True
        )
        is False
    )
    assert production.whatsapp == []
    # Control in the same profile: the recorder is live.
    assert whatsapp_module.send_template(OTP_NUMBER, OtpCodeV1(code=OTP_CODE))
    assert _wa_to(production.whatsapp) == [OTP_NUMBER.lstrip("+")]


def _approvable(db, *, is_test: bool, owner_email: str, phone: str):
    producer = make_producer(
        db,
        name="חוות בדיקה" if is_test else "חוות אמת",
        status="pending",
        images=[SUBMIT_READY_IMAGE],
        phone_verified=True,
    )
    producer.phone = phone
    producer.is_test = is_test
    owner = make_user(db, email=owner_email, role="producer")
    owner.producer_id = producer.id
    db.commit()
    return producer, owner


def test_production_profile_admin_approve_of_a_test_business_sends_nothing(
    client, db, production
):
    producer, _owner = _approvable(
        db, is_test=True, owner_email="tester@sample.co.il", phone=OTP_NUMBER
    )
    admin = make_user(db, email="admin@sample.co.il", role="admin")

    r = client.post(
        f"/admin/producers/{producer.id}/approve", headers=auth_header(admin)
    )

    assert r.status_code == 200, r.text
    assert production.emails == [], "owner approval email went out for a test row"
    assert production.whatsapp == [], "WhatsApp went out for a test row"


def test_production_profile_admin_approve_of_an_ordinary_business_sends(
    client, db, production
):
    producer, owner = _approvable(
        db, is_test=False, owner_email="real@sample.co.il", phone="0521234567"
    )
    admin = make_user(db, email="admin@sample.co.il", role="admin")

    r = client.post(
        f"/admin/producers/{producer.id}/approve", headers=auth_header(admin)
    )

    assert r.status_code == 200, r.text
    assert _to(production.emails) == [owner.email]
    # The owner's approval template and the admin's ping.
    assert _wa_to(production.whatsapp) == sorted(["972521234567", ADMIN_WA.lstrip("+")])


def test_production_profile_otp_for_a_test_business_on_the_test_list_sends_nothing(
    client, db, production
):
    """The OTP test list names this very number, and production refuses the
    fixed code (MEH-2231) — so the real send path runs. It must still not
    reach WhatsApp, because the business is a test row."""
    producer, owner = _approvable(
        db, is_test=True, owner_email="tester@sample.co.il", phone=OTP_NUMBER
    )
    producer.phone_verified = False
    db.commit()

    r = client.post("/producers/me/verify-phone", headers=auth_header(owner))

    assert r.status_code == 200, r.text
    assert production.whatsapp == []


def test_production_profile_otp_control_for_an_ordinary_business_sends(
    client, db, production
):
    producer, owner = _approvable(
        db, is_test=False, owner_email="real@sample.co.il", phone=OTP_NUMBER
    )
    producer.phone_verified = False
    db.commit()

    r = client.post("/producers/me/verify-phone", headers=auth_header(owner))

    assert r.status_code == 200, r.text
    assert _wa_to(production.whatsapp) == [OTP_NUMBER.lstrip("+")]


# ---------------------------------------------------------------------------
# 3. one behaviour test per caller group
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("is_test", [True, False], ids=["test-row", "ordinary"])
def test_group_admin_notified_submit_for_review(client, db, transport, is_test):
    """Admin hears about a business (email + WhatsApp); the owner gets her
    submission confirmation. A test business: none of the three."""
    producer, owner = make_submit_ready_producer(db)
    owner.email = "owner@sample.co.il"
    producer.is_test = is_test
    db.commit()

    r = client.post("/producers/me/submit-for-review", headers=auth_header(owner))

    assert r.status_code == 200, r.text
    if is_test:
        assert transport.emails == [] and transport.whatsapp == []
    else:
        assert _to(transport.emails) == sorted([ADMIN_EMAIL, "owner@sample.co.il"])
        assert _wa_to(transport.whatsapp) == [ADMIN_WA.lstrip("+")]


@pytest.mark.parametrize("is_test", [True, False], ids=["test-row", "ordinary"])
def test_group_owner_recipe_approval(client, db, transport, is_test):
    producer = make_producer(db, name="מאפיית השדה")
    producer.slug = "maafiyat-hasade"
    producer.is_test = is_test
    owner = make_user(db, email="owner@sample.co.il", role="producer")
    owner.producer_id = producer.id
    recipe = ProducerRecipe(
        producer_id=producer.id,
        title="לחם מחמצת",
        ingredients="א" * 20,
        instructions="ב" * 20,
        moderation_status="pending",
        published=False,
    )
    db.add(recipe)
    db.commit()
    admin = make_user(db, email="admin@sample.co.il", role="admin")

    r = client.post(f"/admin/recipes/{recipe.id}/approve", headers=auth_header(admin))

    assert r.status_code == 200, r.text
    assert _to(transport.emails) == ([] if is_test else ["owner@sample.co.il"])


@pytest.mark.parametrize("is_test", [True, False], ids=["test-row", "ordinary"])
def test_group_consumer_reviewer_hears_the_reply(client, db, transport, is_test):
    """A consumer is mailed because a business answered her review."""
    producer = make_producer(db, name="מאפיית השדה")
    producer.slug = "maafiyat-hasade"
    producer.is_test = is_test
    owner = make_user(db, email="owner@sample.co.il", role="producer")
    owner.producer_id = producer.id
    buyer = make_user(db, email="buyer@sample.co.il")
    review = ProducerReview(
        producer_id=producer.id,
        user_id=buyer.id,
        stars=5,
        body="המוצרים מדהימים ואוהבת את השירות!",
    )
    db.add(review)
    db.commit()

    r = client.put(
        f"/reviews/{review.id}/reply",
        json={"reply": "תודה רבה, שמחנו!"},
        headers=auth_header(owner),
    )

    assert r.status_code == 200, r.text
    assert _to(transport.emails) == ([] if is_test else ["buyer@sample.co.il"])


@pytest.mark.parametrize("is_test", [True, False], ids=["test-row", "ordinary"])
def test_group_own_auth_forgot_password(client, db, transport, is_test):
    user = make_user(db, email="someone@sample.co.il")
    user.is_test = is_test
    db.commit()

    r = client.post("/auth/forgot-password", json={"email": "someone@sample.co.il"})

    assert r.status_code == 200, r.text
    assert _to(transport.emails) == ([] if is_test else ["someone@sample.co.il"])


@pytest.mark.parametrize("is_test", [True, False], ids=["test-row", "ordinary"])
def test_group_own_auth_account_deletion_reads_the_flag_before_the_row_goes(
    client, db, transport, is_test
):
    """DELETE /auth/me: `is_test` is captured BEFORE the row is deleted."""
    user = make_user(db, email="leaving@sample.co.il")
    user.is_test = is_test
    db.commit()

    r = client.delete("/auth/me", headers=auth_header(user))

    assert r.status_code == 200, r.text
    assert _to(transport.emails) == ([] if is_test else ["leaving@sample.co.il"])


# ---------------------------------------------------------------------------
# 3b. the cause is also the ACTING account (review follow-up)
# ---------------------------------------------------------------------------

REVIEW_BODY = "המוצרים מדהימים ואוהבת את השירות!"


def _real_business_with_owner(db, owner_email="owner@sample.co.il"):
    producer = make_producer(db, name="מאפיית השדה")
    producer.slug = "maafiyat-hasade"
    owner = make_user(db, email=owner_email, role="producer")
    owner.producer_id = producer.id
    db.commit()
    return producer, owner


@pytest.mark.parametrize("is_test", [True, False], ids=["test-reviewer", "ordinary"])
def test_test_consumer_reviewing_a_real_business_sends_no_owner_mail(
    client, db, transport, is_test
):
    producer, owner = _real_business_with_owner(db)
    buyer = make_user(db, email="buyer@sample.co.il")
    buyer.is_test = is_test
    db.add(ProducerWhatsAppClick(producer_id=producer.id, user_id=buyer.id))
    db.commit()

    r = client.post(
        f"/producers/{producer.id}/reviews",
        json={"stars": 5, "body": REVIEW_BODY},
        headers=auth_header(buyer),
    )

    assert r.status_code == 201, r.text
    assert _to(transport.emails) == ([] if is_test else [owner.email])


@pytest.mark.parametrize("is_test", [True, False], ids=["test-owner", "ordinary"])
def test_test_owner_replying_on_a_real_business_sends_no_reviewer_mail(
    client, db, transport, is_test
):
    producer, owner = _real_business_with_owner(db)
    owner.is_test = is_test
    buyer = make_user(db, email="buyer@sample.co.il")
    review = ProducerReview(
        producer_id=producer.id, user_id=buyer.id, stars=5, body=REVIEW_BODY
    )
    db.add(review)
    db.commit()

    r = client.put(
        f"/reviews/{review.id}/reply",
        json={"reply": "תודה רבה, שמחנו!"},
        headers=auth_header(owner),
    )

    assert r.status_code == 200, r.text
    assert _to(transport.emails) == ([] if is_test else ["buyer@sample.co.il"])


# ---------------------------------------------------------------------------
# 3c. a test row never logs at WARNING or above (Sentry captures ERROR)
# ---------------------------------------------------------------------------


def _loud(caplog):
    return [
        f"{r.name}: {r.getMessage()}"
        for r in caplog.records
        if r.levelno >= logging.WARNING and r.name.startswith("app.")
    ]


def _notifier_calls():
    from app.services import auth_notifications as an

    return [
        ("registered", lambda tc: an.notify_producer_registered("x", "0521234567", tc)),
        (
            "approved",
            lambda tc: an.notify_producer_approved(
                "x", "0521234567", None, "id", test_cause=tc
            ),
        ),
        (
            "changes",
            lambda tc: an.notify_producer_changes_requested(
                "x", "0521234567", "תמונה", test_cause=tc
            ),
        ),
        ("new_recipe", lambda tc: an.notify_admin_new_recipe("x", "y", test_cause=tc)),
        (
            "resubmit",
            lambda tc: an.notify_admin_producer_resubmit("x", "c", test_cause=tc),
        ),
        (
            "review_ready",
            lambda tc: an.notify_admin_producer_review_ready("x", "c", test_cause=tc),
        ),
        (
            "sensitive",
            lambda tc: an.notify_admin_producer_sensitive_edit(
                "x", ["phone"], test_cause=tc
            ),
        ),
        (
            "category",
            lambda tc: an.notify_admin_new_category_request("x", "y", test_cause=tc),
        ),
        (
            "new_producer",
            lambda tc: an.notify_admin_new_producer("x", "c", test_cause=tc),
        ),
    ]


@pytest.mark.parametrize("configured", [True, False], ids=["wa-on", "wa-off"])
def test_a_test_row_notifier_logs_nothing_at_warning_or_above(
    monkeypatch, caplog, transport, configured
):
    """With WhatsApp on, the send layer would return False and the producer
    notifiers logged «… FAILED» at ERROR; with it off, their preflight logged
    «SKIPPED … missing» at ERROR. Either pages Sentry for a seeded test row."""
    if not configured:
        monkeypatch.setattr(settings, "whatsapp_phone_number_id", "")
        monkeypatch.setattr(settings, "whatsapp_access_token", "")
        monkeypatch.setattr(settings, "admin_whatsapp_to", "")
    for label, call in _notifier_calls():
        caplog.clear()
        with caplog.at_level(logging.DEBUG):
            call(True)
        assert _loud(caplog) == [], label
        assert any("caused by a test row" in r.getMessage() for r in caplog.records), (
            label
        )
    assert transport.emails == [] and transport.whatsapp == []


def test_control_the_same_notifier_does_log_loud_when_it_really_fails(
    monkeypatch, caplog, transport
):
    """Control: with WhatsApp off, an ORDINARY row still logs the ERROR — so
    the silence above is the flag, not a dead caplog."""
    from app.services import auth_notifications as an

    monkeypatch.setattr(settings, "whatsapp_phone_number_id", "")
    with caplog.at_level(logging.DEBUG):
        an.notify_producer_approved("x", "0521234567", None, "id")
    assert any("SKIPPED" in m for m in _loud(caplog)), _loud(caplog)


# ---------------------------------------------------------------------------
# 3d. scheduled owner messages exclude test businesses outright
# ---------------------------------------------------------------------------


@pytest.fixture
def digest_gates(monkeypatch):
    from app.routers import rescue as rescue_module
    from app.services import rescue_digest as digest_module

    monkeypatch.setattr(rescue_module, "rescue_bags_enabled", lambda: True)
    monkeypatch.setattr(rescue_module, "rescue_cities", lambda: ("חיפה",))
    monkeypatch.setattr(digest_module, "digest_enabled", lambda: True)


def _due_digest_offer(db, *, is_test: bool, phone: str):
    producer = make_producer(db, name="מאפיית הקודים", city="חיפה")
    producer.phone = phone
    producer.is_test = is_test
    owner = make_user(db, role="producer")
    owner.producer_id = producer.id
    location = ProducerLocation(
        producer_id=producer.id,
        kind="branch",
        is_primary=True,
        city="חיפה",
        address="הנביאים 10",
        lat=32.7940,
        lng=34.9896,
        location_precision="exact",
    )
    db.add(location)
    db.commit()
    now = utc_now().replace(tzinfo=None)
    offer = RescueOffer(
        producer_location_id=location.id,
        date=israel_today(),
        qty_total=5,
        qty_left=3,
        price_agorot=1500,
        pickup_start=now - timedelta(minutes=10),
        pickup_end=now + timedelta(minutes=120),
        cancel_until=now - timedelta(minutes=11),
        status="active",
    )
    db.add(offer)
    db.commit()
    buyer = make_user(db, email=f"buyer-{phone[-4:]}@sample.co.il")
    db.add(
        RescueOrder(
            offer_id=offer.id,
            user_id=buyer.id,
            qty=1,
            pickup_code="0431",
            status="reserved",
        )
    )
    db.commit()
    db.refresh(offer)
    return offer


@pytest.mark.parametrize("is_test", [True, False], ids=["test-row", "ordinary"])
def test_rescue_digest_excludes_a_test_business(
    db, transport, digest_gates, caplog, is_test
):
    from app.services.rescue_digest import send_rescue_digests

    offer = _due_digest_offer(db, is_test=is_test, phone="+972501112233")

    with caplog.at_level(logging.DEBUG):
        counts = send_rescue_digests(db)

    db.refresh(offer)
    if is_test:
        assert transport.whatsapp == []
        assert counts["scanned"] == 0 and counts["failed"] == 0, counts
        assert counts["sent"] == 0
        assert _loud(caplog) == []
        assert offer.codes_sent_at is None
    else:
        assert _wa_to(transport.whatsapp) == ["972501112233"]
        assert counts["scanned"] == 1 and counts["sent"] == 1, counts
        assert offer.codes_sent_at is not None


def _badged(db, *, is_test: bool, phone: str):
    producer = make_producer(db, name="חוות בדיקה" if is_test else "חוות אמת")
    producer.phone = phone
    producer.is_test = is_test
    producer.kashrut_badges = ["badatz"]
    producer.kashrut_expires_at = utc_now() + timedelta(days=5)
    db.commit()
    return producer


def test_kashrut_reminders_skip_a_test_business_and_count_no_failure(
    client, db, transport
):
    real = _badged(db, is_test=False, phone="050-123-4567")
    _badged(db, is_test=True, phone="050-765-4321")
    admin = make_user(db, email="admin@sample.co.il", role="admin")

    r = client.post(
        "/admin/kashrut/expiry-reminders",
        params={"dry_run": "false"},
        headers=auth_header(admin),
    )

    assert r.status_code == 200, r.text
    body = r.json()
    assert [row["producer_id"] for row in body["rows"]] == [str(real.id)]
    assert body["sent_count"] == 1 and body["failed_count"] == 0, body
    assert _wa_to(transport.whatsapp) == ["972501234567"]


# ---------------------------------------------------------------------------
# 4. inventory guard
# ---------------------------------------------------------------------------

SEND_NAMES = frozenset(
    {
        "send_email",
        "send_text",
        "send_template",
        "_send_email",
        "_send_notification_email",
        "_send_whatsapp",
    }
)
FLAG = "test_cause"


@dataclass(frozen=True)
class Site:
    file: str  # relative to backend/app
    func: str  # enclosing function, dotted for nesting; "<module>" at top level
    callee: str
    flag: ast.expr | None  # the test_cause= value, or None when absent
    line: int


def _callee_name(func: ast.expr, aliases: dict[str, str]) -> str | None:
    if isinstance(func, ast.Name):
        return aliases.get(func.id, func.id)
    if isinstance(func, ast.Attribute):
        return func.attr
    return None


def _flag(call: ast.Call) -> ast.expr | None:
    for kw in call.keywords:
        if kw.arg == FLAG:
            return kw.value
    return None


def _walk(tree: ast.Module):
    """Yield (enclosing function node or None, dotted name, call) for every Call."""

    def visit(node, stack):
        for child in ast.iter_child_nodes(node):
            if isinstance(child, ast.FunctionDef | ast.AsyncFunctionDef):
                yield from visit(child, [*stack, child])
            else:
                if isinstance(child, ast.Call):
                    fn = stack[-1] if stack else None
                    name = ".".join(f.name for f in stack) or "<module>"
                    yield fn, name, child
                yield from visit(child, stack)

    yield from visit(tree, [])


def _aliases(tree: ast.Module) -> dict[str, str]:
    out = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            for a in node.names:
                if a.asname:
                    out[a.asname] = a.name
    return out


def collect_sites(source: str, rel: str) -> list[Site]:
    """Every send-layer call — and every send function passed as a VALUE.

    `background_tasks.add_task(send_email, ...)` never calls `send_email`
    syntactically, so a call-only walk cannot see it. A send name used as a
    positional argument of another call is recorded as a site with callee
    `<outer>(<send name>)`, e.g. `add_task(send_email)`, and its flag is the
    `test_cause=` of that outer call — the kwarg add_task forwards.
    """
    tree = ast.parse(source)
    aliases = _aliases(tree)
    sites = []
    for _fn, name, call in _walk(tree):
        callee = _callee_name(call.func, aliases)
        if callee in SEND_NAMES:
            sites.append(Site(rel, name, callee, _flag(call), call.lineno))
        for arg in call.args:
            if isinstance(arg, ast.Name | ast.Attribute):
                passed = _callee_name(arg, aliases)
                if passed in SEND_NAMES:
                    sites.append(
                        Site(rel, name, f"{callee}({passed})", _flag(call), call.lineno)
                    )
    return sites


def _is_param_passthrough(fn, call: ast.Call) -> bool:
    flag = _flag(call)
    if fn is None or not isinstance(flag, ast.Name) or flag.id != FLAG:
        return False
    params = [a.arg for a in fn.args.args + fn.args.kwonlyargs]
    return FLAG in params


def wrapper_violations(sources: dict[str, str]) -> list[str]:
    """Functions that forward their own `test_cause` param into a send are
    wrappers; every call to a wrapper — direct, or as the first argument of
    `add_task(...)` — must pass a non-constant `test_cause=`. Fixpoint, so a
    wrapper of a wrapper is held to the same rule. A wrapper whose callers all
    forgot the flag would otherwise pass the site check while sending."""
    parsed = {rel: ast.parse(src) for rel, src in sources.items()}
    aliases = {rel: _aliases(t) for rel, t in parsed.items()}
    wrappers: set[str] = set()

    def local_wrapper_names(fn) -> set[str]:
        # `notify = a_wrapper if x else b_wrapper; notify(..., test_cause=...)`
        # — a local name bound to a wrapper is a call to that wrapper.
        if fn is None:
            return set()
        out = set()
        for node in ast.walk(fn):
            if (
                isinstance(node, ast.Assign)
                and len(node.targets) == 1
                and isinstance(node.targets[0], ast.Name)
                and any(
                    isinstance(n, ast.Name) and n.id in wrappers | SEND_NAMES
                    for n in ast.walk(node.value)
                )
            ):
                out.add(node.targets[0].id)
        return out

    changed = True
    while changed:
        changed = False
        for rel, tree in parsed.items():
            for fn, _name, call in _walk(tree):
                callee = _callee_name(call.func, aliases[rel])
                if (
                    (
                        callee in SEND_NAMES
                        or callee in wrappers
                        or callee in local_wrapper_names(fn)
                    )
                    and _is_param_passthrough(fn, call)
                    and fn.name not in wrappers
                ):
                    wrappers.add(fn.name)
                    changed = True
    out = []
    for rel, tree in parsed.items():
        for _fn, name, call in _walk(tree):
            callee = _callee_name(call.func, aliases[rel])
            first = _callee_name(call.args[0], aliases[rel]) if call.args else None
            if callee in wrappers:
                target = callee
            elif callee == "add_task" and first in wrappers:
                target = first
            else:
                continue
            if target in SEND_NAMES:
                continue  # held by the site check instead
            flag = _flag(call)
            if flag is None or isinstance(flag, ast.Constant):
                out.append(f"{rel}:{call.lineno} {name} → {target} without {FLAG}=")
    return sorted(out)


def site_violations(sites: list[Site], pinned: dict) -> list[str]:
    out = []
    counts = Counter((s.file, s.func, s.callee) for s in sites)
    for key in sorted(set(counts) | set(pinned)):
        if key not in pinned:
            out.append(f"NEW send site, not pinned: {key} ×{counts[key]}")
            continue
        n, group, _why = pinned[key]
        if counts.get(key, 0) != n:
            out.append(f"site count changed: {key} pinned {n}, found {counts[key]}")
    for s in sites:
        entry = pinned.get((s.file, s.func, s.callee))
        if entry is None:
            continue
        group = entry[1]
        if group == "none":
            if s.flag is not None:
                out.append(
                    f"{s.file}:{s.line} {s.func} is group none but passes {FLAG}="
                )
        elif s.flag is None:
            out.append(f"{s.file}:{s.line} {s.func} → {s.callee} has no {FLAG}=")
        elif isinstance(s.flag, ast.Constant):
            out.append(
                f"{s.file}:{s.line} {s.func} → {s.callee} passes a constant "
                f"{FLAG}={s.flag.value!r}"
            )
    return out


def _app_sources() -> dict[str, str]:
    return {
        str(p.relative_to(APP_DIR)): p.read_text(encoding="utf-8")
        for p in sorted(APP_DIR.rglob("*.py"))
    }


BUS, OWN, CON, AUTH, NONE = "business", "owner", "consumer", "auth", "none"

# (file, enclosing function, callee) → (count, group, where test_cause comes from)
PINNED: dict[tuple[str, str, str], tuple[int, str, str]] = {
    # --- admin.py: business moderation (owner mail + admin WhatsApp ping) ---
    ("routers/admin.py", "approve_producer", "_send_notification_email"): (
        1,
        OWN,
        "producer.is_test or owner.is_test (p_test)",
    ),
    ("routers/admin.py", "approve_producer", "_send_whatsapp"): (
        1,
        BUS,
        "p_test — admin ping about the business",
    ),
    ("routers/admin.py", "reject_producer", "_send_notification_email"): (
        1,
        OWN,
        "p_test",
    ),
    ("routers/admin.py", "reject_producer", "_send_whatsapp"): (1, BUS, "p_test"),
    ("routers/admin.py", "request_producer_changes", "_send_notification_email"): (
        1,
        OWN,
        "p_test",
    ),
    ("routers/admin.py", "request_producer_changes", "_send_whatsapp"): (
        1,
        BUS,
        "p_test",
    ),
    ("routers/admin.py", "_send_notification_email", "send_email"): (
        1,
        OWN,
        "wrapper param",
    ),
    ("routers/admin.py", "_send_whatsapp", "send_text"): (1, BUS, "wrapper param"),
    # --- other routers ---
    ("routers/admin_kashrut.py", "kashrut_expiry_reminders", "send_template"): (
        1,
        OWN,
        "producer.is_test",
    ),
    ("routers/admin_outreach.py", "thank_suggester", "send_email"): (
        1,
        NONE,
        "thanks a visitor who suggested a lead — no business row yet",
    ),
    ("routers/alerts.py", "_send_whatsapp_alert", "send_template"): (
        1,
        CON,
        "wrapper param ← fire_alerts: alert.user.is_test or producer.is_test",
    ),
    ("routers/marketing.py", "_send_newsletter_welcome", "send_email"): (
        1,
        NONE,
        "newsletter sign-up — no business or account",
    ),
    ("routers/marketing.py", "_send_contact_email", "send_email"): (
        1,
        NONE,
        "public contact form",
    ),
    ("routers/producer_me.py", "_send_whatsapp_otp", "send_template"): (
        1,
        OWN,
        "wrapper param ← producer.is_test or user.is_test",
    ),
    ("routers/report_info.py", "report_producer_info", "send_email"): (
        1,
        BUS,
        "producer.is_test — admin mail about a business page",
    ),
    ("routers/whatsapp_webhook.py", "_maybe_process_optout", "send_text"): (
        1,
        NONE,
        "opt-out confirmation to whoever wrote STOP",
    ),
    # MEH-2974: the owner invite. The acceptance queues the EXISTING
    # business-approved mail (same two builders admin.approve_producer uses) to
    # the new owner, so its flag is the same `p_test` that path carries —
    # producer.is_test or user.is_test, captured before the session closes.
    (
        "routers/producer_owner_invite.py",
        "accept_owner_invite",
        "add_task(send_email)",
    ): (
        1,
        OWN,
        "p_test — producer.is_test or user.is_test, captured pre-commit",
    ),
    # --- auth_emails: a user's own auth action ---
    ("services/auth_emails.py", "send_reset_email", "send_email"): (
        1,
        AUTH,
        "wrapper param ← user.is_test",
    ),
    ("services/auth_emails.py", "send_verify_email", "send_email"): (
        1,
        AUTH,
        "wrapper param ← user.is_test / p_test",
    ),
    ("services/auth_emails.py", "send_welcome_email", "send_email"): (
        1,
        AUTH,
        "wrapper param ← user.is_test / p_test (producer variants)",
    ),
    ("services/auth_emails.py", "send_duplicate_attempt_email", "send_email"): (
        2,
        AUTH,
        "wrapper param ← existing_user.is_test",
    ),
    ("services/auth_emails.py", "send_deletion_email", "send_email"): (
        1,
        AUTH,
        "wrapper param ← user.is_test captured before delete",
    ),
    # MEH-2974: the invite itself. There is no `users` row yet — the whole
    # point of the flow — so the only is_test signal available is the
    # BUSINESS's, which is what the caller passes.
    ("services/auth_emails.py", "send_owner_invite_email", "send_email"): (
        1,
        BUS,
        "wrapper param ← producer.is_test (no account exists until acceptance)",
    ),
    # MEH-2974 v3: the 6-digit code that proves the address typed on the
    # acceptance page. Same position as the invite itself — no account yet.
    ("services/auth_emails.py", "send_owner_invite_code_email", "send_email"): (
        1,
        BUS,
        "wrapper param ← producer.is_test (no account exists until acceptance)",
    ),
    # --- auth_notifications ---
    # MEH-2974 v3: tells the admin an invite was accepted.
    (
        "services/auth_notifications.py",
        "notify_admin_owner_invite_accepted",
        "send_text",
    ): (1, BUS, "wrapper param ← producer.is_test"),
    (
        "services/auth_notifications.py",
        "notify_admin_owner_invite_accepted",
        "send_email",
    ): (1, BUS, "same"),
    ("services/auth_notifications.py", "notify_producer_registered", "send_template"): (
        1,
        OWN,
        "wrapper param ← producer.is_test or user.is_test",
    ),
    ("services/auth_notifications.py", "notify_producer_approved", "send_template"): (
        1,
        OWN,
        "wrapper param ← p_test",
    ),
    (
        "services/auth_notifications.py",
        "notify_producer_changes_requested",
        "send_template",
    ): (1, OWN, "wrapper param ← p_test"),
    ("services/auth_notifications.py", "notify_admin_new_recipe", "send_text"): (
        1,
        BUS,
        "wrapper param ← user.is_test or producer.is_test",
    ),
    ("services/auth_notifications.py", "notify_admin_new_recipe", "send_email"): (
        1,
        BUS,
        "same",
    ),
    (
        "services/auth_notifications.py",
        "notify_admin_producer_resubmit",
        "send_template",
    ): (
        1,
        BUS,
        "wrapper param ← producer.is_test",
    ),
    (
        "services/auth_notifications.py",
        "notify_admin_producer_resubmit",
        "send_email",
    ): (1, BUS, "same"),
    (
        "services/auth_notifications.py",
        "notify_admin_producer_review_ready",
        "send_template",
    ): (1, BUS, "wrapper param ← producer.is_test"),
    (
        "services/auth_notifications.py",
        "notify_admin_producer_review_ready",
        "send_email",
    ): (1, BUS, "same"),
    (
        "services/auth_notifications.py",
        "notify_admin_producer_sensitive_edit",
        "send_text",
    ): (1, BUS, "wrapper param ← producer.is_test"),
    (
        "services/auth_notifications.py",
        "notify_admin_producer_sensitive_edit",
        "send_email",
    ): (1, BUS, "same"),
    (
        "services/auth_notifications.py",
        "notify_admin_new_category_request",
        "send_text",
    ): (1, BUS, "wrapper param ← caller user.is_test or its producer.is_test"),
    (
        "services/auth_notifications.py",
        "notify_admin_new_category_request",
        "send_email",
    ): (1, BUS, "same"),
    (
        "services/auth_notifications.py",
        "notify_admin_new_business_suggestion",
        "send_text",
    ): (1, NONE, "a visitor's suggestion — no business row yet"),
    (
        "services/auth_notifications.py",
        "notify_admin_new_business_suggestion",
        "send_email",
    ): (1, NONE, "same"),
    ("services/auth_notifications.py", "notify_admin_new_producer", "send_template"): (
        1,
        BUS,
        "wrapper param ← producer.is_test or user.is_test",
    ),
    ("services/auth_notifications.py", "notify_admin_new_producer", "send_email"): (
        1,
        BUS,
        "same",
    ),
    # --- schedulers / unwired ---
    (
        "services/admin_pending_reminder.py",
        "send_admin_pending_reminder",
        "send_email",
    ): (
        1,
        NONE,
        "aggregate admin digest; test rows are filtered out by the query (MEH-3147)",
    ),
    ("services/auto_reply_watchdog.py", "run_watchdog", "send_template"): (
        1,
        NONE,
        "auto-reply to an inbound WhatsApp sender",
    ),
    ("services/rating_dispatcher.py", "_default_sender", "send_text"): (
        1,
        NONE,
        "unwired (no caller in the app)",
    ),
    ("services/onboarding_followup.py", "send_due_followups", "send_email"): (
        1,
        OWN,
        "p.is_test or user.is_test",
    ),
    ("services/pending_nudge.py", "send_pending_nudges", "send_email"): (
        1,
        OWN,
        "p.is_test or user.is_test",
    ),
    ("services/rescue_digest.py", "_digest_one", "send_template"): (
        1,
        OWN,
        "producer.is_test or owner.is_test",
    ),
    # --- content_notifications ---
    ("services/content_notifications.py", "notify_recipe_approved", "send_email"): (
        1,
        OWN,
        "wrapper param ← producer.is_test",
    ),
    (
        "services/content_notifications.py",
        "notify_recipe_changes_requested",
        "send_email",
    ): (1, OWN, "wrapper param ← producer.is_test"),
    ("services/content_notifications.py", "notify_recipe_rejected", "send_email"): (
        1,
        OWN,
        "wrapper param ← producer.is_test",
    ),
    ("services/content_notifications.py", "notify_kashrut_approved", "send_email"): (
        1,
        OWN,
        "wrapper param ← producer.is_test",
    ),
    ("services/content_notifications.py", "notify_kashrut_rejected", "send_email"): (
        1,
        OWN,
        "wrapper param ← producer.is_test",
    ),
    ("services/content_notifications.py", "notify_owner_new_review", "send_email"): (
        1,
        OWN,
        "wrapper param ← producer.is_test",
    ),
    ("services/content_notifications.py", "notify_reviewer_reply", "send_email"): (
        1,
        CON,
        "wrapper param ← producer.is_test (the business that replied)",
    ),
    # --- delivery waitlist ---
    ("services/delivery_waitlist.py", "notify_cities", "send_email"): (
        1,
        CON,
        "producer.is_test",
    ),
    ("services/delivery_waitlist.py", "send_host_confirmation", "send_email"): (
        1,
        CON,
        "wrapper param ← producer.is_test or current_user.is_test",
    ),
    # --- experiences ---
    ("services/experience_notifications.py", "_send_email", "send_email"): (
        1,
        OWN,
        "wrapper param",
    ),
    (
        "services/experience_notifications.py",
        "notify_admin_new_submission",
        "_send_email",
    ): (1, BUS, "wrapper param ← host_test_cause(host)"),
    ("services/experience_notifications.py", "notify_host_approved", "_send_email"): (
        1,
        OWN,
        "wrapper param ← host_test_cause(host)",
    ),
    (
        "services/experience_notifications.py",
        "notify_host_changes_requested",
        "_send_email",
    ): (1, OWN, "wrapper param ← host_test_cause(host)"),
    ("services/experience_notifications.py", "notify_host_rejected", "_send_email"): (
        1,
        OWN,
        "wrapper param ← host_test_cause(host)",
    ),
    # --- group buys ---
    ("services/group_buy_notifications.py", "_send_email", "send_email"): (
        1,
        OWN,
        "wrapper param",
    ),
    (
        "services/group_buy_notifications.py",
        "notify_producer_funded",
        "_send_email",
    ): (1, OWN, "wrapper param ← gb.producer.is_test"),
    (
        "services/group_buy_notifications.py",
        "notify_participant_funded",
        "_send_email",
    ): (1, CON, "wrapper param ← gb.producer.is_test"),
    (
        "services/group_buy_notifications.py",
        "notify_participant_cancelled",
        "_send_email",
    ): (1, CON, "wrapper param ← gb.producer.is_test"),
    (
        "services/group_buy_notifications.py",
        "notify_participant_cancelled_delisted",
        "_send_email",
    ): (1, CON, "wrapper param ← producer.is_test"),
    # --- registrations / rescue / submission ---
    (
        "services/registration_emails.py",
        "send_visitor_confirmation",
        "send_email",
    ): (1, CON, "wrapper param ← producer.is_test / host_test_cause(host)"),
    (
        "services/registration_emails.py",
        "send_owner_new_registration",
        "send_email",
    ): (1, OWN, "wrapper param ← producer.is_test / host_test_cause(host)"),
    ("services/registration_emails.py", "send_owner_cancellation", "send_email"): (
        1,
        OWN,
        "wrapper param ← owner producer.is_test / host_test_cause(host)",
    ),
    ("services/rescue_emails.py", "send_reservation_email", "send_email"): (
        1,
        CON,
        "wrapper param ← producer.is_test or user.is_test",
    ),
    ("services/rescue_emails.py", "send_cancel_email", "send_email"): (
        1,
        CON,
        "wrapper param ← producer.is_test or user.is_test",
    ),
    ("services/rescue_emails.py", "send_business_cancel_email", "send_email"): (
        1,
        CON,
        "wrapper param ← producer.is_test",
    ),
    (
        "services/submission_confirmation.py",
        "send_submission_confirmation",
        "send_email",
    ): (1, OWN, "wrapper param ← producer.is_test or user.is_test"),
}


def test_inventory_classifier_self_test_on_synthetic_source():
    src = """
from app.services.auth_emails import send_welcome_email as _welcome

def ok(producer):
    send_email("a", "s", "b", test_cause=producer.is_test)

def constant():
    send_email("a", "s", "b", test_cause=False)

def missing():
    send_text("+1", "b")

def wrapper(to, test_cause=False):
    send_template(to, T(), test_cause=test_cause)

def outer_wrapper(x, test_cause=False):
    wrapper(x, test_cause=test_cause)

def calls_wrapper_bare():
    wrapper("+1")

def calls_outer_wrapper_constant():
    outer_wrapper("+1", test_cause=True)

def queues_wrapper_ok(bt, user):
    bt.add_task(wrapper, "+1", test_cause=user.is_test)

def queues_wrapper_bare(bt):
    bt.add_task(wrapper, "+1")

def _welcome_wrapper(e, test_cause=False):
    send_email(e, "s", "b", test_cause=test_cause)

def welcome(e, test_cause=False):
    _welcome_wrapper(e, test_cause=test_cause)

def calls_alias(bt):
    bt.add_task(_welcome, "e")

def dispatch(e, test_cause=False):
    notify = wrapper if e else outer_wrapper
    notify(e, test_cause=test_cause)

def calls_dispatch_bare():
    dispatch("x")

def queues_send_by_value_bare(bt):
    bt.add_task(send_template, "+1", T())

def queues_send_by_value_ok(bt, producer):
    bt.add_task(send_email, "a", "s", "b", test_cause=producer.is_test)
"""
    sites = collect_sites(src, "syn.py")
    assert [(s.func, s.callee) for s in sites] == [
        ("ok", "send_email"),
        ("constant", "send_email"),
        ("missing", "send_text"),
        ("wrapper", "send_template"),
        ("_welcome_wrapper", "send_email"),
        ("queues_send_by_value_bare", "add_task(send_template)"),
        ("queues_send_by_value_ok", "add_task(send_email)"),
    ]
    pinned = {
        ("syn.py", "ok", "send_email"): (1, BUS, ""),
        ("syn.py", "constant", "send_email"): (1, BUS, ""),
        ("syn.py", "missing", "send_text"): (1, OWN, ""),
        ("syn.py", "wrapper", "send_template"): (1, OWN, ""),
        ("syn.py", "_welcome_wrapper", "send_email"): (1, AUTH, ""),
        ("syn.py", "queues_send_by_value_bare", "add_task(send_template)"): (
            1,
            OWN,
            "",
        ),
        ("syn.py", "queues_send_by_value_ok", "add_task(send_email)"): (1, OWN, ""),
    }
    v = site_violations(sites, pinned)
    assert len(v) == 3, v
    assert "constant" in v[0] and "False" in v[0]
    assert "missing" in v[1] and "no test_cause" in v[1]
    # A send function passed BY VALUE to add_task without the kwarg (MEH-2952
    # review): seen as a site, red for the missing flag.
    assert "queues_send_by_value_bare" in v[2] and "no test_cause" in v[2], v

    # A pinned group-«none» site must NOT carry the flag.
    pinned_none = dict(pinned)
    pinned_none[("syn.py", "ok", "send_email")] = (1, NONE, "")
    assert any("group none" in x for x in site_violations(sites, pinned_none))

    # Count drift and an unpinned site are both red.
    drift = dict(pinned)
    drift[("syn.py", "ok", "send_email")] = (2, BUS, "")
    del drift[("syn.py", "missing", "send_text")]
    dv = site_violations(sites, drift)
    assert any("count changed" in x for x in dv), dv
    assert any("NEW send site" in x for x in dv), dv

    w = wrapper_violations({"syn.py": src})
    assert sorted(x.split(" ", 1)[1] for x in w) == [
        "calls_dispatch_bare → dispatch without test_cause=",
        "calls_outer_wrapper_constant → outer_wrapper without test_cause=",
        "calls_wrapper_bare → wrapper without test_cause=",
        "queues_wrapper_bare → wrapper without test_cause=",
    ], w
    # The alias `_welcome` names send_welcome_email, which is not a wrapper in
    # this synthetic module — so calls_alias is correctly not flagged.


def test_inventory_classifier_anchored_to_a_real_repo_file():
    """Run against routers/admin.py as it is on disk: the approval site and the
    admin-ping wrapper must be found, flagged with a non-constant value."""
    rel = "routers/admin.py"
    src = (APP_DIR / rel).read_text(encoding="utf-8")
    sites = collect_sites(src, rel)
    approve = [s for s in sites if s.func == "approve_producer"]
    assert {s.callee for s in approve} == {"_send_notification_email", "_send_whatsapp"}
    for s in approve:
        assert s.flag is not None and not isinstance(s.flag, ast.Constant), s
    inner = [s for s in sites if s.func == "_send_whatsapp"]
    assert len(inner) == 1 and inner[0].callee == "send_text"
    assert isinstance(inner[0].flag, ast.Name) and inner[0].flag.id == FLAG
    # And the wrapper check sees approve's forwarded notify call as held.
    assert wrapper_violations({rel: src}) == []


def test_inventory_every_send_site_is_pinned_and_flagged():
    sources = _app_sources()
    sites = [s for rel, src in sources.items() for s in collect_sites(src, rel)]
    assert len(sites) > 50, "the walk found almost nothing — the probe is broken"
    violations = site_violations(sites, PINNED)
    assert violations == [], "\n".join(violations)


def test_inventory_every_wrapper_call_passes_the_flag():
    violations = wrapper_violations(_app_sources())
    assert violations == [], "\n".join(violations)
