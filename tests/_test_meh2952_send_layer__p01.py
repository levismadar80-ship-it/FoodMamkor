"""Part 1 of 1 of `tests/test_meh2952_send_layer.py`: test_send_email_with_test_cause_never_reaches_resend, test_send_email_control_without_test_cause_does_reach_resend, test_send_email_test_cause_is_checked_before_every_other_check, test_whatsapp_with_test_cause_never_posts, test_whatsapp_control_without_test_cause_does_post, test_production_profile_send_layer_refuses_a_test_caused_whatsapp, test_production_profile_admin_approve_of_a_test_business_sends_nothing, test_production_profile_admin_approve_of_an_ordinary_business_sends, test_production_profile_otp_for_a_test_business_on_the_test_list_sends_nothing, test_production_profile_otp_control_for_an_ordinary_business_sends, test_group_admin_notified_submit_for_review, test_group_owner_recipe_approval, test_group_consumer_reviewer_hears_the_reply, test_group_own_auth_forgot_password, test_group_own_auth_account_deletion_reads_the_flag_before_the_row_goes, test_test_consumer_reviewing_a_real_business_sends_no_owner_mail, test_test_owner_replying_on_a_real_business_sends_no_reviewer_mail, test_a_test_row_notifier_logs_nothing_at_warning_or_above, test_control_the_same_notifier_does_log_loud_when_it_really_fails, test_rescue_digest_excludes_a_test_business, test_kashrut_reminders_skip_a_test_business_and_count_no_failure, test_inventory_classifier_self_test_on_synthetic_source, test_inventory_classifier_anchored_to_a_real_repo_file, test_inventory_every_send_site_is_pinned_and_flagged, test_inventory_every_wrapper_call_passes_the_flag.

Moved here verbatim by the MEH-3540 mechanical split. Not collected
directly (no `test_` prefix): `tests/test_meh2952_send_layer.py` imports these tests, so
their node ids stay `tests/test_meh2952_send_layer.py::...`. Run them with
`pytest tests/test_meh2952_send_layer.py` (add `-k <ClassName>` to narrow).
"""

from __future__ import annotations
from app.config import settings
from app.models.models import ProducerRecipe
from app.models.models import ProducerReview
from app.models.models import ProducerWhatsAppClick
from app.services import email as email_module
from app.services import whatsapp as whatsapp_module
from app.services.whatsapp_templates import OtpCodeV1
from app.services.whatsapp_templates import ProducerApprovedV1
from tests.conftest import auth_header
from tests.conftest import make_producer
from tests.conftest import make_submit_ready_producer
from tests.conftest import make_user
import ast
import logging
import pytest
from _test_meh2952_send_layer__common import ADMIN_EMAIL  # noqa: F401
from _test_meh2952_send_layer__common import ADMIN_WA  # noqa: F401
from _test_meh2952_send_layer__common import APP_DIR  # noqa: F401
from _test_meh2952_send_layer__common import AUTH  # noqa: F401
from _test_meh2952_send_layer__common import BUS  # noqa: F401
from _test_meh2952_send_layer__common import FLAG  # noqa: F401
from _test_meh2952_send_layer__common import NONE  # noqa: F401
from _test_meh2952_send_layer__common import OTP_CODE  # noqa: F401
from _test_meh2952_send_layer__common import OTP_NUMBER  # noqa: F401
from _test_meh2952_send_layer__common import OWN  # noqa: F401
from _test_meh2952_send_layer__common import PINNED  # noqa: F401
from _test_meh2952_send_layer__common import REVIEW_BODY  # noqa: F401
from _test_meh2952_send_layer__common import _app_sources  # noqa: F401
from _test_meh2952_send_layer__common import _approvable  # noqa: F401
from _test_meh2952_send_layer__common import _badged  # noqa: F401
from _test_meh2952_send_layer__common import _due_digest_offer  # noqa: F401
from _test_meh2952_send_layer__common import _loud  # noqa: F401
from _test_meh2952_send_layer__common import _notifier_calls  # noqa: F401
from _test_meh2952_send_layer__common import _real_business_with_owner  # noqa: F401
from _test_meh2952_send_layer__common import _to  # noqa: F401
from _test_meh2952_send_layer__common import _wa_to  # noqa: F401
from _test_meh2952_send_layer__common import collect_sites  # noqa: F401
from _test_meh2952_send_layer__common import production  # noqa: F401
from _test_meh2952_send_layer__common import site_violations  # noqa: F401
from _test_meh2952_send_layer__common import transport  # noqa: F401
from _test_meh2952_send_layer__common import wrapper_violations  # noqa: F401

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
    # The owner's approval template only — MEH-3589 dropped the admin's echo of
    # her own decision.
    assert _wa_to(production.whatsapp) == ["972521234567"]


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
    """POST /auth/me/delete: `is_test` is captured BEFORE the row is deleted."""
    user = make_user(db, email="leaving@sample.co.il")
    user.is_test = is_test
    db.commit()

    r = client.post("/auth/me/delete", json={"password": "Zx7Yp9Mq2Lr4"}, headers=auth_header(user))

    assert r.status_code == 200, r.text
    assert _to(transport.emails) == ([] if is_test else ["leaving@sample.co.il"])


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
    """Run against real files on disk: the approval site (routers/admin_decisions.py)
    and the admin-ping wrapper (services/admin_whatsapp.py) must be found, flagged
    with a non-constant value."""
    rel = "routers/admin_decisions.py"
    src = (APP_DIR / rel).read_text(encoding="utf-8")
    sites = collect_sites(src, rel)
    approve = [s for s in sites if s.func == "approve_producer"]
    # MEH-3589: the admin's own-decision WhatsApp echo is gone; only the owner mail.
    assert {s.callee for s in approve} == {"_send_notification_email"}
    for s in approve:
        assert s.flag is not None and not isinstance(s.flag, ast.Constant), s
    # The admin-ping wrapper now lives in services/admin_whatsapp.py.
    helper_rel = "services/admin_whatsapp.py"
    helper = collect_sites((APP_DIR / helper_rel).read_text(encoding="utf-8"), helper_rel)
    inner = [s for s in helper if s.func == "ping_admin"]
    assert len(inner) == 1 and inner[0].callee == "send_template"
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
