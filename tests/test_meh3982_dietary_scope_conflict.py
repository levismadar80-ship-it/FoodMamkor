"""MEH-3982 — «טבעוני / צמחוני: כן» on an animal category is named in the
admin's sensitive-edit ping. The save itself is never blocked or changed.

| categories          | vegan_scope saved | extra key in ping?            |
|---------------------|-------------------|-------------------------------|
| none                | all               | no                            |
| honey               | all               | vegan_scope_animal_category   |
| honey               | some              | no                            |
| veg + honey (many)  | all               | vegan_scope_animal_category   |
| veg                 | all               | no                            |
| fish                | vegetarian all    | vegetarian_scope_animal_cat.  |
| dairy               | vegetarian all    | no (dairy is vegetarian)      |
"""

import re
from pathlib import Path
from unittest.mock import patch

import pytest

from app.services.dietary_scope_conflict import (
    NON_VEGAN_CATEGORY_SLUGS,
    NON_VEGETARIAN_CATEGORY_SLUGS,
)
from tests.conftest import auth_header, make_category, make_producer, make_user

PATCH_TARGET = "app.services.producer_owner_update.notify_admin_producer_sensitive_edit"


def _owner(db, slugs):
    producer = make_producer(db, name="דבש הבדיקה", status="approved")
    for slug in slugs:
        cat = make_category(db, name=f"קטגוריה {slug}")
        cat.slug = slug
        producer.categories.append(cat)
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user, producer


def _changed_after(client, db, slugs, body):
    user, producer = _owner(db, slugs)
    with patch(PATCH_TARGET) as ping:
        resp = client.put("/producers/me", json=body, headers=auth_header(user))
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    for field, value in body.items():
        assert getattr(producer, field) == value, "the save must stand as sent"
    ping.assert_called_once()
    return ping.call_args.args[1]


@pytest.mark.parametrize(
    ("slugs", "body", "expected"),
    [
        ([], {"vegan_scope": "all"}, ["vegan_scope"]),
        (["honey"], {"vegan_scope": "all"}, ["vegan_scope", "vegan_scope_animal_category"]),
        (["honey"], {"vegan_scope": "some"}, ["vegan_scope"]),
        (["veg", "honey"], {"vegan_scope": "all"}, ["vegan_scope", "vegan_scope_animal_category"]),
        (["veg"], {"vegan_scope": "all"}, ["vegan_scope"]),
        (["fish"], {"vegetarian_scope": "all"}, ["vegetarian_scope", "vegetarian_scope_animal_category"]),
        (["dairy"], {"vegetarian_scope": "all"}, ["vegetarian_scope"]),
    ],
    ids=["no-category", "honey-yes", "honey-no", "veg+honey-yes", "veg-yes", "fish-vegetarian", "dairy-vegetarian"],
)
def test_conflict_key_rides_the_ping(client, db, slugs, body, expected):
    assert _changed_after(client, db, slugs, body) == expected


def test_the_conflict_reads_as_hebrew_in_the_admin_email():
    from app.services import auth_notifications as an

    with patch.object(an, "send_email") as send, patch.object(an.settings, "admin_email", "a@example.com"):
        an.notify_admin_producer_sensitive_edit("דבש", ["vegan_scope", "vegan_scope_animal_category"])
    body = send.call_args.args[2]
    assert "קטגוריה מן החי" in body
    assert "vegan_scope_animal_category" not in body


def _js_list(name):
    src = Path(__file__).resolve().parents[1].joinpath("frontend/lib/dietary-scope-conflict.js").read_text()
    # Source-text read on purpose: a constant shared with a JS file that pytest cannot run.
    m = re.search(rf"export const {name} = \[(.*?)\];", src)
    assert m, name
    return frozenset(re.findall(r'"([a-z]+)"', m.group(1)))


def test_frontend_lists_equal_backend_lists():
    assert _js_list("NON_VEGAN_CATEGORY_SLUGS") == NON_VEGAN_CATEGORY_SLUGS
    assert _js_list("NON_VEGETARIAN_CATEGORY_SLUGS") == NON_VEGETARIAN_CATEGORY_SLUGS
