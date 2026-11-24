"""Shared helpers, constants and fixtures of `tests/test_meh2952_send_layer.py`.

Moved here verbatim by the MEH-3540 mechanical split. Not collected by
pytest (no `test_` prefix); `tests/test_meh2952_send_layer.py` is the module pytest runs.
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
# 2. production-profile guard (required by the product owner)
# ---------------------------------------------------------------------------


@pytest.fixture
def production(monkeypatch, transport):
    monkeypatch.setattr(settings, "env", "production")
    monkeypatch.setattr(settings, "railway_environment", "production")
    monkeypatch.setattr(settings, "otp_test_numbers", OTP_NUMBER)
    monkeypatch.setattr(settings, "otp_test_code", OTP_CODE)
    return transport


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
            "claim_link_requested",
            lambda tc: an.notify_admin_claim_link_requested("x", "c", test_cause=tc),
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


def _badged(db, *, is_test: bool, phone: str):
    producer = make_producer(db, name="חוות בדיקה" if is_test else "חוות אמת")
    producer.phone = phone
    producer.is_test = is_test
    producer.kashrut_badges = ["badatz"]
    producer.kashrut_expires_at = utc_now() + timedelta(days=5)
    db.commit()
    return producer


# ---------------------------------------------------------------------------
# 4. inventory guard
# ---------------------------------------------------------------------------

SEND_NAMES = frozenset(
    {
        "send_email",
        "send_text",
        "send_template",
        # MEH-3296: the outcome-returning twins the order outbox uses.
        "send_template_result",
        "send_email_result",
        "_send_email",
        "_send_notification_email",
        # MEH-3535: queueing an email is sending it, later. Same flag rule.
        "enqueue_email",
        "_queue_mail",
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
    # MEH-3535: queued inside _persist_approval's before_commit.
    (
        "routers/admin_decisions.py",
        "_queue_approved_email",
        "_send_notification_email",
    ): (
        1,
        OWN,
        "producer.is_test or owner.is_test (test_cause)",
    ),
    ("routers/admin_decisions.py", "reject_producer", "_send_notification_email"): (
        1,
        OWN,
        "p_test",
    ),
    (
        "routers/admin_decisions.py",
        "request_producer_changes",
        "_send_notification_email",
    ): (
        1,
        OWN,
        "p_test",
    ),
    ("routers/admin_decisions.py", "_send_notification_email", "enqueue_email"): (
        1,
        OWN,
        "wrapper param (MEH-3535: queued, sent by the outbox)",
    ),
    # MEH-3589: no admin WhatsApp echo of her own decisions (email only).
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
    ("routers/marketing.py", "_send_newsletter_confirm", "send_email"): (
        1,
        NONE,
        "newsletter double opt-in confirm link (MEH-3300) — no business or account",
    ),
    ("routers/marketing.py", "_send_contact_email", "send_email"): (
        1,
        NONE,
        "public contact form",
    ),
    # --- MEH-3535: the email outbox ---
    ("routers/registrations.py", "register_for_event", "_queue_mail"): (
        2,
        CON,
        "producer.is_test (visitor + owner emails)",
    ),
    ("routers/registrations.py", "register_for_experience", "_queue_mail"): (
        2,
        CON,
        "host_test_cause(host) (visitor + owner emails)",
    ),
    ("routers/registrations.py", "_queue_mail", "enqueue_email"): (
        1,
        CON,
        "wrapper param",
    ),
    ("services/email_outbox.py", "_handle", "send_email_result"): (
        1,
        NONE,
        "a row caused by a test row is never queued (enqueue_email, MEH-2952)",
    ),
    # --- MEH-3296: the on-site order outbox (business and buyer alike) ---
    ("services/product_order_outbox.py", "_wa.send", "send_template_result"): (
        1,
        BUS,
        "producer.is_test or owner.is_test or buyer.is_test (_compose)",
    ),
    ("services/product_order_outbox.py", "_mail.send", "send_email_result"): (
        1,
        OWN,
        "producer.is_test or owner.is_test or buyer.is_test (_compose)",
    ),
    ("routers/producer_me_review.py", "_send_whatsapp_otp", "send_template"): (
        1,
        OWN,
        "wrapper param ← producer.is_test or user.is_test",
    ),
    ("routers/report_info.py", "report_producer_info", "send_email"): (
        1,
        BUS,
        "producer.is_test — admin mail about a business page",
    ),
    ("routers/report_info.py", "report_review", "send_email"): (
        1,
        BUS,
        "producer.is_test — admin mail about a reported review (MEH-3260)",
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
    # MEH-3256: the same acceptance for a signed-in existing account — same
    # mail, same flag (producer.is_test or the locked user's is_test).
    (
        "routers/producer_owner_invite_existing.py",
        "accept_owner_invite_existing",
        "add_task(send_email)",
    ): (
        1,
        OWN,
        "p_test — producer.is_test or user.is_test, captured pre-commit",
    ),
    # MEH-3256 (D9): «ניתוק בעלים» tells the former owner. Its one caller,
    # detach_owner, passes producer.is_test or the owner's is_test (the
    # wrapper-caller walk below holds it to passing test_cause).
    ("services/owner_detach.py", "send_owner_detached_email", "send_email"): (
        1,
        OWN,
        "wrapper param ← detach_owner's test_cause",
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
    # MEH-3104: the notice to the OLD address after an email change.
    ("services/auth_emails.py", "send_email_changed_notice", "send_email"): (
        1,
        AUTH,
        "wrapper param ← user.is_test (users_me._queue_email_change_mails)",
    ),
    # MEH-3591: «הסיסמה בחשבון שונתה» after a change or a reset.
    ("services/auth_emails.py", "send_password_changed_notice", "send_email"): (
        1,
        AUTH,
        "wrapper param ← user.is_test (users_me.change_password, auth.reset_password)",
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
    ("services/auth_notifications.py", "notify_admin_new_recipe", "send_email"): (
        1,
        BUS,
        "same",
    ),
    # MEH-3122: the owner of a draft asked for a new claim link.
    (
        "services/auth_notifications.py",
        "notify_admin_claim_link_requested",
        "send_email",
    ): (1, BUS, "same"),
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
        "send_email",
    ): (1, BUS, "same"),
    (
        "services/auth_notifications.py",
        "notify_admin_new_category_request",
        "send_email",
    ): (1, BUS, "same"),
    (
        "services/auth_notifications.py",
        "notify_admin_new_business_suggestion",
        "send_email",
    ): (1, NONE, "same"),
    # MEH-3410: an owner claimed a draft — admin email (MEH-3589: no WhatsApp).
    ("services/auth_notifications.py", "notify_admin_draft_claimed", "send_email"): (
        1,
        BUS,
        "same",
    ),
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
    (
        "services/billing_start_signal.py",
        "send_billing_start_signal",
        "send_email",
    ): (
        1,
        NONE,
        "aggregate admin email; billing_summary excludes test businesses (MEH-3413)",
    ),
    ("services/auto_reply_watchdog.py", "run_watchdog", "send_template"): (
        1,
        NONE,
        "auto-reply to an inbound WhatsApp sender",
    ),
    # MEH-3332: an ops alert to the admin about an overdue background job —
    # about the system, not about any business or user, so no test cause.
    ("services/job_staleness.py", "_alert", "send_email"): (
        1,
        NONE,
        "ops alert to the admin; no business or user row behind it",
    ),
    ("services/onboarding_followup.py", "send_due_followups", "send_email"): (
        1,
        OWN,
        "p.is_test or user.is_test",
    ),
    (
        "services/approved_edit_moderation.py",
        "notify_admin_content_edit",
        "send_email",
    ): (1, OWN, "same"),
    ("services/page_freshness.py", "send_freshness_emails", "send_email"): (
        1,
        OWN,
        "cand.test_business or owner.is_test",
    ),
    (
        "services/page_freshness_digest.py",
        "send_stale_digest",
        "send_email",
    ): (
        1,
        NONE,
        "aggregate admin digest; test rows are filtered out by the query",
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
    # MEH-3079: the weekly owner summary — mail to the business's owner about
    # her own page, flagged by either row (read up front, before the claim).
    ("services/weekly_owner_summary.py", "send_weekly_summaries", "send_email"): (
        1,
        OWN,
        "producer_is_test or owner_is_test",
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
    ("services/delivery_waitlist.py", "_notify_cities", "send_email"): (
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
    # MEH-3591: the join confirmation. A test business's group is 404 to the
    # public, so the joiner's own flag is the one that can be set here.
    (
        "services/group_buy_notifications.py",
        "notify_participant_joined",
        "_send_email",
    ): (1, CON, "wrapper param ← user.is_test (group_buys._confirm_join)"),
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
    (
        "services/group_buy_notifications.py",
        "notify_participant_expired",
        "_send_email",
    ): (1, CON, "wrapper param ← gb.producer.is_test (MEH-3287)"),
    (
        "services/group_buy_notifications.py",
        "notify_producer_late_joiner",
        "_send_email",
    ): (1, OWN, "wrapper param ← gb.producer.is_test (MEH-3592)"),
    (
        "services/group_buy_notifications.py",
        "notify_waitlist_place",
        "_send_email",
    ): (1, CON, "wrapper param ← gb.producer.is_test (MEH-3592)"),
    (
        "services/group_buy_notifications.py",
        "notify_pickup_changed",
        "_send_email",
    ): (1, CON, "wrapper param ← gb.producer.is_test (MEH-3597)"),
    (
        "services/group_buy_notifications.py",
        "notify_pickup_reminder",
        "_send_email",
    ): (1, CON, "wrapper param ← gb.producer.is_test (MEH-3610)"),
    (
        "services/group_buy_notifications.py",
        "notify_allergens_changed",
        "_send_email",
    ): (1, CON, "wrapper param ← gb.producer.is_test (MEH-3610)"),
    (
        "services/rescue_business_emails.py",
        "send_business_reservation_email",
        "send_email",
    ): (1, OWN, "wrapper param ← producer.is_test (MEH-3313)"),
    (
        "services/group_buy_goal_flap.py",
        "send_below_goal_emails",
        "send_email",
    ): (1, CON, "wrapper param ← gb.producer.is_test (MEH-3311)"),
    (
        "services/registration_emails.py",
        "send_registration_reminder",
        "send_email",
    ): (1, CON, "wrapper param ← is_test_item(item) (MEH-3312)"),
    (
        "services/registration_emails.py",
        "send_waitlist_confirmation",
        "send_email",
    ): (1, CON, "wrapper param ← producer.is_test / host_test_cause(host) (MEH-3314)"),
    (
        "services/registration_emails.py",
        "send_waitlist_offer",
        "send_email",
    ): (1, CON, "wrapper param ← producer.is_test (MEH-3314)"),
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
    # MEH-3223: one email to the admin per new report.
    ("services/report_notifications.py", "notify_admin_new_report", "send_email"): (
        1,
        BUS,
        "wrapper param ← producer.is_test",
    ),
    # MEH-3226 (D4): the buyer's mail on each no-show.
    ("services/rescue_no_show.py", "send_no_show_email", "send_email"): (
        1,
        CON,
        "wrapper param ← producer.is_test or user.is_test",
    ),
    # MEH-3735: the buyer's mail on each group-buy no-show.
    ("services/group_buy_no_show.py", "send_group_buy_no_show_email", "send_email"): (
        1,
        CON,
        "wrapper param ← producer.is_test or user.is_test",
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
    # MEH-3227 (D1): the two «הסל ב… בוטל» mails share one sender.
    ("services/rescue_emails.py", "_send_bag_cancelled", "send_email"): (
        1,
        CON,
        "wrapper param ← producer.is_test",
    ),
    ("services/registration_emails.py", "_send_lines", "send_email"): (
        1,
        CON,
        "wrapper param ← producer.is_test / host_test_cause(host)",
    ),
    ("services/registration_emails.py", "send_registrant_moved", "send_email"): (
        1,
        CON,
        "wrapper param ← producer.is_test / host_test_cause(host)",
    ),
    ("services/booking_cancellations.py", "send_owner_delisted", "send_email"): (
        1,
        OWN,
        "wrapper param ← producer.is_test",
    ),
    (
        "services/submission_confirmation.py",
        "send_submission_confirmation",
        "send_email",
    ): (1, OWN, "wrapper param ← producer.is_test or user.is_test"),
}
