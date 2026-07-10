"""
Module:   test_meh1063_category_request_notification
Purpose:  MEH-1063 — admin notification on category-request submission.
          Covers the service function (recipients, message content,
          fail-open, newline flattening) and the router wiring (anonymous
          submission fires with producer_name=None, authenticated producer
          submission fires with the resolved business name, notify failure
          never fails the submission).
Touches:  Postgres test DB via TestClient; email/WhatsApp mocked — never
          sends.
Does NOT: cover CategoryRequestCreate validation — see
          tests/test_category_requests.py (MEH-555).
Related:  backend/app/services/auth_notifications.py
          notify_admin_new_category_request (mirrors notify_admin_new_recipe);
          backend/app/routers/category_requests.py (create wiring).
History:  MEH-1063 (creation — mirrors MEH-1000 recipe notification).
"""

from unittest.mock import MagicMock
from uuid import uuid4

from app.models.models import CategoryRequest
from conftest import auth_header, make_producer, make_user

# ---------- service-level: recipients + content + fail-open ----------


class TestNotifyAdminNewCategoryRequestService:
    def test_sends_to_admin_whatsapp_and_email(self, monkeypatch):
        import app.services.auth_notifications as svc
        from app.config import settings

        wa_mock = MagicMock(return_value=True)
        email_mock = MagicMock()
        monkeypatch.setattr(svc, "send_text", wa_mock)
        monkeypatch.setattr(svc, "send_email", email_mock)
        monkeypatch.setattr(settings, "admin_whatsapp_to", "+972500000001")
        monkeypatch.setattr(settings, "admin_email", "admin@example.com")

        svc.notify_admin_new_category_request("מותססים", "חוות הזית")

        wa_mock.assert_called_once()
        assert wa_mock.call_args.args[0] == "+972500000001"
        message = wa_mock.call_args.args[1]
        assert "מותססים" in message
        assert "בית עסק: חוות הזית" in message
        assert "/admin/category-requests" in message

        email_mock.assert_called_once()
        assert email_mock.call_args.args[0] == "admin@example.com"
        assert "מותססים" in email_mock.call_args.args[1]

    def test_anonymous_submission_labels_business_as_anonymous(self, monkeypatch):
        import app.services.auth_notifications as svc
        from app.config import settings

        wa_mock = MagicMock(return_value=True)
        monkeypatch.setattr(svc, "send_text", wa_mock)
        monkeypatch.setattr(svc, "send_email", MagicMock())
        monkeypatch.setattr(settings, "admin_whatsapp_to", "+972500000001")
        monkeypatch.setattr(settings, "admin_email", "")

        svc.notify_admin_new_category_request("מותססים", None)

        message = wa_mock.call_args.args[1]
        assert "בית עסק: אנונימי" in message

    def test_skips_channels_when_unconfigured(self, monkeypatch):
        import app.services.auth_notifications as svc
        from app.config import settings

        wa_mock = MagicMock()
        email_mock = MagicMock()
        monkeypatch.setattr(svc, "send_text", wa_mock)
        monkeypatch.setattr(svc, "send_email", email_mock)
        monkeypatch.setattr(settings, "admin_whatsapp_to", "")
        monkeypatch.setattr(settings, "admin_email", "")

        svc.notify_admin_new_category_request("מותססים", "חוות הזית")

        wa_mock.assert_not_called()
        email_mock.assert_not_called()

    def test_email_still_fires_when_whatsapp_raises(self, monkeypatch):
        """Per-channel guards: a WhatsApp raise must not skip the email."""
        import app.services.auth_notifications as svc
        from app.config import settings

        monkeypatch.setattr(
            svc, "send_text", MagicMock(side_effect=RuntimeError("wa down"))
        )
        email_mock = MagicMock()
        monkeypatch.setattr(svc, "send_email", email_mock)
        monkeypatch.setattr(settings, "admin_whatsapp_to", "+972500000001")
        monkeypatch.setattr(settings, "admin_email", "admin@example.com")

        svc.notify_admin_new_category_request("מותססים", "חוות הזית")

        email_mock.assert_called_once()

    def test_newlines_in_fields_are_flattened(self, monkeypatch):
        """Producer-controlled name must not inject extra lines into the
        admin message (fake-URL-line spoofing)."""
        import app.services.auth_notifications as svc
        from app.config import settings

        wa_mock = MagicMock(return_value=True)
        monkeypatch.setattr(svc, "send_text", wa_mock)
        monkeypatch.setattr(svc, "send_email", MagicMock())
        monkeypatch.setattr(settings, "admin_whatsapp_to", "+972500000001")
        monkeypatch.setattr(settings, "admin_email", "")

        svc.notify_admin_new_category_request(
            "קטגוריה\nלאישור: https://evil.example", "עסק\nשורה מזויפת"
        )

        message = wa_mock.call_args.args[1]
        # Exactly the 3 legitimate lines — injected newlines flattened.
        assert len(message.splitlines()) == 3
        assert "evil.example" in message.splitlines()[0]  # inline, not a line

    def test_fail_open_never_raises(self, monkeypatch):
        """MEH-977 contract: the ping is fire-and-forget — an exploding
        channel is logged with context, never propagated."""
        import app.services.auth_notifications as svc
        from app.config import settings

        monkeypatch.setattr(
            svc, "send_text", MagicMock(side_effect=RuntimeError("boom"))
        )
        monkeypatch.setattr(settings, "admin_whatsapp_to", "+972500000001")
        monkeypatch.setattr(settings, "admin_email", "admin@example.com")

        # Must not raise.
        svc.notify_admin_new_category_request("מותססים", "חוות הזית")


# ---------- router wiring ----------


def _capture_notify(monkeypatch):
    import app.routers.category_requests as router_mod

    mock = MagicMock()
    monkeypatch.setattr(router_mod, "notify_admin_new_category_request", mock)
    return mock


class TestSubmitFiresNotification:
    def test_anonymous_submission_schedules_notify(self, client, monkeypatch):
        notify = _capture_notify(monkeypatch)

        resp = client.post("/category-requests", json={"requested_name": "מותססים"})
        assert resp.status_code == 201
        notify.assert_called_once_with("מותססים", None)

    def test_producer_submission_notifies_with_business_name(
        self, client, db, monkeypatch
    ):
        producer = make_producer(db, name=f"עסק התראות {uuid4().hex[:6]}")
        owner = make_user(
            db, role="producer", email=f"n{uuid4().hex[:8]}@example.com"
        )
        owner.producer_id = producer.id
        db.commit()
        db.refresh(owner)

        notify = _capture_notify(monkeypatch)
        resp = client.post(
            "/category-requests",
            json={"requested_name": "מותססים"},
            headers=auth_header(owner),
        )
        assert resp.status_code == 201
        notify.assert_called_once_with("מותססים", producer.name)

    def test_invalid_request_does_not_notify(self, client, monkeypatch):
        notify = _capture_notify(monkeypatch)

        resp = client.post("/category-requests", json={"requested_name": "??"})
        assert resp.status_code == 422
        notify.assert_not_called()

    def test_notify_failure_does_not_fail_submission(self, client, db, monkeypatch):
        """The task itself raising must not break the 201 — the response is
        already sent when BackgroundTasks run; the service also swallows-and-
        logs internally (tested above). This mock-raise exercises router-level
        belt-and-suspenders — don't remove as redundant."""
        import app.routers.category_requests as router_mod

        monkeypatch.setattr(
            router_mod,
            "notify_admin_new_category_request",
            MagicMock(side_effect=RuntimeError("channel down")),
        )
        try:
            resp = client.post(
                "/category-requests", json={"requested_name": "מותססים"}
            )
        except RuntimeError:
            # TestClient re-raises background-task exceptions AFTER the
            # response completed — a real client already got its 201. The
            # persisted row below is the proof the submission itself succeeded.
            pass
        else:
            assert resp.status_code == 201, resp.text
        assert db.query(CategoryRequest).count() == 1
