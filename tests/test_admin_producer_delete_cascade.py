"""MEH-510: cascade story_card destroy in admin_delete_producer.

Verifies that DELETE /admin/producers/{id} captures producer.story_card_url
BEFORE the cascade and calls destroy_image(url, bypass_reserved=True) AFTER
db.commit() succeeds. The bypass_reserved=True flag is the opt-out from the
mehamakor/producers/* reject list — necessary because the producer is gone
and the slot is now an orphan (the cleanup script's reject is for live
story-cards, which this path explicitly is not).

Pattern: monkeypatch `app.cloudinary_utils.destroy_image` to a recorder.
admin.py imports destroy_image lazily inside the handler
(`from app.cloudinary_utils import destroy_image` at admin.py:~279), so
patching the source-module attribute propagates per Python's
`from X import Y` re-binding semantics — verified explicitly before
this test was written.
"""

from tests.conftest import auth_header, make_producer, make_user


_STORY_CARD_URL = (
    "https://res.cloudinary.com/mehamakor/image/upload/v1/"
    "mehamakor/producers/abc-uuid/story-card.jpg"
)


def test_admin_delete_producer_cascades_story_card_destroy(client, db, monkeypatch):
    admin = make_user(db, role="admin")
    producer = make_producer(db)
    producer.story_card_url = _STORY_CARD_URL
    db.commit()
    producer_id = str(producer.id)

    calls: list[dict] = []

    def fake_destroy(url, bypass_reserved=False):
        calls.append({"url": url, "bypass_reserved": bypass_reserved})
        return True

    # admin.py lazy-imports destroy_image inside admin_delete_producer.
    # Patching the source module attribute is what the lazy import resolves.
    from app import cloudinary_utils

    monkeypatch.setattr(cloudinary_utils, "destroy_image", fake_destroy)

    resp = client.delete(f"/admin/producers/{producer_id}", headers=auth_header(admin))

    assert resp.status_code == 200
    assert resp.json() == {"detail": "Producer deleted"}

    # Story-card destroy MUST be present in the recorded calls AND must
    # carry bypass_reserved=True. Other captured-URL destroys (gallery
    # images, products) may or may not exist depending on producer setup;
    # this test is scoped to the story-card cascade specifically.
    story_card_calls = [c for c in calls if c["url"] == _STORY_CARD_URL]
    assert len(story_card_calls) == 1, (
        f"expected exactly one destroy call for story_card_url, got "
        f"{len(story_card_calls)}; full call list: {calls}"
    )
    assert story_card_calls[0]["bypass_reserved"] is True, (
        f"story-card destroy MUST pass bypass_reserved=True (the "
        f"reject list would otherwise no-op the call); got: "
        f"{story_card_calls[0]}"
    )


def test_admin_delete_producer_with_no_story_card_still_calls_destroy(
    client, db, monkeypatch
):
    # Producer with story_card_url=None — the cascade should still call
    # destroy_image(None, bypass_reserved=True). The helper handles None
    # internally and returns True without reaching Cloudinary, so the call
    # is harmless and keeps the cascade code branch-free.
    admin = make_user(db, role="admin")
    producer = make_producer(db)
    # Don't set story_card_url; default is None.
    producer_id = str(producer.id)

    calls: list[dict] = []

    def fake_destroy(url, bypass_reserved=False):
        calls.append({"url": url, "bypass_reserved": bypass_reserved})
        return True

    from app import cloudinary_utils

    monkeypatch.setattr(cloudinary_utils, "destroy_image", fake_destroy)

    resp = client.delete(f"/admin/producers/{producer_id}", headers=auth_header(admin))

    assert resp.status_code == 200
    # The story_card_url=None destroy call should still appear with bypass=True.
    none_with_bypass = [
        c for c in calls if c["url"] is None and c["bypass_reserved"] is True
    ]
    assert len(none_with_bypass) == 1, (
        f"expected exactly one bypass=True call with url=None for the "
        f"story-card slot; full call list: {calls}"
    )
