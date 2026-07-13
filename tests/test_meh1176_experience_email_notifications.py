"""MEH-1176 F8 — the experiences email notifications had zero test coverage.

Four call sites, all previously unasserted (matrix § Findings F8):
  - POST /experiences            → notify_admin_new_submission (experiences.py)
  - POST /admin/experiences/{id}/approve         → notify_host_approved
  - POST /admin/experiences/{id}/request-changes → notify_host_changes_requested
  - POST /admin/experiences/{id}/reject          → notify_host_rejected

Tests patch the notify_* names in the ROUTER namespaces (from-import binding)
and assert the exact arguments each state change sends. Tests only — no
router/service change.

REUSES: tests/test_experiences.py fixtures (_payload / _make_experience /
_mock_moderation).
"""

from conftest import auth_header, make_user
from test_experiences import _make_experience, _mock_moderation, _payload


class TestSubmissionAdminNotification:
    def test_submit_fires_admin_notification_with_verdict(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch, status="APPROVED")
        calls = []
        import app.routers.experiences as router_mod

        monkeypatch.setattr(
            router_mod,
            "notify_admin_new_submission",
            lambda **kw: calls.append(kw),
        )

        user = make_user(db, role="consumer", email="host@test.com")
        payload = _payload()
        r = client.post("/experiences", json=payload, headers=auth_header(user))
        assert r.status_code == 201, r.text

        assert len(calls) == 1
        assert calls[0]["title"] == payload["title"]
        assert calls[0]["host_name"] == user.name
        assert calls[0]["city"] == payload["city"]
        assert calls[0]["moderation_status"] == "APPROVED"

    def test_flagged_verdict_is_forwarded_to_the_admin_email(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch, status="FLAGGED", reason="בדיקה")
        calls = []
        import app.routers.experiences as router_mod

        monkeypatch.setattr(
            router_mod,
            "notify_admin_new_submission",
            lambda **kw: calls.append(kw),
        )

        user = make_user(db, role="consumer", email="host2@test.com")
        r = client.post("/experiences", json=_payload(), headers=auth_header(user))
        assert r.status_code == 201, r.text
        assert calls[0]["moderation_status"] == "FLAGGED"

    def test_service_skips_silently_without_admin_email(self, monkeypatch):
        """Unit guard: no ADMIN_EMAIL configured → no send attempt (fail-open)."""
        from app.config import settings
        from app.services import experience_notifications as svc

        sent = []
        monkeypatch.setattr(svc, "_send_email", lambda *a: sent.append(a))
        monkeypatch.setattr(settings, "admin_email", None)
        svc.notify_admin_new_submission(
            title="t", host_name="h", city=None, moderation_status="APPROVED"
        )
        assert sent == []


class TestHostModerationNotifications:
    def _setup(self, db):
        host = make_user(db, role="consumer", email="thehost@test.com")
        admin = make_user(db, role="admin", email="admin@test.com")
        ex = _make_experience(db, host)
        return host, admin, ex

    def test_approve_notifies_host(self, client, db, monkeypatch):
        host, admin, ex = self._setup(db)
        calls = []
        import app.routers.admin_experiences as router_mod

        monkeypatch.setattr(
            router_mod, "notify_host_approved", lambda *a: calls.append(a)
        )
        r = client.post(
            f"/admin/experiences/{ex.id}/approve", headers=auth_header(admin)
        )
        assert r.status_code == 200, r.text
        assert calls == [(host.email, ex.title, str(ex.id))]

    def test_request_changes_notifies_host_with_feedback(self, client, db, monkeypatch):
        host, admin, ex = self._setup(db)
        calls = []
        import app.routers.admin_experiences as router_mod

        monkeypatch.setattr(
            router_mod, "notify_host_changes_requested", lambda *a: calls.append(a)
        )
        r = client.post(
            f"/admin/experiences/{ex.id}/request-changes",
            json={"feedback": "נא להוסיף תמונות"},
            headers=auth_header(admin),
        )
        assert r.status_code == 200, r.text
        assert calls == [(host.email, ex.title, str(ex.id), "נא להוסיף תמונות")]

    def test_reject_notifies_host(self, client, db, monkeypatch):
        host, admin, ex = self._setup(db)
        calls = []
        import app.routers.admin_experiences as router_mod

        monkeypatch.setattr(
            router_mod, "notify_host_rejected", lambda *a: calls.append(a)
        )
        r = client.post(
            f"/admin/experiences/{ex.id}/reject",
            json={"feedback": "לא מתאים"},
            headers=auth_header(admin),
        )
        assert r.status_code == 200, r.text
        assert calls == [(host.email, ex.title, "לא מתאים")]
