"""MEH-3894: one pick for "the business's photo" on every card.

- `first_image` skips blank / whitespace entries (the old
  `(images or [None])[0]` handed a blank first entry to the card).
- Experiences carry `owner_image_url` (the host business's photo), so a
  photo-less experience falls back to it like an event (MEH-2546).
"""

from app.services.producer_images import first_image
from conftest import auth_header, make_producer
from _test_experiences__common import _make_experience, _make_host
from _test_group_buys_api__common import _make_group_buy, _producer_user

A = "https://res.cloudinary.com/x/a.jpg"
B = "https://res.cloudinary.com/x/b.jpg"


class TestFirstImage:
    def test_none_and_empty(self):
        assert first_image(None) is None
        assert first_image([]) is None
        assert first_image(["", "  ", None]) is None

    def test_one(self):
        assert first_image([A]) == A

    def test_many_skips_blank_and_trims(self):
        assert first_image(["", "  ", f" {B} ", A]) == B


class TestExperienceOwnerImage:
    def _by_title(self, client):
        return {e["title"]: e for e in client.get("/experiences").json()}

    def test_photo_less_experience_carries_the_host_business_photo(self, client, db):
        host = _make_host(db)
        host.producer.images = ["  ", A, B]
        db.commit()
        _make_experience(db, host, title="NoPic", status="approved", image_url=None)
        row = self._by_title(client)["NoPic"]
        assert row["image_url"] is None
        assert row["owner_image_url"] == A

    def test_host_business_without_photos_is_null(self, client, db):
        host = _make_host(db)
        host.producer.images = []
        db.commit()
        _make_experience(db, host, title="Bare", status="approved", image_url=None)
        assert self._by_title(client)["Bare"]["owner_image_url"] is None

    def test_detail_carries_it_too(self, client, db):
        host = _make_host(db)
        host.producer.images = [A]
        db.commit()
        ex = _make_experience(db, host, title="One", status="approved", image_url=None)
        assert client.get(f"/experiences/{ex.id}").json()["owner_image_url"] == A

    def test_pending_host_business_photo_is_not_sent(self, client, db):
        """Only a public business lends its photo: a pending one stays private,
        read through the owner path (public lists already hide it, MEH-1749)."""
        host = _make_host(db, producer_status="pending")
        host.producer.images = [A]
        db.commit()
        _make_experience(db, host, title="Pending", status="approved", image_url=None)
        rows = client.get("/experiences/mine", headers=auth_header(host)).json()
        assert [r["owner_image_url"] for r in rows if r["title"] == "Pending"] == [None]


class TestGroupBuyBlankFirstPhoto:
    def test_blank_first_entry_falls_to_the_next_photo(self, client, db):
        producer, _ = _producer_user(db, email="gb-3894@test.com")
        producer.images = ["", B]
        db.commit()
        gb = _make_group_buy(db, producer)
        assert client.get(f"/group-buys/{gb.id}").json()["producer_image_url"] == B



class TestSearchAndListShapes:
    def test_search_hit_skips_a_blank_first_photo(self, client, db):
        make_producer(db, name="מאפיית הבדיקה", images=["  ", B])
        hits = client.get("/search", params={"q": "מאפיית"}).json()["producers"]
        assert [h["image"] for h in hits if h["name"] == "מאפיית הבדיקה"] == [B]

    def test_list_carries_the_logo(self, client, db):
        """MEH-3894: a card with no photo shows the logo, so the list sends it."""
        p = make_producer(db, name="עסק עם לוגו", images=[])
        p.logo_url = A
        db.commit()
        rows = {r["id"]: r for r in client.get("/producers").json()}
        assert rows[str(p.id)]["logo_url"] == A
