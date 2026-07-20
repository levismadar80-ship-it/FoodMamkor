"""MEH-1327 — pytest coverage for the favorites-alerts chain (prefs → DB → fan-out).

Pins the contract of `backend/app/routers/alerts.py` that runs in production
without dedicated coverage: GET/PUT prefs, and the `fire_alerts()` fan-out
called from events.py / producer_me.py via BackgroundTasks. Channels are mocked
(monkeypatched) — the real WhatsApp / Web Push transports are exercised
separately (MEH-1326 manual smoke).

The MEH-1191 422 guard (whatsapp_opt_in=true without a phone) is already covered
in tests/test_alerts_optin.py and is NOT duplicated here.

Monkeypatch boundaries:
  - app.routers.alerts.send_template        (module-level import; MEH-1329 —
    favorite alerts go out as the approved utility template favorite_alert_he_v1,
    not free-form send_text)
  - app.services.push.send_push_notification (call-time import)
"""

from uuid import uuid4

from conftest import auth_header, make_producer, make_user

from app.models import AlertLog, Favorite, FavoriteAlert
from app.routers.alerts import fire_alerts
from app.schemas.schemas import AlertContent

_SUB = {"endpoint": "https://push.example/abc", "keys": {"p256dh": "x", "auth": "y"}}


def _favorite(db, user, producer):
    db.add(Favorite(user_id=user.id, producer_id=producer.id))
    db.commit()


def _make_alert(db, user, producer, **flags):
    """Insert a FavoriteAlert row with explicit flags (defaults all-off)."""
    alert = FavoriteAlert(
        user_id=user.id,
        producer_id=producer.id,
        notify_new_product=flags.get("notify_new_product", False),
        notify_new_event=flags.get("notify_new_event", False),
        notify_delivery_area=flags.get("notify_delivery_area", False),
        whatsapp_opt_in=flags.get("whatsapp_opt_in", False),
        push_subscription=flags.get("push_subscription"),
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


# ============================================================
# GET /users/me/favorites/{id}/alerts
# ============================================================


class TestGetAlertPrefs:
    def test_no_row_returns_all_false(self, client, db):
        """GET with no FavoriteAlert row → enabled=false + every flag false."""
        user = make_user(db, email="getempty@example.com")
        producer = make_producer(db, name="Farm Get")
        r = client.get(
            f"/users/me/favorites/{producer.id}/alerts",
            headers=auth_header(user),
        )
        assert r.status_code == 200
        body = r.json()
        assert body == {
            "enabled": False,
            "notify_new_product": False,
            "notify_new_event": False,
            "notify_delivery_area": False,
            "whatsapp_opt_in": False,
            "has_push": False,
        }


# ============================================================
# PUT /users/me/favorites/{id}/alerts
# ============================================================


class TestUpsertAlertPrefs:
    def test_put_without_favorite_returns_400(self, client, db):
        """PUT when the producer is not favorited → 400 (must favorite first)."""
        user = make_user(db, email="nofav@example.com")
        producer = make_producer(db, name="Farm NoFav")
        r = client.put(
            f"/users/me/favorites/{producer.id}/alerts",
            json={"notify_new_product": True},
            headers=auth_header(user),
        )
        assert r.status_code == 400

    def test_put_valid_persists_and_reflects_push(self, client, db):
        """PUT valid → persisted; has_push reflects the push_subscription."""
        user = make_user(db, email="putok@example.com")
        producer = make_producer(db, name="Farm PutOk")
        _favorite(db, user, producer)
        r = client.put(
            f"/users/me/favorites/{producer.id}/alerts",
            json={
                "notify_new_product": True,
                "notify_new_event": False,
                "notify_delivery_area": True,
                "push_subscription": _SUB,
            },
            headers=auth_header(user),
        )
        assert r.status_code == 200
        body = r.json()
        assert body["enabled"] is True
        assert body["notify_new_product"] is True
        assert body["notify_new_event"] is False
        assert body["notify_delivery_area"] is True
        assert body["has_push"] is True

        # Persisted: a subsequent GET reflects the same state.
        r2 = client.get(
            f"/users/me/favorites/{producer.id}/alerts",
            headers=auth_header(user),
        )
        assert r2.json()["has_push"] is True
        assert r2.json()["notify_delivery_area"] is True

        # And the row is really in the DB with the subscription stored.
        row = (
            db.query(FavoriteAlert)
            .filter(
                FavoriteAlert.user_id == user.id,
                FavoriteAlert.producer_id == producer.id,
            )
            .first()
        )
        assert row is not None
        assert row.push_subscription == _SUB


# ============================================================
# fire_alerts() fan-out
# ============================================================


class TestFireAlerts:
    def _content(self):
        return AlertContent(title="כותרת", body="גוף ההודעה", url="/producer/x")

    def test_only_optedin_rows_for_alert_type_receive(self, db, monkeypatch):
        """Only rows opted-in for THIS alert_type are fanned out to."""
        push_calls = []
        monkeypatch.setattr(
            "app.services.push.send_push_notification",
            lambda sub, **kw: push_calls.append(sub),
        )
        monkeypatch.setattr("app.routers.alerts.send_template", lambda to, tmpl: True)

        producer = make_producer(db, name="Farm FanOut")
        opted_in = make_user(db, email="in@example.com")
        opted_out = make_user(db, email="out@example.com")
        # Both have a push subscription so the ONLY difference is the alert_type flag.
        _make_alert(
            db,
            opted_in,
            producer,
            notify_new_event=True,
            push_subscription={"endpoint": "in"},
        )
        _make_alert(
            db,
            opted_out,
            producer,
            notify_new_event=False,
            push_subscription={"endpoint": "out"},
        )

        fire_alerts(db, producer.id, "new_event", self._content())

        assert push_calls == [{"endpoint": "in"}]

    def _capture_template(self, monkeypatch):
        """Monkeypatch send_template to capture (to, template); returns the dict."""
        captured = {}

        def fake_send_template(to, template):
            captured["to"] = to
            captured["template"] = template
            return True

        monkeypatch.setattr("app.routers.alerts.send_template", fake_send_template)
        monkeypatch.setattr(
            "app.services.push.send_push_notification", lambda *a, **k: None
        )
        return captured

    def test_whatsapp_sent_as_template_with_correct_params(self, db, monkeypatch):
        """whatsapp_opt_in + phone → send_template(favorite_alert_he_v1) with the
        MEH-1329 mapping: {{1}} business name, {{2}} clean headline, url_path."""
        captured = self._capture_template(monkeypatch)

        producer = make_producer(db, name="משק הבקר של הראל")
        user = make_user(db, email="wa@example.com")
        user.phone = "0501234567"
        db.commit()
        _make_alert(db, user, producer, notify_new_product=True, whatsapp_opt_in=True)

        content = AlertContent(
            title="מוצר חדש: גבינת עיזים", body="טרי מהיום", url="/p/1"
        )
        fire_alerts(db, producer.id, "new_product", content)

        tmpl = captured["template"]
        assert captured["to"] == "0501234567"
        assert tmpl.name == "favorite_alert_he_v1"
        assert tmpl.producer_name == "משק הבקר של הראל"  # {{1}}
        assert tmpl.update_line == "מוצר חדש: גבינת עיזים"  # {{2}} — the title
        assert tmpl.url_path == "/p/1"
        # content.body carries a newline-prone free text — it is NOT in the WA params.
        assert "טרי מהיום" not in tmpl.update_line
        # The Meta URL button carries only the "/…" path; the domain is on Meta's side.
        assert tmpl.url_path.startswith("/")

        # Meta payload structure: body = exactly [producer_name, update_line] in
        # order; url_path lives ONLY in the url button (NOT a 3rd body param — the
        # bug the to_components() override guards against).
        comps = tmpl.to_components()
        body = next(c for c in comps if c["type"] == "body")
        button = next(c for c in comps if c["type"] == "button")
        assert [p["text"] for p in body["parameters"]] == [
            "משק הבקר של הראל",
            "מוצר חדש: גבינת עיזים",
        ]
        assert button["sub_type"] == "url" and button["index"] == 0
        assert button["parameters"][0]["text"] == "/p/1"

    def test_whatsapp_params_are_sanitized(self, db, monkeypatch):
        """Both template params are sanitized: a leading emoji is stripped and
        whitespace collapsed — for BOTH the title ({{2}}) and the producer name
        ({{1}}, unvalidated free text) — so neither trips Meta 131008."""
        captured = self._capture_template(monkeypatch)

        # Producer name with a leading emoji + doubled internal spaces.
        producer = make_producer(db, name="🐄 משק  הבקר")
        user = make_user(db, email="emoji@example.com")
        user.phone = "0501112222"
        db.commit()
        _make_alert(db, user, producer, notify_new_event=True, whatsapp_opt_in=True)

        content = AlertContent(title="🎉 אירוע חדש: קטיף עצמי", body="ב", url="/e/7")
        fire_alerts(db, producer.id, "new_event", content)

        tmpl = captured["template"]
        # {{2}} — title cleaned
        assert tmpl.update_line == "אירוע חדש: קטיף עצמי"
        assert "🎉" not in tmpl.update_line
        assert "\n" not in tmpl.update_line
        # {{1}} — producer name cleaned the same way
        assert tmpl.producer_name == "משק הבקר"
        assert "🐄" not in tmpl.producer_name

    def test_whatsapp_skipped_when_param_sanitizes_empty(self, db, monkeypatch):
        """An all-emoji producer name collapses to "" after sanitize → the WA
        template send is skipped (an empty Meta param would 131008), while the
        push channel still fires."""
        wa_calls = []
        push_calls = []
        monkeypatch.setattr(
            "app.routers.alerts.send_template", lambda *a, **k: wa_calls.append(1)
        )
        monkeypatch.setattr(
            "app.services.push.send_push_notification",
            lambda *a, **k: push_calls.append(1),
        )

        producer = make_producer(db, name="🎉🥕")  # all-emoji → sanitizes to ""
        user = make_user(db, email="allemoji@example.com")
        user.phone = "0503334444"
        db.commit()
        _make_alert(
            db,
            user,
            producer,
            notify_new_product=True,
            whatsapp_opt_in=True,
            push_subscription=_SUB,
        )

        fire_alerts(db, producer.id, "new_product", self._content())

        assert wa_calls == []  # WhatsApp send skipped — no doomed empty-param template
        assert push_calls == [1]  # push channel unaffected

    def test_push_sent_when_subscription_set(self, db, monkeypatch):
        """push_subscription set → send_push_notification called with content kwargs."""
        calls = []

        def fake_push(sub, *, title, body, url):
            calls.append({"sub": sub, "title": title, "body": body, "url": url})

        monkeypatch.setattr("app.services.push.send_push_notification", fake_push)
        monkeypatch.setattr("app.routers.alerts.send_template", lambda to, tmpl: True)

        producer = make_producer(db, name="Farm Push")
        user = make_user(db, email="push@example.com")
        _make_alert(db, user, producer, notify_new_event=True, push_subscription=_SUB)

        content = AlertContent(title="אירוע", body="שוק", url="/e/9")
        fire_alerts(db, producer.id, "new_event", content)

        assert len(calls) == 1
        assert calls[0]["sub"] == _SUB
        assert calls[0]["title"] == "אירוע"
        assert calls[0]["body"] == "שוק"
        assert calls[0]["url"] == "/e/9"

    def test_one_recipient_exception_does_not_break_loop(self, db, monkeypatch):
        """A raising channel for one recipient must not stop the fan-out (fail-open)."""
        attempted = []

        def flaky_push(sub, **kw):
            attempted.append(sub)
            raise RuntimeError("boom")

        monkeypatch.setattr("app.services.push.send_push_notification", flaky_push)
        monkeypatch.setattr("app.routers.alerts.send_template", lambda to, tmpl: True)

        producer = make_producer(db, name="Farm Failopen")
        u1 = make_user(db, email="r1@example.com")
        u2 = make_user(db, email="r2@example.com")
        _make_alert(db, u1, producer, notify_new_event=True, push_subscription={"e": 1})
        _make_alert(db, u2, producer, notify_new_event=True, push_subscription={"e": 2})

        # Must not raise despite every push blowing up.
        fire_alerts(db, producer.id, "new_event", self._content())

        # Both recipients were attempted — the loop continued past the first failure.
        assert len(attempted) == 2

    def test_unknown_alert_type_is_noop(self, db, monkeypatch):
        """Unknown alert_type → early no-op, no exception, no channel calls."""
        push_calls = []
        wa_calls = []
        monkeypatch.setattr(
            "app.services.push.send_push_notification",
            lambda *a, **k: push_calls.append(1),
        )
        monkeypatch.setattr(
            "app.routers.alerts.send_template", lambda *a, **k: wa_calls.append(1)
        )

        producer = make_producer(db, name="Farm Unknown")
        user = make_user(db, email="unknown@example.com")
        user.phone = "0509999999"
        db.commit()
        _make_alert(
            db,
            user,
            producer,
            notify_new_event=True,
            whatsapp_opt_in=True,
            push_subscription=_SUB,
        )

        # Should simply return without touching any channel.
        fire_alerts(db, producer.id, "bogus_type", self._content())
        # And a fully unrelated producer id is likewise a clean no-op.
        fire_alerts(db, uuid4(), "new_event", self._content())

        assert push_calls == []
        assert wa_calls == []


# ============================================================
# MEH-1360 — delivery_area geographic targeting (target_cities)
# ============================================================


class TestDeliveryAreaTargeting:
    """fire_alerts(..., target_cities=[...]) — only users whose User.city is
    among the newly added cities receive the alert; everyone else is skipped
    BEFORE the MEH-1338 cap, so no AlertLog row is written for them."""

    _BODY = "עכשיו מגיעים גם ל: {cities}"

    def _capture_push(self, monkeypatch):
        calls = []

        def fake_push(sub, *, title, body, url):
            calls.append({"sub": sub, "title": title, "body": body, "url": url})

        monkeypatch.setattr("app.services.push.send_push_notification", fake_push)
        monkeypatch.setattr("app.routers.alerts.send_template", lambda to, tmpl: True)
        return calls

    def _delivery_alert(self, db, producer, *, email, city, **extra):
        user = make_user(db, email=email)
        user.city = city
        db.commit()
        _make_alert(
            db,
            user,
            producer,
            notify_delivery_area=True,
            push_subscription=extra.get("push_subscription", {"endpoint": email}),
            whatsapp_opt_in=extra.get("whatsapp_opt_in", False),
        )
        return user

    def _content(self):
        return AlertContent(
            title="🚚 משלוחים חדשים", body=self._BODY, url="/producer/x"
        )

    def test_matching_city_receives_only_own_city_in_body(self, db, monkeypatch):
        """Two users in different added cities → each gets a body naming only
        THEIR city, never the full added-cities list."""
        calls = self._capture_push(monkeypatch)
        producer = make_producer(db, name="Farm Geo")
        self._delivery_alert(db, producer, email="haifa@example.com", city="חיפה")
        self._delivery_alert(db, producer, email="eilat@example.com", city="אילת")

        fire_alerts(db, producer.id, "delivery_area", self._content(), ["חיפה", "אילת"])

        assert len(calls) == 2
        by_sub = {c["sub"]["endpoint"]: c["body"] for c in calls}
        assert by_sub["haifa@example.com"] == "עכשיו מגיעים גם ל: חיפה"
        assert by_sub["eilat@example.com"] == "עכשיו מגיעים גם ל: אילת"

    def test_non_matching_city_skipped_and_no_alertlog_row(self, db, monkeypatch):
        """A user outside the added cities gets nothing on ANY channel — and no
        AlertLog row is written (a suppressed alert must not cap a future one)."""
        calls = self._capture_push(monkeypatch)
        producer = make_producer(db, name="Farm GeoSkip")
        user = self._delivery_alert(
            db,
            producer,
            email="karmiel@example.com",
            city="כרמיאל",
            whatsapp_opt_in=True,
        )
        user.phone = "0501234567"
        db.commit()

        fire_alerts(db, producer.id, "delivery_area", self._content(), ["אילת"])

        assert calls == []
        assert db.query(AlertLog).count() == 0

    def test_null_or_empty_city_skipped_when_targeted(self, db, monkeypatch):
        """User.city None / whitespace-only → no targeted delivery_area alert."""
        calls = self._capture_push(monkeypatch)
        producer = make_producer(db, name="Farm NoCity")
        self._delivery_alert(db, producer, email="nocity@example.com", city=None)
        self._delivery_alert(db, producer, email="blank@example.com", city="   ")

        fire_alerts(db, producer.id, "delivery_area", self._content(), ["חיפה"])

        assert calls == []

    def test_normalization_tolerates_city_variants(self, db, monkeypatch):
        """Matching survives the notation drift in the cities data: surrounding
        whitespace, hyphen-vs-spaced-dash ("תל אביב-יפו" / "תל אביב – יפו"),
        and letter case for latin entries."""
        calls = self._capture_push(monkeypatch)
        producer = make_producer(db, name="Farm Norm")
        self._delivery_alert(
            db, producer, email="tlv@example.com", city="תל אביב – יפו"
        )
        self._delivery_alert(db, producer, email="latin@example.com", city="  haifa ")

        fire_alerts(
            db, producer.id, "delivery_area", self._content(), ["תל אביב-יפו", "HAIFA"]
        )

        assert len(calls) == 2

    def test_untargeted_call_behavior_unchanged(self, db, monkeypatch):
        """target_cities omitted → pre-MEH-1360 behavior: a user WITHOUT a city
        still receives, and the body is passed through verbatim."""
        calls = self._capture_push(monkeypatch)
        producer = make_producer(db, name="Farm Untargeted")
        self._delivery_alert(db, producer, email="legacy@example.com", city=None)

        content = AlertContent(title="ט", body="גוף כמו שהוא", url="/p/9")
        fire_alerts(db, producer.id, "delivery_area", content)

        assert len(calls) == 1
        assert calls[0]["body"] == "גוף כמו שהוא"

    def test_other_alert_types_unaffected(self, db, monkeypatch):
        """new_event / new_product call sites don't pass target_cities — a user
        with no city keeps receiving them exactly as before. Two producers so
        the MEH-1338 per-(user, producer, channel) cap can't mask the result."""
        calls = self._capture_push(monkeypatch)
        p_event = make_producer(db, name="Farm OtherEvent")
        p_product = make_producer(db, name="Farm OtherProduct")
        user = make_user(db, email="event@example.com")
        _make_alert(db, user, p_event, notify_new_event=True, push_subscription=_SUB)
        _make_alert(
            db, user, p_product, notify_new_product=True, push_subscription=_SUB
        )

        fire_alerts(db, p_event.id, "new_event", self._content())
        fire_alerts(db, p_product.id, "new_product", self._content())

        assert len(calls) == 2
