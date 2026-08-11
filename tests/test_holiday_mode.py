"""MEH-247 — public /holiday-mode endpoint contract.

The endpoint must read the same admin_settings keys that /admin/settings
writes (`holiday_override_enabled`, `holiday_override_key`) and must return
the shape the `HolidayBanner` component consumes (`{enabled, key}`).

Prior to MEH-247 the endpoint read `holiday_mode_active` +
`holiday_mode_banner_text` and returned `{active, banner_text}` — so the
banner never lit up even after an admin toggled the flag. These tests
lock in the corrected contract.
"""
from app.models.models import AdminSetting


def test_holiday_mode_default_off(client):
    """No admin_settings rows → enabled=False, key=null."""
    resp = client.get("/holiday-mode")
    assert resp.status_code == 200
    data = resp.json()
    assert data["enabled"] is False
    assert data["key"] is None


def test_holiday_mode_enabled_with_key(client, db):
    """enabled=true + key in DB → both returned correctly."""
    db.add(AdminSetting(key="holiday_override_enabled", value="true"))
    db.add(AdminSetting(key="holiday_override_key", value="pesach"))
    db.commit()

    resp = client.get("/holiday-mode")
    assert resp.status_code == 200
    data = resp.json()
    assert data["enabled"] is True
    assert data["key"] == "pesach"


def test_holiday_mode_enabled_no_key(client, db):
    """enabled=true but no override key → key is null (banner falls back
    to the calendar-driven holiday)."""
    db.add(AdminSetting(key="holiday_override_enabled", value="true"))
    db.commit()

    resp = client.get("/holiday-mode")
    assert resp.status_code == 200
    data = resp.json()
    assert data["enabled"] is True
    assert data["key"] is None


def test_holiday_mode_explicitly_false(client, db):
    """enabled=false when the flag is explicitly set to 'false'."""
    db.add(AdminSetting(key="holiday_override_enabled", value="false"))
    db.commit()

    resp = client.get("/holiday-mode")
    assert resp.status_code == 200
    assert resp.json()["enabled"] is False
