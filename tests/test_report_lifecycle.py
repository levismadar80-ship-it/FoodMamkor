"""MEH-1266 — report lifecycle: resolve/dismiss + open-only visibility/counters.

Covers the three bugs the ticket closes:
  1. סף 3+ מסתיר דיווחים — a single open report is now visible on /admin/reports.
  2. אין resolve — resolve/dismiss set status + resolved_at + resolved_by and
     survive a reload; a second close returns 409.
  3. מונים שבורים — the dashboard open_reports counter (and the sidebar badge
     that inherits it) count status == "open" only.
"""

from app.models import Report

from tests.conftest import auth_header, make_producer, make_user


def _report(db, producer, reporter, reason="לא כשר כמו שהצהיר"):
    r = Report(reporter_id=reporter.id, producer_id=producer.id, reason=reason)
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


class TestReportVisibility:
    def test_single_report_producer_is_visible(self, client, db):
        """One open report → the producer shows up (no 3+ gate)."""
        admin = make_user(db, role="admin", email="admin@example.com")
        producer = make_producer(db)
        _report(db, producer, make_user(db, email="r1@example.com"))

        resp = client.get("/admin/reports", headers=auth_header(admin))
        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 1
        assert body[0]["producer_id"] == str(producer.id)
        assert body[0]["report_count"] == 1
        assert body[0]["auto_flagged"] is False

    def test_three_reports_auto_flag(self, client, db):
        admin = make_user(db, role="admin", email="admin@example.com")
        producer = make_producer(db)
        for i in range(3):
            _report(db, producer, make_user(db, email=f"r{i}@example.com"))

        body = client.get("/admin/reports", headers=auth_header(admin)).json()
        assert body[0]["report_count"] == 3
        assert body[0]["auto_flagged"] is True

    def test_closed_reports_excluded(self, client, db):
        """A dismissed report drops the producer off the list entirely."""
        admin = make_user(db, role="admin", email="admin@example.com")
        producer = make_producer(db)
        r = _report(db, producer, make_user(db, email="r1@example.com"))

        client.post(f"/admin/reports/{r.id}/dismiss", headers=auth_header(admin))

        body = client.get("/admin/reports", headers=auth_header(admin)).json()
        assert body == []


class TestResolveDismiss:
    def test_resolve_sets_fields(self, client, db):
        admin = make_user(db, role="admin", email="admin@example.com")
        producer = make_producer(db)
        r = _report(db, producer, make_user(db, email="r1@example.com"))

        resp = client.post(f"/admin/reports/{r.id}/resolve", headers=auth_header(admin))
        assert resp.status_code == 200
        db.refresh(r)
        assert r.status == "resolved"
        assert r.resolved_at is not None
        assert r.resolved_by == admin.id

    def test_dismiss_sets_status(self, client, db):
        admin = make_user(db, role="admin", email="admin@example.com")
        producer = make_producer(db)
        r = _report(db, producer, make_user(db, email="r1@example.com"))

        client.post(f"/admin/reports/{r.id}/dismiss", headers=auth_header(admin))
        db.refresh(r)
        assert r.status == "dismissed"

    def test_double_close_returns_409(self, client, db):
        admin = make_user(db, role="admin", email="admin@example.com")
        producer = make_producer(db)
        r = _report(db, producer, make_user(db, email="r1@example.com"))

        first = client.post(
            f"/admin/reports/{r.id}/resolve", headers=auth_header(admin)
        )
        assert first.status_code == 200
        # Second close (resolve or dismiss) on an already-closed report → 409.
        second = client.post(
            f"/admin/reports/{r.id}/dismiss", headers=auth_header(admin)
        )
        assert second.status_code == 409

    def test_close_missing_report_404(self, client, db):
        admin = make_user(db, role="admin", email="admin@example.com")
        missing = "00000000-0000-0000-0000-000000000000"
        resp = client.post(
            f"/admin/reports/{missing}/resolve", headers=auth_header(admin)
        )
        assert resp.status_code == 404

    def test_resolve_requires_admin(self, client, db):
        producer = make_producer(db)
        r = _report(db, producer, make_user(db, email="r1@example.com"))
        non_admin = make_user(db, email="user@example.com")
        resp = client.post(
            f"/admin/reports/{r.id}/resolve", headers=auth_header(non_admin)
        )
        assert resp.status_code == 403


class TestDashboardOpenOnly:
    def test_open_reports_counts_open_only(self, client, db):
        admin = make_user(db, role="admin", email="admin@example.com")
        producer = make_producer(db)
        r1 = _report(db, producer, make_user(db, email="r1@example.com"))
        _report(db, producer, make_user(db, email="r2@example.com"))

        before = client.get("/admin/dashboard", headers=auth_header(admin)).json()
        assert before["stats"]["open_reports"] == 2

        client.post(f"/admin/reports/{r1.id}/resolve", headers=auth_header(admin))

        after = client.get("/admin/dashboard", headers=auth_header(admin)).json()
        assert after["stats"]["open_reports"] == 1
