"""MEH-3611: a business's logo — saved by its owner, public on the business.

The logo is a Cloudinary URL the owner uploaded herself (/upload/image) and
saved with PUT /producers/me. Another business's image is refused (MEH-3247),
a non-image URL is refused (the owner-photo guard), a replaced logo is freed
in Cloudinary, and the public business read carries it.
"""

from __future__ import annotations

from unittest.mock import patch

from app.services import image_ownership as io
from conftest import auth_header, make_submit_ready_producer

_CLOUD = "https://res.cloudinary.com/test-cloud/image/upload"


def _own_url(user, name="0123456789abcdef0123456789abcdef"):
    return f"{_CLOUD}/v1/mehamakor/u/{io.owner_key(user.id)}/{name}.jpg"


def _put(client, owner, body):
    return client.put("/producers/me", json=body, headers=auth_header(owner))


def test_owner_saves_her_own_logo_and_the_public_page_shows_it(client, db):
    shop, owner = make_submit_ready_producer(db, status="approved")
    logo = _own_url(owner)

    resp = _put(client, owner, {"logo_url": logo})

    assert resp.status_code == 200, resp.text
    db.refresh(shop)
    assert shop.logo_url == logo
    public = client.get(f"/producers/{shop.id}")
    assert public.status_code == 200, public.text
    assert public.json()["logo_url"] == logo


def test_no_logo_reads_null(client, db):
    shop, _owner = make_submit_ready_producer(db, status="approved")
    assert client.get(f"/producers/{shop.id}").json()["logo_url"] is None


def test_another_business_image_is_refused_in_hebrew(client, db):
    _a, owner_a = make_submit_ready_producer(db, status="approved")
    _b, owner_b = make_submit_ready_producer(db, status="approved")

    resp = _put(client, owner_a, {"logo_url": _own_url(owner_b)})

    assert resp.status_code == 403, resp.text
    assert resp.json()["detail"] == io.OWN_IMAGE_DETAIL


def test_a_non_image_url_is_refused(client, db):
    # The owner-photo guard (MEH-1222): a bare filename taken for a host. A
    # javascript: URL would be refused by the scheme check alone; this case
    # needs the image-URL rule itself.
    _shop, owner = make_submit_ready_producer(db, status="approved")
    resp = _put(client, owner, {"logo_url": "https://bread.jpg"})
    assert resp.status_code == 422, resp.text


def test_a_replaced_logo_is_freed_and_an_unchanged_one_is_not(client, db):
    shop, owner = make_submit_ready_producer(db, status="approved")
    first = _own_url(owner, "a" * 32)
    second = _own_url(owner, "b" * 32)
    assert _put(client, owner, {"logo_url": first}).status_code == 200

    with patch("app.cloudinary_utils.destroy_image") as destroy:
        assert _put(client, owner, {"logo_url": first}).status_code == 200
        destroy.assert_not_called()
        assert _put(client, owner, {"logo_url": second}).status_code == 200
        assert destroy.call_args.args[0] == first

    with patch("app.cloudinary_utils.destroy_image") as destroy:
        assert _put(client, owner, {"logo_url": None}).status_code == 200
        assert destroy.call_args.args[0] == second
    db.refresh(shop)
    assert shop.logo_url is None


def test_admin_replacing_a_logo_frees_the_old_one(client, db):
    from conftest import make_user

    shop, _owner = make_submit_ready_producer(db, status="approved")
    shop.logo_url = f"{_CLOUD}/v1/mehamakor/u/x/old.png"
    db.commit()
    admin = make_user(db, role="admin", email="logo-admin@example.com")

    with patch("app.cloudinary_utils.destroy_image") as destroy:
        r = client.put(
            f"/admin/producers/{shop.id}",
            json={"logo_url": f"{_CLOUD}/v1/mehamakor/u/x/new.png"},
            headers=auth_header(admin),
        )
        assert r.status_code == 200, r.text
        assert [
            c.args[0]
            for c in destroy.call_args_list
            if "logo" in c.kwargs.get("context", "")
        ] == [f"{_CLOUD}/v1/mehamakor/u/x/old.png"]


def test_deleting_the_account_frees_the_logo(client, db):
    from conftest import make_producer, make_user

    shop = make_producer(db, name="Logo Farm", status="approved")
    shop.logo_url = f"{_CLOUD}/v1/mehamakor/u/x/logo.png"
    user = make_user(db, role="producer", email="logo-owner@example.com")
    user.producer_id = shop.id
    db.commit()

    with patch("app.cloudinary_utils.destroy_image") as destroy:
        r = client.post(
            "/auth/me/delete",
            json={"password": "Zx7Yp9Mq2Lr4"},
            headers=auth_header(user),
        )
        assert r.status_code == 200, r.text
        assert f"{_CLOUD}/v1/mehamakor/u/x/logo.png" in [
            c.args[0] for c in destroy.call_args_list
        ]
