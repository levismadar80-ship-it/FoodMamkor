"""MEH-2520 — the public verification signals say only what is still true.

Two promises the public page makes, and the fact each one now depends on:

* «העסק חתם על הצהרה מחייבת» (verification_tier="declared", the explainer at
  ProducerHeader.jsx) — renders only when `declared_at` is set. An admin-built
  business nobody claimed signed nothing; before this change it got the
  sentence anyway, because the tier looked at categories only.
* «מאומת» (verification_tier="verified") — drops when the licence expiry the
  admin captured (`license_expires_at`, MEH-2072) has passed. The business
  stays listed; only the badge goes. NULL expiry = not captured, not expired.

The `?verified` listing filter uses the same predicate, so it cannot keep
listing a business under «מאומת» whose page no longer shows the badge.

Clock: every date is relative to `israel_today()` (testing.md, MEH-2290).
"""

from datetime import date, datetime, timedelta, timezone

from app.utils.clock import israel_today
from tests.conftest import make_category, make_producer


def _tier(client, producer):
    resp = client.get(f"/producers/{producer.id}")
    assert resp.status_code == 200, resp.text
    return resp.json()["verification_tier"]


def _verify(db, producer, *, expires=None):
    producer.verified_at = datetime.now(timezone.utc)
    producer.verification_doc_type = "license"
    producer.license_expires_at = expires
    db.commit()


def _listed_names(client, **params):
    resp = client.get("/producers", params=params)
    assert resp.status_code == 200, resp.text
    return {p["name"] for p in resp.json()}


# --- «חתם על הצהרה מחייבת» -------------------------------------------------


def test_exempt_business_without_a_signed_declaration_is_not_declared(client, db):
    cat = make_category(db, name="ירקות")  # exempt from licensing
    producer = make_producer(db, name="עסק שהאדמין בנתה", category=cat)
    assert producer.declared_at is None
    assert _tier(client, producer) is None


def test_exempt_business_with_a_signed_declaration_is_declared(client, db):
    cat = make_category(db, name="ירקות")
    producer = make_producer(db, name="עסק שחתם", category=cat)
    producer.declared_at = datetime.now(timezone.utc)
    db.commit()
    assert _tier(client, producer) == "declared"


def test_licence_category_with_a_declaration_is_still_not_declared(client, db):
    # A signature does not replace a licence: one licence-required category
    # still excludes "declared" (MEH-762 D3), signed or not.
    cat = make_category(db, name="בשר")
    producer = make_producer(db, name="קצביה שחתמה", category=cat)
    producer.declared_at = datetime.now(timezone.utc)
    db.commit()
    assert _tier(client, producer) is None


def test_declared_at_stays_off_the_public_payload(client, db):
    cat = make_category(db, name="ירקות")
    producer = make_producer(db, name="עסק פרטי", category=cat)
    producer.declared_at = datetime.now(timezone.utc)
    db.commit()
    body = client.get(f"/producers/{producer.id}").json()
    assert "declared_at" not in body
    assert "license_expires_at" not in body


# --- «מאומת» and the licence expiry ---------------------------------------


def test_lapsed_licence_drops_the_verified_badge(client, db):
    cat = make_category(db, name="בשר")
    producer = make_producer(db, name="רישיון שפג", category=cat)
    _verify(db, producer, expires=israel_today() - timedelta(days=1))
    assert _tier(client, producer) is None


def test_lapsed_licence_on_exempt_signed_business_falls_back_to_declared(client, db):
    cat = make_category(db, name="ירקות")
    producer = make_producer(db, name="פטור שחתם ורישיונו פג", category=cat)
    producer.declared_at = datetime.now(timezone.utc)
    db.commit()
    _verify(db, producer, expires=israel_today() - timedelta(days=1))
    assert _tier(client, producer) == "declared"


def test_licence_expiring_today_is_still_verified(client, db):
    cat = make_category(db, name="בשר")
    producer = make_producer(db, name="תוקף עד היום", category=cat)
    _verify(db, producer, expires=israel_today())
    assert _tier(client, producer) == "verified"


def test_no_captured_expiry_stays_verified(client, db):
    cat = make_category(db, name="בשר")
    producer = make_producer(db, name="בלי תאריך תפוגה", category=cat)
    _verify(db, producer, expires=None)
    assert _tier(client, producer) == "verified"


def test_verified_filter_agrees_with_the_badge(client, db):
    cat = make_category(db, name="בשר")
    current = make_producer(db, name="מאומת בתוקף", category=cat)
    _verify(db, current, expires=israel_today() + timedelta(days=30))
    lapsed = make_producer(db, name="מאומת שפג", category=cat)
    _verify(db, lapsed, expires=israel_today() - timedelta(days=1))
    make_producer(db, name="לא מאומת", category=cat)

    # The listing payload carries the same tier as the detail page.
    listing = client.get("/producers").json()
    tiers = {p["name"]: p["verification_tier"] for p in listing}
    assert tiers["מאומת בתוקף"] == "verified"
    assert tiers["מאומת שפג"] is None

    verified = _listed_names(client, verified="true")
    assert "מאומת בתוקף" in verified
    assert "מאומת שפג" not in verified

    unverified = _listed_names(client, verified="false")
    assert "מאומת שפג" in unverified
    assert "לא מאומת" in unverified
    assert "מאומת בתוקף" not in unverified


def test_expiry_boundary_with_the_clock_frozen_at_the_utc_edge(client, db, monkeypatch):
    # 21:30 UTC is already the next Israel day (testing.md). Freeze the
    # consumer's clock so "today" and "yesterday" are the Israel ones,
    # whatever hour the suite runs.
    import app.services.verification_status as vs

    frozen = date(2026, 10, 26)  # the Monday after the October clock change
    monkeypatch.setattr(vs, "israel_today", lambda: frozen)
    cat = make_category(db, name="בשר")
    today = make_producer(db, name="תוקף עד היום הקפוא", category=cat)
    _verify(db, today, expires=frozen)
    lapsed = make_producer(db, name="פג אתמול הקפוא", category=cat)
    _verify(db, lapsed, expires=frozen - timedelta(days=1))

    assert _tier(client, today) == "verified"
    assert _tier(client, lapsed) is None
    verified = _listed_names(client, verified="true")
    assert "תוקף עד היום הקפוא" in verified
    assert "פג אתמול הקפוא" not in verified


def test_a_dict_input_keeps_the_tier_it_carries(client, db):
    # Pins the wrap validator's non-ORM branch. A dict (FastAPI re-validating
    # a returned model, a cache) never carries declared_at/license_expires_at,
    # so the validator must keep the tier it was given, not recompute it.
    from app.schemas.schemas import ProducerListOut

    cat = make_category(db, name="בשר")
    producer = make_producer(db, name="מאומת לדיקט", category=cat)
    _verify(db, producer, expires=israel_today() + timedelta(days=30))
    payload = client.get(f"/producers/{producer.id}").json()
    assert payload["verification_tier"] == "verified"

    assert ProducerListOut.model_validate(payload).verification_tier == "verified"
    payload["verification_tier"] = None
    assert ProducerListOut.model_validate(payload).verification_tier is None
