"""MEH-3147: the admin hears about a business waiting for approval.

Part 1 — the three admin pings send the approved Meta template
`admin_business_pending_v1` (free text reached the admin only inside Meta's
24h window). Part 2 — a morning reminder email lists businesses waiting
2+ business days; nothing is sent when none is.

The clock is frozen through the `now=` argument (testing.md, MEH-2290): the
Wednesday below is fixed, so the counts cannot drift with the runner's hour.
"""

from datetime import datetime, timezone
from unittest.mock import patch

import pytest

from app.services import admin_pending_reminder as reminder
from app.services import auth_notifications as an
from app.services.whatsapp_templates import AdminBusinessPendingV1
from tests.conftest import make_producer, make_user

ADMIN_WA = "+972500000000"
ADMIN_MAIL = "admin@example.com"
# Wednesday 18/11/2026 08:00 Israel.
NOW = datetime(2026, 11, 18, 6, 0, tzinfo=timezone.utc)
SUN = datetime(2026, 11, 15, 9, 0, tzinfo=timezone.utc)  # 3 business days
MON = datetime(2026, 11, 16, 9, 0, tzinfo=timezone.utc)  # 2 business days
TUE = datetime(2026, 11, 17, 9, 0, tzinfo=timezone.utc)  # 1 business day


@pytest.fixture
def admin_channels(monkeypatch):
    monkeypatch.setattr(an.settings, "admin_whatsapp_to", ADMIN_WA)
    monkeypatch.setattr(an.settings, "admin_email", ADMIN_MAIL)


# --- Part 1: template, not free text -------------------------------------


@pytest.mark.parametrize(
    "call",
    [
        lambda: an.notify_admin_new_producer("מאפיית\nדנה", "פרדס חנה"),
        lambda: an.notify_admin_producer_review_ready("מאפיית\nדנה", "פרדס חנה"),
        lambda: an.notify_admin_producer_resubmit("מאפיית\nדנה", "פרדס חנה", 1),
    ],
    ids=["new_producer", "review_ready", "resubmit"],
)
def test_admin_ping_sends_template_not_text(admin_channels, call):
    with (
        patch.object(an, "send_template", return_value=True) as tmpl,
        patch.object(an, "send_text") as text,
        patch.object(an, "send_email") as mail,
    ):
        call()
    text.assert_not_called()
    tmpl.assert_called_once()
    to, template = tmpl.call_args.args
    assert to == ADMIN_WA
    assert template == AdminBusinessPendingV1(
        producer_name="מאפיית דנה", city="פרדס חנה"
    )
    mail.assert_called_once()  # the email is unchanged and still goes


@pytest.mark.parametrize(
    "call",
    [
        lambda: an.notify_admin_new_producer("משק", None),
        lambda: an.notify_admin_producer_review_ready("משק", None),
        lambda: an.notify_admin_producer_resubmit("משק", None),
    ],
)
def test_empty_city_reads_not_stated(admin_channels, call):
    with (
        patch.object(an, "send_template", return_value=True) as tmpl,
        patch.object(an, "send_email"),
    ):
        call()
    assert tmpl.call_args.args[1].city == "לא צוין"


def test_new_producer_whatsapp_raise_does_not_skip_email(admin_channels):
    with (
        patch.object(an, "send_template", side_effect=RuntimeError("meta down")),
        patch.object(an, "send_email") as mail,
    ):
        an.notify_admin_new_producer("משק", "חדרה")
    mail.assert_called_once()


def test_no_admin_number_sends_no_whatsapp(monkeypatch):
    monkeypatch.setattr(an.settings, "admin_whatsapp_to", "")
    monkeypatch.setattr(an.settings, "admin_email", ADMIN_MAIL)
    with (
        patch.object(an, "send_template") as tmpl,
        patch.object(an, "send_email"),
    ):
        an.notify_admin_new_producer("משק", "חדרה")
    tmpl.assert_not_called()


def test_template_components_are_two_body_params():
    comps = AdminBusinessPendingV1(producer_name="א", city="ב").to_components()
    assert comps == [
        {
            "type": "body",
            "parameters": [
                {"type": "text", "text": "א"},
                {"type": "text", "text": "ב"},
            ],
        }
    ]
    assert AdminBusinessPendingV1.name == "admin_business_pending_v1"


# --- Part 2: morning reminder email --------------------------------------


def _pending(db, name, submitted, *, city="חדרה", resubmitted=None):
    p = make_producer(db, name=name, city=city, status="pending")
    p.submitted_for_review_at = submitted
    p.resubmitted_at = resubmitted
    db.commit()
    return p


def _send(db, monkeypatch):
    monkeypatch.setattr(reminder.settings, "admin_email", ADMIN_MAIL)
    with patch.object(reminder, "send_email") as mail:
        listed = reminder.send_admin_pending_reminder(db, now=NOW)
    return listed, mail


def test_zero_overdue_sends_nothing(db, monkeypatch):
    _pending(db, "רק אתמול", TUE)  # 1 business day — under the threshold
    listed, mail = _send(db, monkeypatch)
    assert listed == 0
    mail.assert_not_called()


def test_one_overdue_singular_subject(db, monkeypatch):
    _pending(db, "משק הזית", MON, city="נתניה")
    _pending(db, "רק אתמול", TUE)
    listed, mail = _send(db, monkeypatch)
    assert listed == 1
    to, subject, body = mail.call_args.args
    assert to == ADMIN_MAIL
    assert subject == "מהמקור - בית עסק אחד מחכה לאישור יותר מיומיים"
    assert "- משק הזית (נתניה) — 2 ימי עסקים" in body
    assert "רק אתמול" not in body
    assert body.startswith("בתי העסק האלה מחכים לאישור 2 ימי עסקים או יותר:\n")
    assert "\n\nהבטחנו להם תשובה עד 3 ימי עסקים.\n" in body
    assert body.endswith(
        "לבדיקה ולאישור: " + reminder.settings.frontend_url + "/admin/producers"
    )


def test_many_overdue_plural_subject_oldest_first(db, monkeypatch):
    _pending(db, "שני", MON)
    _pending(db, "ראשון", SUN, city=None)
    listed, mail = _send(db, monkeypatch)
    assert listed == 2
    _, subject, body = mail.call_args.args
    assert subject == "מהמקור - 2 בתי עסק מחכים לאישור יותר מיומיים"
    assert body.index("- ראשון (לא צוין) — 3 ימי עסקים") < body.index(
        "- שני (חדרה) — 2 ימי עסקים"
    )


def test_resubmission_restarts_the_clock(db, monkeypatch):
    # First submitted Sunday, resubmitted Tuesday → 1 day, not 3 (MEH-2869).
    _pending(db, "חזרה", SUN, resubmitted=TUE)
    listed, mail = _send(db, monkeypatch)
    assert listed == 0
    mail.assert_not_called()


def test_non_pending_and_test_rows_are_ignored(db, monkeypatch):
    approved = make_producer(db, name="מאושר", status="approved")
    approved.submitted_for_review_at = SUN
    test_row = _pending(db, "בדיקה", SUN)
    test_row.is_test = True
    test_owner_row = _pending(db, "בעלת בדיקה", SUN)
    owner = make_user(db, role="producer")
    owner.producer_id = test_owner_row.id
    owner.is_test = True
    db.commit()
    listed, mail = _send(db, monkeypatch)
    assert listed == 0
    mail.assert_not_called()


def test_no_admin_email_skips(db, monkeypatch):
    _pending(db, "משק", SUN)
    monkeypatch.setattr(reminder.settings, "admin_email", "")
    with patch.object(reminder, "send_email") as mail:
        assert reminder.send_admin_pending_reminder(db, now=NOW) == 0
    mail.assert_not_called()


@pytest.mark.parametrize(
    "call",
    [
        lambda: an.notify_admin_new_producer("   ", "  "),
        lambda: an.notify_admin_producer_review_ready("   ", "  "),
        lambda: an.notify_admin_producer_resubmit("   ", "  "),
    ],
)
def test_blank_params_never_reach_meta_empty(admin_channels, call):
    """Meta rejects an empty template parameter — whitespace falls back."""
    with (
        patch.object(an, "send_template", return_value=True) as tmpl,
        patch.object(an, "send_email"),
    ):
        call()
    template = tmpl.call_args.args[1]
    assert template.producer_name == "ללא שם"
    assert template.city == "לא צוין"


@pytest.mark.parametrize(
    "call",
    [
        lambda: an.notify_admin_new_producer("משק", "חדרה", test_cause=True),
        lambda: an.notify_admin_producer_review_ready("משק", "חדרה", test_cause=True),
        lambda: an.notify_admin_producer_resubmit("משק", "חדרה", test_cause=True),
    ],
)
def test_test_cause_sends_nothing(admin_channels, call):
    with (
        patch.object(an, "send_template") as tmpl,
        patch.object(an, "send_email") as mail,
    ):
        call()
    tmpl.assert_not_called()
    mail.assert_not_called()
