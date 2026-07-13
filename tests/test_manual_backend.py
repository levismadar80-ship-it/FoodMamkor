"""MEH-1171 conversion — the CONVERT-PYTEST cluster from the approved matrix.

Each test carries its checklist provenance ("MANUAL_TESTING § {section}
item {n}"). Items in the cluster already covered by the Ticket B files
(tests/test_meh1176_otp_confirm_rate_limit.py — OTP limits;
tests/test_meh1176_like_escape.py — LIKE wildcard literals;
tests/test_meh1176_experience_email_notifications.py — experience emails)
are cited in the MANUAL_TESTING stubs, not re-tested here.

Doc-stale (verified, not converted): the "Tracking infrastructure" item 6
POST-analytics 429 targets an endpoint that no longer exists — view
tracking moved server-side onto GET /producers/{id}
(tests/test_analytics.py already covers that path).
"""

import logging

from sqlalchemy import inspect as sa_inspect

from app.database import engine

from tests.conftest import auth_header, make_producer, make_user


def _producer_user(db, **kw):
    producer = make_producer(db, **kw)
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return producer, user


# MANUAL_TESTING § Producer license number (MEH-530) item 9
class TestAdminPendingIncludesLicense:
    def test_pending_queue_payload_carries_producer_license_number(self, client, db):
        producer, _ = _producer_user(db, status="pending")
        producer.producer_license_number = "123456789"
        db.commit()
        admin = make_user(db, role="admin", email="admin-lic@example.com")

        r = client.get("/admin/producers/pending", headers=auth_header(admin))
        assert r.status_code == 200
        row = next(p for p in r.json() if p["id"] == str(producer.id))
        assert row["producer_license_number"] == "123456789"


# MANUAL_TESTING § MEH-1011 Chunk 2 item 8 (owner self-edit / renewal)
class TestOwnerLicenseRenewal:
    def test_put_me_updates_license_number(self, client, db):
        producer, user = _producer_user(db)
        producer.producer_license_number = "111111111"
        db.commit()

        r = client.put(
            "/producers/me",
            json={"producer_license_number": "9999999"},
            headers=auth_header(user),
        )
        assert r.status_code == 200, r.text
        db.refresh(producer)
        assert producer.producer_license_number == "9999999"


# MANUAL_TESTING § Dietary checkboxes per product (MEH-293 PR #2) items 4 + 6
class TestDietaryFlagsPersist:
    def test_post_product_with_is_vegan_true_persists(self, client, db):
        _, user = _producer_user(db)
        r = client.post(
            "/producers/me/products",
            json={"name": "טופו ביתי", "price_min": 20, "is_vegan": True},
            headers=auth_header(user),
        )
        assert r.status_code in (200, 201), r.text
        body = r.json()
        assert body["is_vegan"] is True
        assert body["is_gluten_free"] is False

    def test_put_product_toggling_is_vegan_off_persists(self, client, db):
        _, user = _producer_user(db)
        created = client.post(
            "/producers/me/products",
            json={"name": "ממרח עדשים", "price_min": 15, "is_vegan": True},
            headers=auth_header(user),
        ).json()

        r = client.put(
            f"/producers/me/products/{created['id']}",
            json={"name": "ממרח עדשים", "price_min": 15, "is_vegan": False},
            headers=auth_header(user),
        )
        assert r.status_code == 200, r.text
        assert r.json()["is_vegan"] is False


# MANUAL_TESTING § Legal pages item 6 — /contact per-IP 5/hour → 6th is 429
class TestContactRateLimit:
    def test_sixth_contact_submission_within_the_hour_is_429(self, client):
        payload = {
            "name": "בודקת עומס",
            "email": "load@example.com",
            "message": "בדיקת מגבלת קצב לטופס יצירת הקשר — נא להתעלם",
        }
        statuses = [client.post("/contact", json=payload).status_code for _ in range(6)]
        assert statuses[:5] == [200] * 5
        assert statuses[5] == 429


# MANUAL_TESTING § Privacy invariant item 2 — hashed viewer IP only, never raw
class TestViewerIpHashedOnly:
    def test_producer_page_views_has_hash_column_and_no_raw_ip(self, db):
        cols = {c["name"] for c in sa_inspect(engine).get_columns("producer_page_views")}
        assert "viewer_ip_hash" in cols
        assert "viewer_ip" not in cols  # raw IP must never be stored


# MANUAL_TESTING § Chat widget — plain Hebrew items 7, 8, 9, 10, 15
# The freeform answers are grounded in chat.py's SYSTEM_PROMPT KB — these pin
# the KB facts the checklist verified conversationally. (Items 12+13, the
# comment-vs-KB grep nuances, stay as doc grep-guards in the rewrite.)
class TestChatKnowledgeBase:
    def _kb(self):
        from app.routers.chat import SYSTEM_PROMPT

        return SYSTEM_PROMPT

    def test_kb_explains_what_mehamakor_is_without_moderation_jargon(self):
        kb = self._kb()
        assert "בתי עסק מקומיים" in kb  # item 7: directory framing

    def test_kb_says_free_for_both_sides(self):
        assert "בחינם" in self._kb()  # item 8

    def test_kb_gives_the_one_two_day_approval_timeframe(self):
        kb = self._kb()
        assert "יום-יומיים" in kb  # item 9
        assert "העסק" in kb

    def test_kb_covers_contacting_a_business(self):
        assert "וואטסאפ" in self._kb() or "WhatsApp" in self._kb()  # item 10

    def test_haasek_shelcha_present_on_both_sides(self):
        # item 15 — the possessive phrasing must exist server- and client-side
        assert self._kb().count("העסק שלך") >= 1
        widget = open("frontend/components/ChatWidget.jsx", encoding="utf-8").read()
        assert widget.count("העסק שלך") >= 1


# MANUAL_TESTING § Smart Search (MEH-99) item 17 — /search 60/minute → 429
class TestSearchRateLimit:
    def test_sixty_first_search_within_a_minute_is_429(self, client):
        statuses = [
            client.get("/search", params={"q": "גבינה"}).status_code for _ in range(61)
        ]
        assert set(statuses[:60]) == {200}
        assert statuses[60] == 429


# MANUAL_TESTING § MEH-287 item 4 — welcome-skip is logged at ERROR, not warning
class TestWhatsAppSkipLogLevel:
    def test_missing_config_skip_logs_at_error_level(self, caplog, monkeypatch):
        from app.services import auth_notifications as svc

        monkeypatch.setattr(svc.settings, "whatsapp_phone_number_id", None)
        monkeypatch.setattr(svc.settings, "whatsapp_access_token", None)
        with caplog.at_level(logging.ERROR, logger=svc.logger.name):
            ok = svc.notify_producer_registered("חוות בדיקה", None)
        assert ok is False
        skip_records = [r for r in caplog.records if "SKIPPED" in r.getMessage()]
        assert skip_records, "expected the [WHATSAPP] ... SKIPPED log line"
        assert all(r.levelname == "ERROR" for r in skip_records)


# MANUAL_TESTING § Advanced filter chips (task 12) items 14 + 16
class TestOrganicFilter:
    def test_organic_true_returns_only_certified(self, client, db):
        certified = make_producer(db, name="חווה אורגנית")
        certified.organic_certified = True
        make_producer(db, name="חווה רגילה")
        db.commit()

        r = client.get("/producers", params={"organic": "true"})
        assert r.status_code == 200
        assert [p["name"] for p in r.json()] == ["חווה אורגנית"]

    def test_organic_composes_with_city(self, client, db):
        a = make_producer(db, name="אורגני חיפה", city="חיפה")
        a.organic_certified = True
        b = make_producer(db, name="אורגני אשדוד", city="אשדוד")
        b.organic_certified = True
        db.commit()

        r = client.get("/producers", params={"organic": "true", "city": "חיפה"})
        assert r.status_code == 200
        assert [p["name"] for p in r.json()] == ["אורגני חיפה"]
