"""MEH-662 — shared `read_vacation_state` helper.

Extracts the str→bool/date conversion + corrupt-state defense that
previously lived (duplicated) in both `admin_extra.py:402` and
`auto_reply_watchdog.py:75`. PR2b adversarial review finding A40.

The PR2a + PR2b end-to-end tests in tests/test_meh_509_pr2a_vacation.py
+ tests/test_meh_509_pr2b_watchdog.py already exercise the corruption-
defense paths through their consumers. This file adds direct unit
coverage of the helper itself so a future change to the str↔bool/date
contract surfaces here first, not via a downstream consumer regression.
"""
from __future__ import annotations

from datetime import date

from app.models import AdminSetting
from app.services.vacation_state import read_vacation_state


def test_helper_default_when_unset(db):
    """Empty admin_settings table → (False, None)."""
    assert read_vacation_state(db) == (False, None)


def test_helper_clean_state(db):
    """active="true" + valid ISO date → (True, parsed_date)."""
    db.add(AdminSetting(key="vacation_mode_active", value="true"))
    db.add(AdminSetting(key="vacation_return_date", value="2026-06-15"))
    db.commit()
    assert read_vacation_state(db) == (True, date(2026, 6, 15))


def test_helper_inactive_with_stale_date_returns_no_date(db):
    """active="false" but a stale return_date row exists →
    (False, None). Per PR2a's POST-deactivate-clears-date contract,
    this shouldn't happen via the typed endpoint, but the generic
    PUT /admin/settings allows it. Helper must silently drop the
    stale date."""
    db.add(AdminSetting(key="vacation_mode_active", value="false"))
    db.add(AdminSetting(key="vacation_return_date", value="2026-06-15"))
    db.commit()
    assert read_vacation_state(db) == (False, None)


def test_helper_handles_corrupt_inconsistent_state(db):
    """active="true" + empty return_date → (False, None) coerce.
    Reachable via the generic PUT /admin/settings (writes either key
    independently via the DEFAULT_SETTINGS allowlist). The corrupt
    state must NEVER reach the consumer as `active=True, date=None`."""
    db.add(AdminSetting(key="vacation_mode_active", value="true"))
    db.add(AdminSetting(key="vacation_return_date", value=""))
    db.commit()
    assert read_vacation_state(db) == (False, None)


def test_helper_handles_corrupt_invalid_iso_date(db):
    """active="true" + non-ISO date string → (False, None) coerce.
    `date.fromisoformat` raises ValueError on garbage input; the
    helper must catch + coerce rather than propagate."""
    db.add(AdminSetting(key="vacation_mode_active", value="true"))
    db.add(AdminSetting(key="vacation_return_date", value="not-an-iso-date"))
    db.commit()
    assert read_vacation_state(db) == (False, None)


def test_helper_case_insensitive_true(db):
    """vacation_mode_active is compared `.lower() == "true"`. Anything
    else — `"True"`, `"TRUE"`, `"1"`, garbage — should be active=False."""
    db.add(AdminSetting(key="vacation_mode_active", value="TRUE"))
    db.add(AdminSetting(key="vacation_return_date", value="2026-06-15"))
    db.commit()
    # "TRUE".lower() == "true" → active
    assert read_vacation_state(db) == (True, date(2026, 6, 15))


def test_helper_non_true_string_is_inactive(db):
    """vacation_mode_active="1" or "yes" or "garbage" → inactive."""
    db.add(AdminSetting(key="vacation_mode_active", value="1"))
    db.add(AdminSetting(key="vacation_return_date", value="2026-06-15"))
    db.commit()
    assert read_vacation_state(db) == (False, None)
