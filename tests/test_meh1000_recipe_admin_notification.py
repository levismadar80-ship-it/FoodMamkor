"""
Module:   test_meh1000_recipe_admin_notification
Purpose:  MEH-1000 — admin notification on recipe submission. Covers the
          service function (recipients, message content, fail-open) and
          the router wiring (create fires, needs_revision resubmit fires,
          metadata-only edit and already-pending content edit do not,
          notify failure never fails the submission).
Touches:  Postgres test DB via TestClient; email/WhatsApp mocked — never
          sends.
Does NOT: cover the recipe moderation pipeline itself — see
          tests/test_producer_recipes.py and the MEH-997 journey suite
          (journey 1b asserts the same hop end-to-end).
Related:  backend/app/services/auth_notifications.py notify_admin_new_recipe;
          backend/app/routers/producer_recipes.py (create + update wiring).
History:  MEH-1000 (creation — closes the MEH-997 journey-1b gap).
"""

from unittest.mock import MagicMock
from uuid import uuid4

from app.models.models import ProducerRecipe
from conftest import auth_header, make_producer, make_user

# ---------- helpers (REUSES: tests/test_producer_recipes.py) ----------


def _payload(**overrides) -> dict:
    base = {
        "title": "חלת מחמצת קלאסית",
        "description": "מתכון פשוט לחלה ביתית",
        "ingredients": "קמח, מים, מלח, מחמצת",
        "instructions": "לערבב, ללוש, להתפיח ולאפות ב-220 מעלות.",
        "prep_time_min": 30,
        "cook_time_min": 35,
        "servings": 8,
        "product_ids": [],
    }
    base.update(overrides)
    return base


def _producer_user(db):
    producer = make_producer(db, name=f"עסק התראות {uuid4().hex[:6]}")
    user = make_user(db, role="producer", email=f"n{uuid4().hex[:8]}@test.com")
    user.producer_id = producer.id
    db.commit()
    db.refresh(user)
    return producer, user


def _mock_moderation(monkeypatch, status="APPROVED"):
    result = {"status": status, "reason": None, "suggestion": None}
    import app.routers.producer_recipes as router_mod
    import app.services.producer_recipe_moderation as svc_mod

    monkeypatch.setattr(svc_mod, "validate_producer_recipe", lambda _: result)
    monkeypatch.setattr(router_mod, "validate_producer_recipe", lambda _: result)


def _capture_notify(monkeypatch):
    import app.routers.producer_recipes as router_mod

    mock = MagicMock()
    monkeypatch.setattr(router_mod, "notify_admin_new_recipe", mock)
    return mock


# ---------- service-level: recipients + content + fail-open ----------


class TestNotifyAdminNewRecipeService:
    def test_sends_to_admin_whatsapp_and_email(self, monkeypatch):
        import app.services.auth_notifications as svc
        from app.config import settings

        wa_mock = MagicMock(return_value=True)
        email_mock = MagicMock()
        monkeypatch.setattr(svc, "send_text", wa_mock)
        monkeypatch.setattr(svc, "send_email", email_mock)
        monkeypatch.setattr(settings, "admin_whatsapp_to", "+972500000001")
        monkeypatch.setattr(settings, "admin_email", "admin@test.com")

        svc.notify_admin_new_recipe("חוות הזית", "לחם שאור")

        wa_mock.assert_called_once()
        assert wa_mock.call_args.args[0] == "+972500000001"
        message = wa_mock.call_args.args[1]
        assert "לחם שאור" in message
        assert "בית עסק: חוות הזית" in message
        assert "/admin/recipes" in message

        email_mock.assert_called_once()
        assert email_mock.call_args.args[0] == "admin@test.com"
        assert "לחם שאור" in email_mock.call_args.args[1]

    def test_skips_channels_when_unconfigured(self, monkeypatch):
        import app.services.auth_notifications as svc
        from app.config import settings

        wa_mock = MagicMock()
        email_mock = MagicMock()
        monkeypatch.setattr(svc, "send_text", wa_mock)
        monkeypatch.setattr(svc, "send_email", email_mock)
        monkeypatch.setattr(settings, "admin_whatsapp_to", "")
        monkeypatch.setattr(settings, "admin_email", "")

        svc.notify_admin_new_recipe("חוות הזית", "לחם שאור")

        wa_mock.assert_not_called()
        email_mock.assert_not_called()

    def test_fail_open_never_raises(self, monkeypatch):
        """MEH-977 contract: the ping is fire-and-forget — an exploding
        channel is logged with context, never propagated."""
        import app.services.auth_notifications as svc
        from app.config import settings

        monkeypatch.setattr(
            svc, "send_text", MagicMock(side_effect=RuntimeError("boom"))
        )
        monkeypatch.setattr(settings, "admin_whatsapp_to", "+972500000001")
        monkeypatch.setattr(settings, "admin_email", "admin@test.com")

        # Must not raise.
        svc.notify_admin_new_recipe("חוות הזית", "לחם שאור")


# ---------- router wiring ----------


class TestCreateFiresNotification:
    def test_create_schedules_notify_with_business_name_and_title(
        self, client, db, monkeypatch
    ):
        _mock_moderation(monkeypatch)
        producer, owner = _producer_user(db)
        notify = _capture_notify(monkeypatch)

        resp = client.post(
            "/producers/me/recipes", json=_payload(), headers=auth_header(owner)
        )
        assert resp.status_code == 201
        notify.assert_called_once_with(producer.name, _payload()["title"])

    def test_rejected_recipe_does_not_notify(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch, status="REJECTED")
        _, owner = _producer_user(db)
        notify = _capture_notify(monkeypatch)

        resp = client.post(
            "/producers/me/recipes", json=_payload(), headers=auth_header(owner)
        )
        assert resp.status_code == 400
        notify.assert_not_called()

    def test_notify_failure_does_not_fail_submission(
        self, client, db, monkeypatch
    ):
        """The task itself raising must not break the 201 — the response
        is already sent when BackgroundTasks run; the service also
        swallows-and-logs internally (tested above)."""
        _mock_moderation(monkeypatch)
        _, owner = _producer_user(db)

        import app.routers.producer_recipes as router_mod

        monkeypatch.setattr(
            router_mod,
            "notify_admin_new_recipe",
            MagicMock(side_effect=RuntimeError("channel down")),
        )
        try:
            resp = client.post(
                "/producers/me/recipes",
                json=_payload(),
                headers=auth_header(owner),
            )
        except RuntimeError:
            # TestClient re-raises background-task exceptions AFTER the
            # response completed — a real client already got its 201. We
            # can't read the status here, so the persisted row below is
            # the proof the submission itself succeeded.
            pass
        else:
            assert resp.status_code == 201, resp.text
        assert db.query(ProducerRecipe).count() == 1


class TestResubmitFiresNotification:
    def _create_recipe(self, client, db, monkeypatch, owner):
        _mock_moderation(monkeypatch)
        resp = client.post(
            "/producers/me/recipes", json=_payload(), headers=auth_header(owner)
        )
        assert resp.status_code == 201
        return resp.json()["id"]

    def test_resubmit_after_needs_revision_notifies_again(
        self, client, db, monkeypatch
    ):
        producer, owner = _producer_user(db)
        admin = make_user(db, role="admin", email=f"a{uuid4().hex[:6]}@t.com")
        recipe_id = self._create_recipe(client, db, monkeypatch, owner)

        ok = client.post(
            f"/admin/recipes/{recipe_id}/request-changes",
            json={"feedback": "נא לפרט כמויות"},
            headers=auth_header(admin),
        )
        assert ok.status_code == 200

        notify = _capture_notify(monkeypatch)
        resp = client.patch(
            f"/producers/me/recipes/{recipe_id}",
            json={"instructions": "גרסה מתוקנת: ללוש 15 דקות ולאפות."},
            headers=auth_header(owner),
        )
        assert resp.status_code == 200
        assert resp.json()["moderation_status"] == "pending"
        notify.assert_called_once_with(producer.name, _payload()["title"])

    def test_metadata_only_edit_does_not_notify(self, client, db, monkeypatch):
        _, owner = _producer_user(db)
        recipe_id = self._create_recipe(client, db, monkeypatch, owner)

        notify = _capture_notify(monkeypatch)
        resp = client.patch(
            f"/producers/me/recipes/{recipe_id}",
            json={"servings": 4},
            headers=auth_header(owner),
        )
        assert resp.status_code == 200
        notify.assert_not_called()

    def test_content_edit_while_still_pending_does_not_renotify(
        self, client, db, monkeypatch
    ):
        """An already-pending card edited again is not a NEW queue entry —
        no second ping (anti-spam guard on prev_status)."""
        _, owner = _producer_user(db)
        recipe_id = self._create_recipe(client, db, monkeypatch, owner)

        notify = _capture_notify(monkeypatch)
        resp = client.patch(
            f"/producers/me/recipes/{recipe_id}",
            json={"instructions": "עדכון קטן להוראות ההכנה."},
            headers=auth_header(owner),
        )
        assert resp.status_code == 200
        assert resp.json()["moderation_status"] == "pending"
        notify.assert_not_called()
