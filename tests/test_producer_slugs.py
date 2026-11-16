"""MEH-3336 — Latin producer slugs + 301 from old slugs.

Covers:
  - the helper: Latin only, ≤40 chars, Instagram handle first, transliteration
    otherwise, "" when nothing survives.
  - every create path mints a Latin slug: admin create (suggested and typed)
    and publish-time minting on approval.
  - collision → the town is appended, not "-2".
  - a typed slug must be Latin (admin create and admin update → 422).
  - old slug → the by-slug lookup answers 404 + {code: slug_moved, slug}; a
    deleted business stays 410, an unknown slug stays a plain 404, a renamed
    business that is no longer public does not redirect.
  - non-admin cannot set a slug through the admin route (403).
"""

from app.models.models import Producer
from app.services.producer_approval import _ensure_unique_slug, _mint_slug_if_absent
from app.slug_utils import LATIN_SLUG_MAX, is_latin_slug, latin_slug
from tests.conftest import auth_header, make_producer, make_user


def _admin(db):
    return make_user(db, role="admin")


# --- helper -----------------------------------------------------------------


def test_latin_slug_prefers_the_instagram_handle():
    assert (
        latin_slug("סנדרה פירות איכותיים", instagram="@sandra.perot") == "sandra-perot"
    )
    assert (
        latin_slug("x", instagram="https://instagram.com/Shikui_Herbals/")
        == "shikui-herbals"
    )


def test_latin_slug_transliterates_hebrew_into_ascii():
    for name in (
        "סנדרה פירות איכותיים",
        "חוות הדגן",
        "שיקוי",
        "Café Noir ☕",
        "עין איילה",
    ):
        slug = latin_slug(name)
        assert slug, name
        assert is_latin_slug(slug), (name, slug)


def test_latin_slug_caps_at_40_on_a_word_boundary():
    slug = latin_slug("אבג " * 30)
    assert len(slug) <= LATIN_SLUG_MAX
    assert not slug.endswith("-")
    assert is_latin_slug(slug)


def test_latin_slug_is_empty_when_nothing_survives():
    assert latin_slug("!!!") == ""
    assert latin_slug("") == ""


# --- collision → town -----------------------------------------------------------


def test_collision_appends_the_town_not_a_number(db):
    first = make_producer(db, name="א")
    first.slug = "sandra-perot"
    db.commit()
    slug = _ensure_unique_slug(db, "sandra-perot", city="פרדס חנה-כרכור")
    assert slug.startswith("sandra-perot-")
    assert not slug.endswith("-2")
    assert is_latin_slug(slug)


def test_counter_is_only_the_last_resort(db):
    a = make_producer(db, name="א")
    a.slug = "x"
    db.commit()
    b = make_producer(db, name="ב")
    b.slug = _ensure_unique_slug(db, "x", city="חדרה")
    db.commit()
    third = _ensure_unique_slug(db, "x", city="חדרה")
    assert third == f"{b.slug}-2"


# --- create paths ---------------------------------------------------------------


def _admin_create_payload(**overrides):
    payload = {
        "name": "סנדרה פירות איכותיים",
        "description": "פירות אורגניים ישירות מהחקלאי",
        "city": "פרדס חנה-כרכור",
        "phone": "0522518862",
    }
    payload.update(overrides)
    return payload


def test_admin_create_mints_a_latin_slug(client, db):
    resp = client.post(
        "/admin/producers",
        json=_admin_create_payload(),
        headers=auth_header(_admin(db)),
    )
    assert resp.status_code in (200, 201), resp.text
    assert is_latin_slug(resp.json()["slug"]), resp.json()["slug"]


def test_admin_create_keeps_a_typed_latin_slug(client, db):
    resp = client.post(
        "/admin/producers",
        json=_admin_create_payload(slug="sandra-perot"),
        headers=auth_header(_admin(db)),
    )
    assert resp.status_code in (200, 201), resp.text
    assert resp.json()["slug"] == "sandra-perot"


def test_admin_create_rejects_a_hebrew_slug(client, db):
    resp = client.post(
        "/admin/producers",
        json=_admin_create_payload(slug="סנדרה-פירות"),
        headers=auth_header(_admin(db)),
    )
    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "slug_not_latin"


def test_admin_update_rejects_a_hebrew_slug_and_keeps_the_old(client, db):
    producer = make_producer(db)
    producer.slug = "old-latin"
    db.commit()
    resp = client.put(
        f"/admin/producers/{producer.id}",
        json={"slug": "סנדרה"},
        headers=auth_header(_admin(db)),
    )
    assert resp.status_code == 422
    db.refresh(producer)
    assert producer.slug == "old-latin"


def test_non_admin_cannot_set_a_slug(client, db):
    producer = make_producer(db)
    owner = make_user(db, role="producer")
    owner.producer_id = producer.id
    db.commit()
    resp = client.put(
        f"/admin/producers/{producer.id}",
        json={"slug": "taken-over"},
        headers=auth_header(owner),
    )
    assert resp.status_code == 403


def test_approval_mints_a_latin_slug(db):
    producer = make_producer(db, name="חוות הדגן", status="pending")
    producer.slug = None
    db.commit()
    _mint_slug_if_absent(db, producer)
    assert is_latin_slug(producer.slug), producer.slug


def test_approval_prefers_the_instagram_handle(db):
    producer = make_producer(db, name="סנדרה פירות איכותיים", status="pending")
    producer.slug = None
    producer.instagram = "sandraperot"
    db.commit()
    _mint_slug_if_absent(db, producer)
    assert producer.slug == "sandraperot"


# --- old slug → 301 -----------------------------------------------------------


def _rename(client, db, producer, new_slug):
    resp = client.put(
        f"/admin/producers/{producer.id}",
        json={"slug": new_slug},
        headers=auth_header(_admin(db)),
    )
    assert resp.status_code == 200, resp.text


def test_old_slug_points_at_the_new_one(client, db):
    producer = make_producer(db)
    producer.slug = "סנדרה-פירות-איכותיים-2"  # a legacy Hebrew slug
    db.commit()
    _rename(client, db, producer, "sandra-perot")

    live = client.get("/producers/by-slug/sandra-perot")
    assert live.status_code == 200

    old = client.get("/producers/by-slug/סנדרה-פירות-איכותיים-2")
    assert old.status_code == 404
    assert old.json()["detail"]["code"] == "slug_moved"
    assert old.json()["detail"]["slug"] == "sandra-perot"


def test_two_renames_both_point_at_the_current_slug(client, db):
    producer = make_producer(db)
    producer.slug = "first-name"
    db.commit()
    _rename(client, db, producer, "second-name")
    _rename(client, db, producer, "third-name")
    for old in ("first-name", "second-name"):
        body = client.get(f"/producers/by-slug/{old}").json()
        assert body["detail"]["slug"] == "third-name", old


def test_unknown_slug_is_a_plain_404(client, db):
    resp = client.get("/producers/by-slug/never-existed")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "בית עסק לא נמצא"


def test_renamed_business_that_is_no_longer_public_does_not_redirect(client, db):
    producer = make_producer(db)
    producer.slug = "was-public"
    db.commit()
    _rename(client, db, producer, "now-hidden")
    db.query(Producer).filter(Producer.id == producer.id).update(
        {"status": "suspended"}
    )
    db.commit()
    resp = client.get("/producers/by-slug/was-public")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "בית עסק לא נמצא"


def test_deleted_business_is_still_410(client, db):
    producer = make_producer(db)
    producer.slug = "gone-business"
    db.commit()
    resp = client.delete(
        f"/admin/producers/{producer.id}", headers=auth_header(_admin(db))
    )
    assert resp.status_code in (200, 204), resp.text
    assert client.get("/producers/by-slug/gone-business").status_code == 410


# --- review follow-ups (MEH-3336) ---------------------------------------------


def test_a_collision_slug_stays_within_40_and_latin(db):
    base = latin_slug("אבג " * 30)  # a full 40-char base
    assert len(base) == LATIN_SLUG_MAX or len(base) >= 35
    taker = make_producer(db, name="א")
    taker.slug = base
    db.commit()
    slug = _ensure_unique_slug(db, base, city="קריית שמונה עלית")
    assert slug != base
    assert len(slug) <= LATIN_SLUG_MAX, slug
    assert is_latin_slug(slug), slug
    numbered_taker = make_producer(db, name="ב")
    numbered_taker.slug = slug
    db.commit()
    third = _ensure_unique_slug(db, base, city="קריית שמונה עלית")
    assert len(third) <= LATIN_SLUG_MAX and is_latin_slug(third), third


def test_a_non_handle_instagram_value_falls_back_to_the_name():
    for junk in (
        "m.instagram.com/sandra",
        "instagram.com/p/Cxyz123",
        "linktr.ee/sandra",
    ):
        assert latin_slug("חוות הדגן", instagram=junk) == "choot-hdgn", junk
    assert latin_slug("x", instagram="@sandra.perot") == "sandra-perot"


def test_static_routes_are_reserved():
    from app.slug_utils import is_reserved

    for route in ("home", "rescue", "recommend", "registration", "delivery-waitlist"):
        assert is_reserved(route), route


def test_a_business_on_a_legacy_hebrew_slug_stays_editable(client, db):
    """The admin form resends the stored slug on every save; the Latin rule
    applies only when the slug CHANGES (reverting the `!=` reds this)."""
    producer = make_producer(db)
    producer.slug = "סנדרה-פירות-איכותיים-2"
    db.commit()
    resp = client.put(
        f"/admin/producers/{producer.id}",
        json={"slug": "סנדרה-פירות-איכותיים-2", "description": "תיאור חדש לגמרי"},
        headers=auth_header(_admin(db)),
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.slug == "סנדרה-פירות-איכותיים-2"


def test_a_hebrew_slug_refusal_carries_a_hebrew_message(client, db):
    resp = client.post(
        "/admin/producers",
        json=_admin_create_payload(slug="סנדרה"),
        headers=auth_header(_admin(db)),
    )
    assert resp.status_code == 422
    assert "אנגלית" in resp.json()["detail"]["message"]
