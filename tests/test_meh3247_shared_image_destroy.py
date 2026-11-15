"""MEH-3247 (grill B2) — removing a photo never destroys an asset another row still uses.

The bug: every image cleanup destroyed the Cloudinary asset behind the URL
that left a row, with no ownership check. Owner A could put business B's
photo URL into her own gallery (PUT /producers/me `images`), remove it, and
the post-commit cleanup destroyed B's asset.

The fix (services/image_refs.py): before destroying, the cleanup asks the DB
whether ANY row still references that public_id. Every cleanup runs after
its commit, so the caller's own row no longer holds the URL; anything that
still does is someone else's live photo, and the destroy is skipped.

Cloudinary itself is replaced by a recorder on `cloudinary.uploader.destroy`.
"""

from __future__ import annotations

import ast
import pathlib
import re

import pytest

from app import cloudinary_utils
from app.models.models import Base, HomeProduct, Product
from app.services import image_refs

from conftest import auth_header, make_submit_ready_producer

_B_PHOTO = "https://res.cloudinary.com/demo/image/upload/v1/mehamakor/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg"
_B_PUBLIC_ID = "mehamakor/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
_A_EXTRA = "https://res.cloudinary.com/demo/image/upload/v1/mehamakor/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg"
_A_EXTRA_PUBLIC_ID = "mehamakor/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"


@pytest.fixture
def destroyed(monkeypatch):
    """Cloudinary 'configured', and every destroy recorded by public_id."""
    import cloudinary.uploader

    monkeypatch.setattr(
        cloudinary_utils.settings, "cloudinary_cloud_name", "test-cloud"
    )
    calls: list[str] = []

    def fake_destroy(public_id, **_kw):
        calls.append(public_id)
        return {"result": "ok"}

    monkeypatch.setattr(cloudinary.uploader, "destroy", fake_destroy)
    return calls


def _two_businesses(db):
    a, owner_a = make_submit_ready_producer(db, status="approved")
    b, _owner_b = make_submit_ready_producer(db, status="approved")
    return a, owner_a, b


def _put_images(client, owner, images):
    resp = client.put(
        "/producers/me", json={"images": images}, headers=auth_header(owner)
    )
    assert resp.status_code == 200, resp.text
    return resp


def test_removing_another_business_gallery_photo_does_not_destroy_it(
    client, db, destroyed
):
    a, owner_a, b = _two_businesses(db)
    b.images = [_B_PHOTO]
    db.commit()
    a_own = list(a.images)

    _put_images(client, owner_a, a_own + [_B_PHOTO])
    _put_images(client, owner_a, a_own)

    assert _B_PUBLIC_ID not in destroyed, "B's live gallery photo was destroyed"


def test_removing_another_business_product_photo_does_not_destroy_it(
    client, db, destroyed
):
    a, owner_a, b = _two_businesses(db)
    db.add(Product(producer_id=b.id, name="לחם מחמצת", image_url=_B_PHOTO))
    db.commit()
    a_own = list(a.images)

    _put_images(client, owner_a, a_own + [_B_PHOTO])
    _put_images(client, owner_a, a_own)

    assert _B_PUBLIC_ID not in destroyed, "B's live product photo was destroyed"


def test_removing_own_unshared_photo_still_destroys_it(client, db, destroyed):
    """The control: the guard must not turn every cleanup into a no-op."""
    a, owner_a, _b = _two_businesses(db)
    a_own = list(a.images)

    _put_images(client, owner_a, a_own + [_A_EXTRA])
    _put_images(client, owner_a, a_own)

    assert destroyed == [_A_EXTRA_PUBLIC_ID]


def test_account_deletion_still_destroys_own_unshared_photos(client, db, destroyed):
    """Reviewer (rule 5a): the deletion path runs the REAL reference check.

    If the destroy ran before the deletion commit, the user's own rows would
    still hold the URLs, the check would skip them, and nothing else goes red.
    """
    a, owner_a, b = _two_businesses(db)
    a.images = [_A_EXTRA, _B_PHOTO]
    b.images = [_B_PHOTO]
    db.commit()

    resp = client.delete("/auth/me", headers=auth_header(owner_a))
    assert resp.status_code == 200, resp.text

    assert _A_EXTRA_PUBLIC_ID in destroyed, "own unshared photo was not destroyed"
    assert _B_PUBLIC_ID not in destroyed, "B's live photo was destroyed"


def test_a_url_with_a_query_or_transform_still_counts_as_a_reference(db):
    """The match is by public_id, parsed the same way on both sides."""
    _a, _owner_a, b = _two_businesses(db)
    b.images = [
        "https://res.cloudinary.com/demo/image/upload/w_400,c_fill/v9/"
        + _B_PUBLIC_ID
        + "?x=1",
        "https://res.cloudinary.com/demo/image/upload/v1/mehamakor/other.jpg",
    ]
    db.commit()

    assert image_refs.referenced_public_ids(db, {_B_PUBLIC_ID}) == {_B_PUBLIC_ID}


def test_a_longer_id_with_the_same_prefix_is_not_a_reference(db):
    _a, _owner_a, b = _two_businesses(db)
    b.owner_photo_url = (
        "https://res.cloudinary.com/demo/image/upload/v1/mehamakor/owner/owner_12.jpg"
    )
    db.commit()

    assert image_refs.referenced_public_ids(db, {"mehamakor/owner/owner_1"}) == set()


def test_home_product_cover_change_keeps_a_photo_still_in_its_gallery(db, destroyed):
    """home_products.py destroyed the old cover even when it stayed in `images`."""
    _a, owner_a, _b = _two_businesses(db)
    hp_images = [_A_EXTRA, _B_PHOTO]
    db.add(
        HomeProduct(user_id=owner_a.id, title="ריבה", photo=_B_PHOTO, images=hp_images)
    )
    db.commit()

    cloudinary_utils.destroy_image(_B_PHOTO, context="test", db=db)

    assert destroyed == []


def test_reference_check_failure_skips_the_destroy_and_does_not_raise(
    db, destroyed, monkeypatch
):
    def boom(*_a, **_k):
        raise RuntimeError("db down")

    monkeypatch.setattr(image_refs, "_referenced_in_column", boom)

    assert cloudinary_utils.destroy_image(_A_EXTRA, context="test", db=db) is False
    cloudinary_utils.destroy_removed_images([_A_EXTRA], [], context="test", db=db)
    assert destroyed == [], "an unverifiable reference must fail closed (no destroy)"


# ── Guards: the protection cannot be bypassed by a new call site or column ──

_BACKEND_APP = pathlib.Path(__file__).resolve().parent.parent / "backend" / "app"


def test_every_destroy_call_in_the_app_passes_db():
    missing: list[str] = []
    found = 0
    for path in _BACKEND_APP.rglob("*.py"):
        if path.name == "cloudinary_utils.py":
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            fn = node.func
            name = fn.attr if isinstance(fn, ast.Attribute) else getattr(fn, "id", None)
            if name not in ("destroy_image", "destroy_removed_images"):
                continue
            found += 1
            if not any(kw.arg == "db" for kw in node.keywords):
                missing.append(f"{path.relative_to(_BACKEND_APP)}:{node.lineno}")
    assert found >= 8, f"control: expected the known call sites, found {found}"
    assert missing == [], f"destroy without db= (no reference check): {missing}"


_IMAGE_NAME = re.compile(r"image|photo|avatar|cover|logo|card|cert|_url$")
# Columns whose name matches but that never hold a Cloudinary asset.
_EXEMPT = {
    ("events", "registration_url"): "external sign-up link",
    ("experiences", "registration_url"): "external sign-up link",
    ("producers", "coverage_cta_enabled"): "boolean flag, matched on 'cover'",
    ("producers", "organic_certified"): "boolean flag, matched on 'cert'",
}


def test_every_image_like_column_is_in_the_registry_or_exempt():
    registered = {
        (col.class_.__tablename__, col.key)
        for col in image_refs.SCALAR_URL_SOURCES + image_refs.ARRAY_URL_SOURCES
    }
    unclassified = []
    for table in Base.metadata.sorted_tables:
        for column in table.columns:
            key = (table.name, column.name)
            if not _IMAGE_NAME.search(column.name):
                continue
            if key in registered or key in _EXEMPT:
                continue
            unclassified.append(key)
    assert len(registered) >= 12, "control: the registry itself went missing"
    assert unclassified == [], (
        "an image-like column is neither checked before a destroy nor exempted "
        f"with a reason: {unclassified}"
    )
