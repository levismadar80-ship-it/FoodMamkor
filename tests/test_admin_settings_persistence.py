"""MEH-247 — admin_settings PUT must persist friday_mode_override.

Before MEH-247, `friday_mode_override` was not in `DEFAULT_SETTINGS` in
`admin_extra.py`, so `update_settings` silently dropped it (the
`if key not in DEFAULT_SETTINGS: continue` filter). The admin toggle
appeared to save but the DB never stored it — admin A's override was
never visible to admin B on the next /admin/settings load.
"""
from tests.conftest import auth_header, make_user


def test_friday_mode_override_persists(client, db):
    admin = make_user(db, role="admin")
    r = client.put(
        "/admin/settings",
        json={"friday_mode_override": "true"},
        headers=auth_header(admin),
    )
    assert r.status_code == 200

    # Round-trip: fetch settings back and confirm the toggle stuck.
    r2 = client.get("/admin/settings", headers=auth_header(admin))
    assert r2.status_code == 200
    assert r2.json()["friday_mode_override"] == "true"


def test_holiday_override_persists(client, db):
    """Regression: the two holiday_override_* keys still persist as before."""
    admin = make_user(db, role="admin")
    r = client.put(
        "/admin/settings",
        json={
            "holiday_override_enabled": "true",
            "holiday_override_key": "pesach",
        },
        headers=auth_header(admin),
    )
    assert r.status_code == 200

    r2 = client.get("/admin/settings", headers=auth_header(admin))
    assert r2.json()["holiday_override_enabled"] == "true"
    assert r2.json()["holiday_override_key"] == "pesach"


def test_unknown_setting_is_dropped(client, db):
    """Regression: non-whitelisted keys are silently ignored (the filter
    that caused MEH-247 must remain — we only expanded the allowlist)."""
    admin = make_user(db, role="admin")
    r = client.put(
        "/admin/settings",
        json={"not_a_real_setting": "value"},
        headers=auth_header(admin),
    )
    assert r.status_code == 200
    r2 = client.get("/admin/settings", headers=auth_header(admin))
    assert "not_a_real_setting" not in r2.json()
