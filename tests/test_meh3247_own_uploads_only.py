"""MEH-3247 part 2 — a user may store only Cloudinary photos she uploaded herself.

Part 1 (#4617) stopped a cleanup from destroying a photo another row still
uses. That left the hot-link itself: business A could put business B's photo
URL on her own page, and B's photo then outlived B's account deletion.

Uploads now land in a per-uploader folder (`mehamakor/u/<owner_key>/`), and
every write that stores an image URL refuses a NEW URL in our namespace that
is not in the caller's own folder (services/image_ownership.py).
"""

from __future__ import annotations

import importlib.util
import inspect
import sys
from pathlib import Path

import pytest

from app.services import image_ownership as io
from conftest import auth_header, make_submit_ready_producer, make_user

_CLOUD = "https://res.cloudinary.com/test-cloud/image/upload"
_HEB = io.OWN_IMAGE_DETAIL


def _own_url(user, name="0123456789abcdef0123456789abcdef"):
    return f"{_CLOUD}/v1/mehamakor/u/{io.owner_key(user.id)}/{name}.jpg"


# ── The URL rule, case by case ──────────────────────────────────────────────


@pytest.fixture
def two_users(db):
    a = make_user(db, email="own-a@example.com")
    b = make_user(db, email="own-b@example.com")
    return a, b


def test_own_upload_is_allowed(two_users):
    a, _b = two_users
    assert io.is_allowed_new_url(a, _own_url(a))


def test_someone_elses_upload_is_refused(two_users):
    a, b = two_users
    assert not io.is_allowed_new_url(a, _own_url(b))


def test_legacy_flat_folder_photo_is_refused_as_a_new_url(two_users):
    a, _b = two_users
    assert not io.is_allowed_new_url(a, f"{_CLOUD}/v1/mehamakor/{'b' * 32}.jpg")


@pytest.mark.parametrize(
    "tail",
    [
        "?x=/placeholder",  # extract_public_id treats '/placeholder' as external
        "#frag",
    ],
)
def test_a_query_or_fragment_never_passes(two_users, tail):
    a, b = two_users
    assert not io.is_allowed_new_url(a, _own_url(b) + tail)
    assert not io.is_allowed_new_url(a, _own_url(a) + tail)


def test_dot_dot_out_of_your_folder_is_refused(two_users):
    a, _b = two_users
    url = f"{_CLOUD}/mehamakor/u/{io.owner_key(a.id)}/../../{'b' * 32}.jpg"
    assert not io.is_allowed_new_url(a, url)


def test_an_overlay_transform_is_refused(two_users):
    a, b = two_users
    url = (
        f"{_CLOUD}/l_mehamakor:u:{io.owner_key(b.id)}:x/"
        f"mehamakor/u/{io.owner_key(a.id)}/{'a' * 32}.jpg"
    )
    assert not io.is_allowed_new_url(a, url)


@pytest.mark.parametrize("transform", ["q_auto", "e_grayscale", "t_thumb", "w_400"])
def test_a_leading_transformation_is_refused(two_users, transform):
    """Reviewer (rule 5a): `q_auto/` made the id look outside our namespace."""
    a, b = two_users
    url = f"{_CLOUD}/{transform}/v1/mehamakor/u/{io.owner_key(b.id)}/{'b' * 32}.jpg"
    assert not io.is_allowed_new_url(a, url)
    legacy = f"{_CLOUD}/{transform}/mehamakor/{'b' * 32}.jpg"
    assert not io.is_allowed_new_url(a, legacy)


@pytest.mark.parametrize(
    "host", ["res.cloudinar%79.com", "res.\uff43loudinary.com", "RES.CLOUDINARY.COM"]
)
def test_a_disguised_cloudinary_host_is_refused(two_users, host):
    a, b = two_users
    url = (
        f"https://{host}/test-cloud/image/upload/mehamakor/u/{io.owner_key(b.id)}/x.jpg"
    )
    assert not io.is_allowed_new_url(a, url)


def test_a_longer_key_with_your_key_as_prefix_is_refused(two_users):
    a, _b = two_users
    url = f"{_CLOUD}/mehamakor/u/{io.owner_key(a.id)}5/{'a' * 32}.jpg"
    assert not io.is_allowed_new_url(a, url)


def test_a_photo_outside_our_namespace_keeps_todays_behaviour(two_users):
    """res.cloudinary.com/demo/.../sample.jpg cannot map to one of our assets."""
    a, _b = two_users
    assert io.is_allowed_new_url(
        a, "https://res.cloudinary.com/demo/image/upload/sample.jpg"
    )
    assert io.is_allowed_new_url(a, "https://example.com/bread.jpg")
    assert io.is_allowed_new_url(a, "/placeholder-image.png?name=ab12cd34")


def test_another_cloud_with_our_namespace_is_still_checked(two_users):
    a, b = two_users
    url = f"https://res.cloudinary.com/demo/image/upload/mehamakor/u/{io.owner_key(b.id)}/x.jpg"
    assert not io.is_allowed_new_url(a, url)


def test_fixed_avatar_id_belongs_only_to_its_user(two_users):
    a, b = two_users
    assert io.is_allowed_new_url(a, f"{_CLOUD}/v3/mehamakor/avatars/user_{a.id}.jpg")
    assert not io.is_allowed_new_url(
        a, f"{_CLOUD}/v3/mehamakor/avatars/user_{b.id}.jpg"
    )


def test_owner_key_is_not_the_user_id(two_users):
    a, _b = two_users
    assert str(a.id) not in io.owner_key(a.id)


# ── Through the routes ──────────────────────────────────────────────────────


def _put(client, owner, body):
    return client.put("/producers/me", json=body, headers=auth_header(owner))


def test_gallery_refuses_another_business_photo_in_hebrew(client, db):
    a, owner_a = make_submit_ready_producer(db, status="approved")
    _b, owner_b = make_submit_ready_producer(db, status="approved")

    resp = _put(client, owner_a, {"images": list(a.images) + [_own_url(owner_b)]})

    assert resp.status_code == 403, resp.text
    assert resp.json()["detail"] == _HEB


def test_gallery_accepts_own_upload(client, db):
    a, owner_a = make_submit_ready_producer(db, status="approved")

    resp = _put(client, owner_a, {"images": list(a.images) + [_own_url(owner_a)]})

    assert resp.status_code == 200, resp.text


def test_a_photo_already_on_the_row_still_saves(client, db):
    """Grandfathered: an existing flat-folder URL does not block a re-save."""
    a, owner_a = make_submit_ready_producer(db, status="approved")
    legacy = f"{_CLOUD}/v1/mehamakor/{'c' * 32}.jpg"
    a.images = list(a.images) + [legacy]
    db.commit()

    resp = _put(client, owner_a, {"images": list(a.images)})

    assert resp.status_code == 200, resp.text


def test_owner_photo_refuses_another_business_photo(client, db):
    _a, owner_a = make_submit_ready_producer(db, status="approved")
    b, _owner_b = make_submit_ready_producer(db, status="approved")

    resp = _put(
        client,
        owner_a,
        {"owner_photo_url": f"{_CLOUD}/v2/mehamakor/owner/owner_{b.id}.jpg"},
    )

    assert resp.status_code == 403, resp.text


def test_product_refuses_another_business_photo(client, db):
    _a, owner_a = make_submit_ready_producer(db, status="approved")
    _b, owner_b = make_submit_ready_producer(db, status="approved")

    resp = client.post(
        "/producers/me/products",
        json={"name": "לחם מחמצת", "price_min": "20", "image_url": _own_url(owner_b)},
        headers=auth_header(owner_a),
    )

    assert resp.status_code == 403, resp.text


def test_avatar_refuses_another_users_avatar(client, db, two_users):
    a, b = two_users

    resp = client.patch(
        "/users/me",
        json={"avatar_url": f"{_CLOUD}/v3/mehamakor/avatars/user_{b.id}.jpg"},
        headers=auth_header(a),
    )

    assert resp.status_code == 403, resp.text


def test_admin_may_store_any_photo():
    admin = type("U", (), {"role": "admin", "id": "x", "producer_id": None})()
    io.assert_own_new_images(admin, f"{_CLOUD}/mehamakor/{'b' * 32}.jpg")


# ── Guard: a new route that stores an image URL cannot skip the check ──────

ROOT = Path(__file__).resolve().parent.parent
_SPEC = importlib.util.spec_from_file_location(
    "action_map", ROOT / "scripts" / "release" / "action_map.py"
)
am = importlib.util.module_from_spec(_SPEC)
sys.modules.setdefault("action_map", am)
_SPEC.loader.exec_module(am)

IMAGE_FIELDS = {
    "images",
    "image_url",
    "photo",
    "photo_url",
    "cert_url",
    "avatar_url",
    "owner_photo_url",
    "story_card_url",
}
# Routes whose body carries an image field but that need no ownership check.
_EXEMPT = {
    "admin_create_producer": "admin only (require_admin)",
    "admin_update_producer": "admin only (require_admin)",
    "admin_create_draft_product": "admin only (require_admin)",
}


def _image_routes():
    found = []
    for methods, path, endpoint, dep in am._iter_api_routes(am.load_app()):
        for bp in dep.body_params:
            fields = getattr(bp.field_info.annotation, "model_fields", {})
            hit = IMAGE_FIELDS & set(fields)
            if hit:
                found.append((sorted(methods), path, endpoint, sorted(hit)))
    return found


def _checked_fields(source: str) -> set[str]:
    """Image field names that appear inside an assert_own_new_images(...) call.

    Reviewer (rule 5a): a bare substring search passed a comment, or a call on
    the wrong field. The call's own text (up to its closing paren) must name
    each image field the route's body carries.
    """
    checked: set[str] = set()
    for chunk in source.split("assert_own_new_images(")[1:]:
        depth, end = 1, 0
        for i, ch in enumerate(chunk):
            depth += ch == "("
            depth -= ch == ")"
            if depth == 0:
                end = i
                break
        call = chunk[:end]
        checked |= {f for f in IMAGE_FIELDS if f in call}
    return checked


def test_every_route_that_stores_an_image_checks_ownership():
    routes = _image_routes()
    assert len(routes) >= 12, f"control: route walk found only {len(routes)}"
    missing = []
    for m, p, ep, fields in routes:
        if ep.__name__ in _EXEMPT:
            continue
        unchecked = set(fields) - _checked_fields(inspect.getsource(ep))
        if unchecked:
            missing.append(f"{m} {p} ({ep.__name__}): {sorted(unchecked)}")
    assert missing == [], (
        f"stores an image URL without assert_own_new_images: {missing}"
    )
