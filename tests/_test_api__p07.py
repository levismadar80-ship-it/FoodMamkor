"""Part 7 of 7 of `tests/test_api.py`: TestMeh1167KashrutCard.

Moved here verbatim by the MEH-3540 mechanical split. Not collected
directly (no `test_` prefix): `tests/test_api.py` imports these tests, so
their node ids stay `tests/test_api.py::...`. Run them with
`pytest tests/test_api.py` (add `-k <ClassName>` to narrow).
"""

from conftest import auth_header
from conftest import make_producer
from conftest import make_user

class TestMeh1167KashrutCard:
    """MEH-1167 — kashrut-request card backend: GET own requests + cert upload.

    The POST /producers/me/kashrut-request already existed (MEH-51); this
    ticket adds the read endpoint (dashboard status zone) + the dedicated
    cert-upload endpoint (no freemium gate). Own-list is producer-isolated;
    upload mirrors /upload/owner-photo's sniff + cap.
    """

    def _producer_owner(self, db, *, email, plan="free", images=None):
        from conftest import make_user

        producer = make_producer(db, images=images)
        producer.plan = plan
        user = make_user(db, email=email, role="producer")
        user.producer_id = producer.id
        db.commit()
        return user, producer

    def _seed_request(self, db, producer, badge_code, status="pending"):
        from app.models.models import KashrutBadgeRequest

        req = KashrutBadgeRequest(
            producer_id=producer.id, badge_code=badge_code, status=status
        )
        db.add(req)
        db.commit()
        return req

    # ---- GET /producers/me/kashrut-requests ----

    def test_own_requests_happy_newest_first(self, client, db):
        user, producer = self._producer_owner(db, email="kr_happy@test.com")
        self._seed_request(db, producer, "rabanut")
        self._seed_request(db, producer, "badatz", status="rejected")
        resp = client.get(
            "/producers/me/kashrut-requests", headers=auth_header(user)
        )
        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 2
        # newest first — badatz was inserted last.
        assert body[0]["badge_code"] == "badatz"
        assert {r["badge_code"] for r in body} == {"rabanut", "badatz"}

    def test_own_requests_empty(self, client, db):
        user, _ = self._producer_owner(db, email="kr_empty@test.com")
        resp = client.get(
            "/producers/me/kashrut-requests", headers=auth_header(user)
        )
        assert resp.status_code == 200
        assert resp.json() == []

    def test_own_requests_producer_isolation(self, client, db):
        """A producer sees only her OWN requests, never another producer's."""
        mine, _ = self._producer_owner(db, email="kr_mine@test.com")
        _, other_producer = self._producer_owner(db, email="kr_other@test.com")
        self._seed_request(db, other_producer, "mehadrin")
        resp = client.get(
            "/producers/me/kashrut-requests", headers=auth_header(mine)
        )
        assert resp.status_code == 200
        assert resp.json() == []

    def test_own_requests_non_producer_forbidden(self, client, db):
        from conftest import make_user

        consumer = make_user(db, email="kr_cons@test.com", role="consumer")
        resp = client.get(
            "/producers/me/kashrut-requests", headers=auth_header(consumer)
        )
        assert resp.status_code == 403

    def test_own_requests_requires_auth(self, client):
        assert client.get("/producers/me/kashrut-requests").status_code == 401

    # ---- POST /upload/kashrut-cert ----

    def test_cert_upload_happy(self, client, db):
        import io

        user, _ = self._producer_owner(db, email="cert_happy@test.com")
        fake_jpg = b"\xff\xd8\xff" + b"\x00" * 100
        resp = client.post(
            "/upload/kashrut-cert",
            files={"file": ("cert.jpg", io.BytesIO(fake_jpg), "image/jpeg")},
            headers=auth_header(user),
        )
        assert resp.status_code == 200
        assert resp.json()["url"]

    def test_cert_upload_no_freemium_gate_full_gallery(self, client, db):
        """A free-plan producer with a full 3-image gallery (blocked on
        /upload/image) can still upload a cert — the whole reason this
        endpoint exists, mirroring /upload/owner-photo."""
        import io

        user, _ = self._producer_owner(
            db,
            email="cert_cap@test.com",
            images=[
                "https://res.cloudinary.com/test/img/0.jpg",
                "https://res.cloudinary.com/test/img/1.jpg",
                "https://res.cloudinary.com/test/img/2.jpg",
            ],
        )
        fake_jpg = b"\xff\xd8\xff" + b"\x00" * 100
        # MEH-3220: /upload/image no longer carries the gallery cap (it moved
        # to PUT /producers/me), so the old 403 control is gone.
        ok = client.post(
            "/upload/kashrut-cert",
            files={"file": ("cert.jpg", io.BytesIO(fake_jpg), "image/jpeg")},
            headers=auth_header(user),
        )
        assert ok.status_code == 200

    def test_cert_upload_oversized(self, client, db):
        import io

        user, _ = self._producer_owner(db, email="cert_big@test.com")
        big = b"\xff\xd8\xff" + b"\x00" * (5 * 1024 * 1024 + 1)
        resp = client.post(
            "/upload/kashrut-cert",
            files={"file": ("big.jpg", io.BytesIO(big), "image/jpeg")},
            headers=auth_header(user),
        )
        assert resp.status_code == 400

    def test_cert_upload_non_image(self, client, db):
        import io

        user, _ = self._producer_owner(db, email="cert_pdf@test.com")
        fake_pdf = b"%PDF-1.4" + b"\x00" * 100
        resp = client.post(
            "/upload/kashrut-cert",
            files={"file": ("doc.pdf", io.BytesIO(fake_pdf), "application/pdf")},
            headers=auth_header(user),
        )
        assert resp.status_code == 400

    def test_cert_upload_requires_auth(self, client):
        import io

        resp = client.post(
            "/upload/kashrut-cert",
            files={
                "file": ("c.jpg", io.BytesIO(b"\xff\xd8\xff" + b"\x00" * 100), "image/jpeg")
            },
        )
        assert resp.status_code == 401
