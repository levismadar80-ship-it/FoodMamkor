"""MEH-3914 — a business's public address is confirmed by a person before it goes live.

A business with no slug, no Instagram handle and a name with no Latin letter
used to go live under a machine transliteration nobody saw. Approval and
publish-with-consent now answer 422 `slug_required` with that transliteration
as the suggestion; the admin confirms it (or types another) with `?slug=`.
"""

from conftest import SUBMIT_READY_IMAGE, auth_header, make_producer, make_user

from app.slug_utils import latin_slug

CONSENT = {"consent_confirmed": True, "consent_note": "אישרו בוואטסאפ, 26.11"}


from app.models import User


def _admin(db):
    existing = db.query(User).filter(User.email == "admin3914@example.com").first()
    return existing or make_user(db, role="admin", email="admin3914@example.com")


def _pending(db, instagram=None, slug=None, **kw):
    kw.setdefault("images", [SUBMIT_READY_IMAGE])
    kw.setdefault("phone_verified", True)
    producer = make_producer(db, status="pending", **kw)
    producer.instagram = instagram
    producer.slug = slug
    db.commit()
    return producer


def _approve(client, db, producer, **params):
    return client.post(
        f"/admin/producers/{producer.id}/approve",
        params=params,
        headers=auth_header(_admin(db)),
    )


def test_a_hebrew_name_with_no_instagram_asks_for_the_address(client, db):
    producer = _pending(db, name="סנדרה פרו")
    resp = _approve(client, db, producer)
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert detail["code"] == "slug_required"
    assert detail["suggested"] == latin_slug("סנדרה פרו") != ""
    db.refresh(producer)
    assert producer.status == "pending"
    assert producer.slug is None


def test_the_confirmed_address_is_the_one_that_goes_live(client, db):
    producer = _pending(db, name="סנדרה פרו")
    resp = _approve(client, db, producer, slug="Sandra Perot")
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.status == "approved"
    assert producer.slug == "sandra-perot"


def test_a_hebrew_address_is_refused(client, db):
    producer = _pending(db, name="סנדרה פרו")
    resp = _approve(client, db, producer, slug="סנדרה")
    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "slug_not_latin"
    db.refresh(producer)
    assert producer.status == "pending"


def test_an_instagram_handle_needs_no_confirmation(client, db):
    producer = _pending(db, name="סנדרה פרו", instagram="@sandra.bakes")
    resp = _approve(client, db, producer)
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.slug == "sandra-bakes"


def test_a_latin_name_needs_no_confirmation(client, db):
    producer = _pending(db, name="Sandra's Kitchen")
    assert _approve(client, db, producer).status_code == 200
    db.refresh(producer)
    assert producer.slug and producer.slug.startswith("sandra")


def test_an_existing_slug_is_kept_without_asking(client, db):
    producer = _pending(db, name="סנדרה פרו", slug="sandra-old")
    assert _approve(client, db, producer).status_code == 200
    db.refresh(producer)
    assert producer.slug == "sandra-old"


def test_a_missing_photo_is_reported_before_the_address(client, db):
    producer = _pending(db, name="סנדרה פרו", images=[])
    resp = _approve(client, db, producer)
    assert resp.status_code == 422
    assert isinstance(resp.json()["detail"], str)  # the photo gate's sentence


def test_publish_with_consent_asks_for_the_address_too(client, db):
    draft = make_producer(db, status="draft", name="סנדרה פרו", images=[SUBMIT_READY_IMAGE])
    url = f"/admin/producers/{draft.id}/publish-with-consent"
    resp = client.post(url, json=CONSENT, headers=auth_header(_admin(db)))
    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "slug_required"
    db.refresh(draft)
    assert draft.status == "draft"

    resp = client.post(
        url, params={"slug": "sandra-perot"}, json=CONSENT, headers=auth_header(_admin(db))
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["slug"] == "sandra-perot"
