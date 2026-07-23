"""MEH-1361 — new_recipe favorite alert: 4th alert type, fired on admin approve.

The ONLY code path that flips a recipe publicly visible is
admin_recipes.approve_recipe (producers cannot set `published` —
ProducerRecipeUpdate has no such field; every other writer only
unpublishes). The alert fires there, on the false→true `published`
transition.

Monkeypatch boundaries:
  - app.routers.alerts.fire_alerts — for once-semantics tests. The
    MEH-1338 per-(user, producer, channel) 24h cap would ALSO suppress a
    second delivery, so asserting at the channel level could green a
    broken transition guard; capturing fire_alerts invocations isolates
    the guard itself.
  - app.services.push.send_push_notification + app.routers.alerts
    .send_template — for the end-to-end fan-out tests (REUSES:
    tests/test_alerts.py).
"""

from conftest import auth_header, make_producer, make_user

from app.models import Favorite, FavoriteAlert, ProducerRecipe

_SUB = {"endpoint": "https://push.example/r", "keys": {"p256dh": "x", "auth": "y"}}


def _make_recipe(db, producer, **overrides):
    recipe = ProducerRecipe(
        producer_id=producer.id,
        title=overrides.get("title", "עוגת גבינה"),
        ingredients="א" * 20,
        instructions="ב" * 20,
        moderation_status=overrides.get("moderation_status", "pending"),
        published=overrides.get("published", False),
    )
    db.add(recipe)
    db.commit()
    db.refresh(recipe)
    return recipe


def _recipe_alert(db, user, producer, *, opted_in=True, push=_SUB):
    db.add(Favorite(user_id=user.id, producer_id=producer.id))
    db.add(
        FavoriteAlert(
            user_id=user.id,
            producer_id=producer.id,
            notify_new_recipe=opted_in,
            push_subscription=push,
        )
    )
    db.commit()


def _capture_fire_alerts(monkeypatch):
    calls = []

    def fake_fire_alerts(db, producer_id, alert_type, content, target_cities=None):
        calls.append({"alert_type": alert_type, "content": content})

    monkeypatch.setattr("app.routers.alerts.fire_alerts", fake_fire_alerts)
    return calls


class TestNewRecipeAlertTrigger:
    def test_approve_fires_once_with_new_recipe_type(self, client, db, monkeypatch):
        calls = _capture_fire_alerts(monkeypatch)
        producer = make_producer(db, name="מאפיית הכפר")
        recipe = _make_recipe(db, producer, title="לחם מחמצת")
        admin = make_user(db, role="admin", email="adm1@example.com")

        resp = client.post(
            f"/admin/recipes/{recipe.id}/approve", headers=auth_header(admin)
        )
        assert resp.status_code == 200
        assert len(calls) == 1
        assert calls[0]["alert_type"] == "new_recipe"
        assert "לחם מחמצת" in calls[0]["content"].title

    def test_reapprove_of_published_recipe_does_not_refire(
        self, client, db, monkeypatch
    ):
        """Idempotent double-approve → exactly one fire (transition guard,
        NOT the MEH-1338 cap — fire_alerts itself is captured here)."""
        calls = _capture_fire_alerts(monkeypatch)
        producer = make_producer(db, name="עסק חוזר")
        recipe = _make_recipe(db, producer)
        admin = make_user(db, role="admin", email="adm2@example.com")

        for _ in range(2):
            resp = client.post(
                f"/admin/recipes/{recipe.id}/approve", headers=auth_header(admin)
            )
            assert resp.status_code == 200

        assert len(calls) == 1

    def test_create_draft_does_not_fire(self, client, db, monkeypatch):
        """Submitting a recipe (pending, unpublished) must not alert followers —
        only the admin ping fires on submit (producer_recipes.py, untouched)."""
        calls = _capture_fire_alerts(monkeypatch)
        producer = make_producer(db, name="עסק טיוטה")
        owner = make_user(db, role="producer", email="own1@example.com")
        owner.producer_id = producer.id
        db.commit()

        resp = client.post(
            "/producers/me/recipes",
            json={
                "title": "סלט קצוץ",
                "ingredients": "עגבניות, מלפפונים, בצל",
                "instructions": "קוצצים הכל דק ומערבבים עם לימון ושמן זית",
            },
            headers=auth_header(owner),
        )
        assert resp.status_code == 201
        assert calls == []

    def test_edit_of_published_recipe_does_not_fire(self, client, db, monkeypatch):
        """A content edit resets the recipe to pending+unpublished — no alert
        fires on the edit itself."""
        calls = _capture_fire_alerts(monkeypatch)
        producer = make_producer(db, name="עסק עריכה")
        owner = make_user(db, role="producer", email="own2@example.com")
        owner.producer_id = producer.id
        db.commit()
        recipe = _make_recipe(
            db, producer, moderation_status="approved", published=True
        )

        resp = client.patch(
            f"/producers/me/recipes/{recipe.id}",
            json={"title": "כותרת חדשה לגמרי"},
            headers=auth_header(owner),
        )
        assert resp.status_code == 200
        assert resp.json()["published"] is False
        assert calls == []

    def test_alert_url_uses_slug_recipe_page_with_producer_fallback(
        self, client, db, monkeypatch
    ):
        calls = _capture_fire_alerts(monkeypatch)
        admin = make_user(db, role="admin", email="adm3@example.com")

        slugged = make_producer(db, name="עם סלאג")
        slugged.slug = "farm-slug"
        db.commit()
        r1 = _make_recipe(db, slugged)
        client.post(f"/admin/recipes/{r1.id}/approve", headers=auth_header(admin))
        assert calls[-1]["content"].url == f"/farm-slug/recipes/{r1.id}"

        slugless = make_producer(db, name="בלי סלאג")
        r2 = _make_recipe(db, slugless)
        client.post(f"/admin/recipes/{r2.id}/approve", headers=auth_header(admin))
        # No slug → no addressable public recipe page; producer page fallback.
        assert calls[-1]["content"].url == f"/producer/{slugless.id}"


class TestNewRecipeFanOut:
    """End-to-end through the REAL fire_alerts (channels mocked)."""

    def _mock_channels(self, monkeypatch):
        pushes = []
        monkeypatch.setattr(
            "app.services.push.send_push_notification",
            lambda sub, **kw: pushes.append({"sub": sub, **kw}),
        )
        monkeypatch.setattr("app.routers.alerts.send_template", lambda to, tmpl: True)
        return pushes

    def test_opted_in_follower_receives_push_on_approve(self, client, db, monkeypatch):
        pushes = self._mock_channels(monkeypatch)
        producer = make_producer(db, name="חוות מתכונים")
        follower = make_user(db, email="fan@example.com")
        _recipe_alert(db, follower, producer, opted_in=True)
        recipe = _make_recipe(db, producer, title="שקשוקה ירוקה")
        admin = make_user(db, role="admin", email="adm4@example.com")

        resp = client.post(
            f"/admin/recipes/{recipe.id}/approve", headers=auth_header(admin)
        )
        assert resp.status_code == 200
        assert len(pushes) == 1
        assert "שקשוקה ירוקה" in pushes[0]["title"]

    def test_opted_out_follower_receives_nothing(self, client, db, monkeypatch):
        pushes = self._mock_channels(monkeypatch)
        producer = make_producer(db, name="חווה שקטה")
        follower = make_user(db, email="quiet@example.com")
        _recipe_alert(db, follower, producer, opted_in=False)
        recipe = _make_recipe(db, producer)
        admin = make_user(db, role="admin", email="adm5@example.com")

        resp = client.post(
            f"/admin/recipes/{recipe.id}/approve", headers=auth_header(admin)
        )
        assert resp.status_code == 200
        assert pushes == []


class TestNewRecipePrefsApi:
    def test_toggle_persists_through_put_and_get(self, client, db):
        user = make_user(db, email="prefs@example.com")
        producer = make_producer(db, name="עסק הגדרות")
        db.add(Favorite(user_id=user.id, producer_id=producer.id))
        db.commit()

        r = client.put(
            f"/users/me/favorites/{producer.id}/alerts",
            json={"notify_new_recipe": False, "notify_new_product": True},
            headers=auth_header(user),
        )
        assert r.status_code == 200
        assert r.json()["notify_new_recipe"] is False

        r2 = client.get(
            f"/users/me/favorites/{producer.id}/alerts", headers=auth_header(user)
        )
        assert r2.json()["notify_new_recipe"] is False

        r3 = client.put(
            f"/users/me/favorites/{producer.id}/alerts",
            json={"notify_new_recipe": True},
            headers=auth_header(user),
        )
        assert r3.json()["notify_new_recipe"] is True

    def test_no_row_reports_new_recipe_false(self, client, db):
        user = make_user(db, email="norow@example.com")
        producer = make_producer(db, name="עסק ריק")
        r = client.get(
            f"/users/me/favorites/{producer.id}/alerts", headers=auth_header(user)
        )
        assert r.status_code == 200
        assert r.json()["notify_new_recipe"] is False
