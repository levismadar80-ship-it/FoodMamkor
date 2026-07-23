"""MEH-1288 — GET /producers/random (homepage "הפתיעו אותי" button).

Covers: approved-only selection, {id, slug} shape, empty-catalog 404, and the
route-ordering guard (that "random" is not swallowed by /producers/{producer_id}).
"""

from conftest import make_producer


class TestProducerRandom:
    def test_returns_approved_producer_id_and_slug(self, client, db):
        p = make_producer(db, name="חוות הפתעה")
        p.slug = "havat-haftaa"
        db.commit()

        res = client.get("/producers/random")
        assert res.status_code == 200
        body = res.json()
        assert body["id"] == str(p.id)
        assert body["slug"] == "havat-haftaa"
        # minimal contract — only id + slug are exposed
        assert set(body.keys()) == {"id", "slug"}

    def test_never_returns_non_approved(self, client, db):
        approved = make_producer(db, name="מאושרת", status="approved")
        make_producer(db, name="ממתינה", status="pending")
        make_producer(db, name="נדחתה", status="rejected")

        # Only one approved producer exists, so random() must always pick it.
        for _ in range(8):
            res = client.get("/producers/random")
            assert res.status_code == 200
            assert res.json()["id"] == str(approved.id)

    def test_empty_catalog_returns_404(self, client, db):
        make_producer(db, name="ממתינה", status="pending")

        res = client.get("/producers/random")
        assert res.status_code == 404

    def test_slug_null_is_allowed(self, client, db):
        p = make_producer(db, name="בלי סלאג")
        # slug defaults to None — the id fallback path on the client.
        res = client.get("/producers/random")
        assert res.status_code == 200
        body = res.json()
        assert body["id"] == str(p.id)
        assert body["slug"] is None
