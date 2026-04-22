import pytest

from app.models.models import AdminSetting


def test_holiday_mode_default_off(client):
    """No admin_settings rows → active=False, banner_text=null."""
    resp = client.get("/holiday-mode")
    assert resp.status_code == 200
    data = resp.json()
    assert data["active"] is False
    assert data["banner_text"] is None


def test_holiday_mode_active_with_banner(client, db):
    """active=true + banner_text in DB → both returned correctly."""
    db.add(AdminSetting(key="holiday_mode_active", value="true"))
    db.add(AdminSetting(key="holiday_mode_banner_text", value="חג פסח שמח!"))
    db.commit()

    resp = client.get("/holiday-mode")
    assert resp.status_code == 200
    data = resp.json()
    assert data["active"] is True
    assert data["banner_text"] == "חג פסח שמח!"


def test_holiday_mode_active_no_banner(client, db):
    """active=true but no banner_text row → banner_text is null."""
    db.add(AdminSetting(key="holiday_mode_active", value="true"))
    db.commit()

    resp = client.get("/holiday-mode")
    assert resp.status_code == 200
    data = resp.json()
    assert data["active"] is True
    assert data["banner_text"] is None


def test_holiday_mode_explicitly_false(client, db):
    """active=false when flag is explicitly set to 'false'."""
    db.add(AdminSetting(key="holiday_mode_active", value="false"))
    db.commit()

    resp = client.get("/holiday-mode")
    assert resp.status_code == 200
    assert resp.json()["active"] is False
