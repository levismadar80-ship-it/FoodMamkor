"""Part 4 of 7 of `tests/test_api.py`: TestWhatsAppClickTracking, TestProducerReviews, TestAvatarUpload, TestProfilePhone, TestReservedSlugs, TestDoubleSubmitIdempotency, TestCloudinaryHebrewErrors, TestOwnerStoryFields, TestVacationBadgeClear.

Moved here verbatim by the MEH-3540 mechanical split. Not collected
directly (no `test_` prefix): `tests/test_api.py` imports these tests, so
their node ids stay `tests/test_api.py::...`. Run them with
`pytest tests/test_api.py` (add `-k <ClassName>` to narrow).
"""

from app.models.models import ProducerReview
from app.models.models import ProducerWhatsAppClick
from app.models.models import User
from app.utils.clock import israel_today
from conftest import auth_header
from conftest import make_producer
from conftest import make_user
from conftest import valid_review_payload

# ---------- WhatsApp Click Tracking ----------

class TestWhatsAppClickTracking:
    """POST /producers/{id}/whatsapp-click — anonymous + optional-auth tracking.

    Verifies:
    - Anonymous click records a row with user_id=None
    - Authenticated click records a row with the correct user_id
    - Unknown producer returns 404
    - Dashboard endpoint counts the last-7d clicks correctly
    """

    def test_anonymous_click_records_row(self, client, db):
        p = make_producer(db)
        resp = client.post(f"/producers/{p.id}/whatsapp-click")
        assert resp.status_code == 200
        row = db.query(ProducerWhatsAppClick).first()
        assert row is not None
        assert row.producer_id == p.id
        assert row.user_id is None

    def test_authenticated_click_records_user_id(self, client, db):
        p = make_producer(db)
        user = make_user(db, email="clicker@test.com")
        resp = client.post(
            f"/producers/{p.id}/whatsapp-click",
            headers=auth_header(user),
        )
        assert resp.status_code == 200
        row = db.query(ProducerWhatsAppClick).first()
        assert row is not None
        assert row.user_id == user.id

    def test_unknown_producer_returns_404(self, client):
        resp = client.post(
            "/producers/00000000-0000-0000-0000-000000000000/whatsapp-click"
        )
        assert resp.status_code == 404

    def test_dashboard_counts_weekly_clicks(self, client, db):
        """whatsapp_clicks_week reflects rows recorded in the last 7 days."""
        p = make_producer(db)
        user = make_user(db, email="prod@test.com", role="producer")
        user.producer_id = p.id
        db.commit()

        # Record 3 clicks
        for _ in range(3):
            client.post(f"/producers/{p.id}/whatsapp-click")

        resp = client.get("/producers/me/dashboard", headers=auth_header(user))
        assert resp.status_code == 200
        assert resp.json()["whatsapp_clicks_week"] == 3


# ---------- Producer Reviews ----------

class TestProducerReviews:
    """POST /producers/{id}/reviews — WhatsApp gate, moderation, pagination.

    Gate rule: first-time reviewer must have a ProducerWhatsAppClick row
    with user_id matching the caller. Existing reviewers (updating) bypass
    the gate.
    """

    def _make_click(self, db, producer, user):
        """Helper: insert a whatsapp click row for a user+producer pair."""
        click = ProducerWhatsAppClick(
            producer_id=producer.id,
            user_id=user.id,
        )
        db.add(click)
        db.commit()
        return click

    def test_get_reviews_empty(self, client, db):
        p = make_producer(db)
        resp = client.get(f"/producers/{p.id}/reviews")
        assert resp.status_code == 200
        body = resp.json()
        assert body["reviews"] == []
        assert body["total"] == 0
        assert body["page"] == 1
        assert body["pages"] == 1

    def test_post_review_requires_whatsapp_click(self, client, db):
        """No prior WhatsApp click → 403."""
        p = make_producer(db)
        user = make_user(db, email="norclick@test.com")
        resp = client.post(
            f"/producers/{p.id}/reviews",
            json={"stars": 5, "body": "מוצר טוב מאוד, ממליצה בחום!"},
            headers=auth_header(user),
        )
        assert resp.status_code == 403

    def test_post_review_allowed_after_whatsapp_click(self, client, db):
        """User who clicked WhatsApp → 201, review stored."""
        p = make_producer(db)
        user = make_user(db, email="clicker@test.com")
        self._make_click(db, p, user)

        resp = client.post(
            f"/producers/{p.id}/reviews",
            json={"stars": 4, "title": "טעים מאוד", "body": "המוצר ברמה גבוהה"},
            headers=auth_header(user),
        )
        assert resp.status_code == 201
        assert resp.json()["stars"] == 4

        review = db.query(ProducerReview).first()
        assert review is not None
        assert review.user_id == user.id

    def test_post_review_update_bypasses_gate(self, client, db):
        """User updating an existing review doesn't need a new click."""
        p = make_producer(db)
        user = make_user(db, email="updater@test.com")
        # Create a review directly in DB (as if they had clicked before)
        db.add(ProducerReview(
            producer_id=p.id,
            user_id=user.id,
            stars=3,
            body="OK",
        ))
        db.commit()

        # No click row but can still update existing review
        resp = client.post(
            f"/producers/{p.id}/reviews",
            json={"stars": 5, "title": "עדכון", "body": "עכשיו יותר טוב"},
            headers=auth_header(user),
        )
        assert resp.status_code == 201
        assert resp.json()["stars"] == 5

    def test_get_reviews_pagination(self, client, db):
        """12 reviews → 2 pages; page 1 returns 10, page 2 returns 2."""
        p = make_producer(db)
        for i in range(12):
            u = make_user(db, email=f"rev{i}@test.com")
            db.add(ProducerReview(producer_id=p.id, user_id=u.id, stars=5))
        db.commit()

        p1 = client.get(f"/producers/{p.id}/reviews", params={"page": 1}).json()
        assert len(p1["reviews"]) == 10
        assert p1["total"] == 12
        assert p1["pages"] == 2

        p2 = client.get(f"/producers/{p.id}/reviews", params={"page": 2}).json()
        assert len(p2["reviews"]) == 2

    def test_avg_rating_updated_after_review(self, client, db):
        """Producer avg_rating is recomputed after each review."""
        p = make_producer(db)
        for stars, email in [(4, "r1@test.com"), (2, "r2@test.com")]:
            u = make_user(db, email=email)
            db.add(ProducerReview(producer_id=p.id, user_id=u.id, stars=stars))
        db.commit()

        from app.routers.reviews import _recompute_producer_rating
        from app.database import SessionLocal
        with SessionLocal() as s:
            _recompute_producer_rating(p.id, s)

        db.expire(p)
        db.refresh(p)
        assert abs(p.avg_rating - 3.0) < 0.01
        assert p.reviews_count == 2

    def test_post_review_requires_auth(self, client, db):
        p = make_producer(db)
        resp = client.post(f"/producers/{p.id}/reviews", json=valid_review_payload())
        assert resp.status_code == 401


# ---------- Avatar upload ----------

class TestAvatarUpload:
    def test_patch_profile_saves_avatar_url(self, client, db):
        """PATCH /users/me with avatar_url persists it and returns it in UserOut."""
        user = make_user(db, email="avatar@test.com")
        resp = client.patch(
            "/users/me",
            json={"avatar_url": "https://res.cloudinary.com/test/image/upload/avatars/abc.jpg"},
            headers=auth_header(user),
        )
        assert resp.status_code == 200
        assert resp.json()["avatar_url"] == "https://res.cloudinary.com/test/image/upload/avatars/abc.jpg"

    def test_upload_avatar_requires_auth(self, client, db):
        """POST /upload/avatar without JWT → 401."""
        import io
        fake_jpg = b"\xff\xd8\xff" + b"\x00" * 100
        resp = client.post(
            "/upload/avatar",
            files={"file": ("photo.jpg", io.BytesIO(fake_jpg), "image/jpeg")},
        )
        assert resp.status_code == 401


# ---------- MEH-1190: Profile phone field ----------

class TestProfilePhone:
    """PATCH /users/me phone — editable, optional, length-bounded (MEH-1190).

    The users.phone column already existed and is read by the WhatsApp alert
    fan-out (alerts.py); this covers the newly-wired ProfileUpdate.phone.
    """

    def test_patch_sets_phone(self, client, db):
        user = make_user(db, email="phone-set@example.com")
        resp = client.patch(
            "/users/me",
            json={"phone": "0501234567"},
            headers=auth_header(user),
        )
        assert resp.status_code == 200
        assert resp.json()["phone"] == "0501234567"
        db.expire_all()
        assert db.query(User).filter(User.id == user.id).first().phone == "0501234567"

    def test_patch_empty_phone_clears_to_none(self, client, db):
        user = make_user(db, email="phone-clear@example.com")
        client.patch("/users/me", json={"phone": "0501234567"}, headers=auth_header(user))
        resp = client.patch("/users/me", json={"phone": ""}, headers=auth_header(user))
        assert resp.status_code == 200
        assert resp.json()["phone"] is None
        db.expire_all()
        assert db.query(User).filter(User.id == user.id).first().phone is None

    def test_patch_phone_too_long_returns_422(self, client, db):
        user = make_user(db, email="phone-long@example.com")
        resp = client.patch(
            "/users/me",
            json={"phone": "0" * 21},
            headers=auth_header(user),
        )
        assert resp.status_code == 422


# ---------- MEH-148: Reserved slug protection ----------

class TestReservedSlugs:
    """Producer slugs must not collide with app routes (MEH-148)."""

    def test_admin_create_with_explicit_reserved_slug_returns_400(self, client, db):
        admin = make_user(db, role="admin")
        resp = client.post(
            "/admin/producers",
            json={
                "name": "חנות נהדרת",
                "slug": "about",
                "city": "תל אביב",
            },
            headers=auth_header(admin),
        )
        assert resp.status_code == 400
        assert "שמור" in resp.json()["detail"]

    def test_admin_create_reserved_slug_variants(self, client, db):
        admin = make_user(db, role="admin")
        for reserved in ("map", "admin", "login", "search", "favorites", "api"):
            resp = client.post(
                "/admin/producers",
                json={"name": "עסק", "slug": reserved, "city": "חיפה"},
                headers=auth_header(admin),
            )
            assert resp.status_code == 400, f"Expected 400 for slug '{reserved}'"

    # --- MEH-296 3d: admin + public contact-channel parity ---

    def test_admin_create_persists_new_contact_channels(self, client, db):
        admin = make_user(db, role="admin")
        resp = client.post(
            "/admin/producers",
            json={
                "name": "חנות ערוצים",
                "city": "חיפה",
                "facebook": "https://facebook.com/mybiz",
                "external_order_form": "https://shop.example.com/order",
            },
            headers=auth_header(admin),
        )
        assert resp.status_code in (200, 201), resp.text
        body = resp.json()
        assert body["facebook"] == "https://facebook.com/mybiz"
        assert body["external_order_form"] == "https://shop.example.com/order"

    def test_admin_create_rejects_bad_contact_method(self, client, db):
        admin = make_user(db, role="admin")
        resp = client.post(
            "/admin/producers",
            json={"name": "עסק טוב", "city": "חיפה", "primary_contact_method": "garbage"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 422, resp.text

    def test_admin_create_rejects_javascript_facebook(self, client, db):
        admin = make_user(db, role="admin")
        resp = client.post(
            "/admin/producers",
            json={"name": "עסק טוב", "city": "חיפה", "facebook": "javascript:alert(1)"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 422, resp.text

    def test_public_create_rejects_javascript_website(self, client, db):
        # ProducerCreate (public POST /producers) URL-scheme guard.
        user = make_user(db, email="pub-create@example.com")
        resp = client.post(
            "/producers",
            json={"name": "עסק חדש", "website": "javascript:alert(1)"},
            headers=auth_header(user),
        )
        assert resp.status_code == 422, resp.text

    def test_admin_create_with_reserved_name_auto_suffixes_slug(self, client, db):
        """When name auto-generates a reserved slug, the slug should be suffixed."""
        admin = make_user(db, role="admin")
        # Name "about" → slug "about" is reserved → should become "about-2"
        resp = client.post(
            "/admin/producers",
            json={"name": "about", "city": "ירושלים"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["slug"] not in ("about",), "Reserved slug was assigned unchanged"
        assert body["slug"].startswith("about-")

    def test_admin_update_with_reserved_slug_returns_400(self, client, db):
        admin = make_user(db, role="admin")
        producer = make_producer(db)
        resp = client.put(
            f"/admin/producers/{producer.id}",
            json={"slug": "map"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 400
        assert "שמור" in resp.json()["detail"]

    def test_producer_me_update_cannot_set_slug_at_all(self, client, db):
        """MEH-1856: a producer user cannot set her own slug — reserved or not.

        This REPLACES test_producer_me_update_with_reserved_slug_returns_400,
        which asserted a 400 for the reserved word specifically. That 400 came
        from a validate-and-deduplicate step that ran BEFORE the writable-field
        whitelist; with `slug` out of the whitelist the step was removed, since
        keeping it would have left the endpoint rejecting a value it no longer
        writes (`slug: "about"` → 400, `slug: "anything"` → 200-and-ignored).

        The guarantee is now stronger, so this asserts the stronger thing: the
        request succeeds and the slug is UNCHANGED. A 400 only ever proved the
        reserved word was refused; an unchanged column proves nothing was
        written on either path. Admin/import keep their own reserved-slug
        checks — covered by the sibling tests in this class.
        """
        user = make_user(db, role="producer")
        producer = make_producer(db)
        user.producer_id = producer.id
        db.commit()
        original_slug = producer.slug

        for attempted in ("admin", "a-perfectly-fine-slug"):
            resp = client.put(
                "/producers/me",
                json={"slug": attempted},
                headers=auth_header(user),
            )
            assert resp.status_code == 200, resp.text
            db.refresh(producer)
            assert producer.slug == original_slug, (
                f"slug changed to {producer.slug!r} after PUT with {attempted!r} — "
                "the owner write path for slug must be closed"
            )

    def test_non_reserved_slug_is_accepted(self, client, db):
        admin = make_user(db, role="admin")
        resp = client.post(
            "/admin/producers",
            json={"name": "חוות האגס", "slug": "chavat-ha-egas", "city": "כפר סבא"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 201
        assert resp.json()["slug"] == "chavat-ha-egas"

    def test_reserved_slug_set_contains_key_routes(self, client, db):
        """Smoke-test the RESERVED_SLUGS constant itself."""
        from app.slug_utils import RESERVED_SLUGS
        for route in ("about", "map", "login", "admin", "search", "api"):
            assert route in RESERVED_SLUGS

    def test_reserved_slug_set_contains_meh_1324_live_routes(self, client, db):
        """MEH-1324 §3 (dirs B+C): 13 live routes must be claim-blocked."""
        from app.slug_utils import RESERVED_SLUGS
        for route in (
            "p", "rate", "upgrade", "messages", "discover", "publish",
            "share", "join", "ref", "verify-email", "accessibility",
            "dev", "newsletter",
        ):
            assert route in RESERVED_SLUGS, f"{route!r} missing from RESERVED_SLUGS"

    def test_admin_create_meh_1324_reserved_slug_variants_rejected(self, client, db):
        """A producer cannot claim any of the MEH-1324 live-route slugs."""
        admin = make_user(db, role="admin")
        for reserved in (
            "p", "rate", "upgrade", "messages", "discover", "publish",
            "share", "join", "ref", "verify-email", "accessibility",
            "dev", "newsletter",
        ):
            resp = client.post(
                "/admin/producers",
                json={"name": "עסק", "slug": reserved, "city": "חיפה"},
                headers=auth_header(admin),
            )
            assert resp.status_code == 400, f"Expected 400 for slug '{reserved}'"


# ---------- MEH-146: double-submit idempotency ----------

class TestDoubleSubmitIdempotency:
    """MEH-146 — duplicate POST on favorites and reviews must return 200, not 500."""

    def test_favorite_double_submit_is_idempotent(self, client, db):
        user = make_user(db, email="fav_double@test.com")
        producer = make_producer(db)
        headers = auth_header(user)

        r1 = client.post(f"/users/me/favorites/{producer.id}", headers=headers)
        assert r1.status_code in (200, 201)

        r2 = client.post(f"/users/me/favorites/{producer.id}", headers=headers)
        assert r2.status_code in (200, 201), f"Second POST returned {r2.status_code}: {r2.text}"

    def test_review_double_submit_is_idempotent(self, client, db):
        user = make_user(db, email="rev_double@test.com")
        producer = make_producer(db)
        headers = auth_header(user)

        # Satisfy the WhatsApp-click gate
        from app.models.models import ProducerWhatsAppClick
        click = ProducerWhatsAppClick(producer_id=producer.id, user_id=user.id)
        db.add(click)
        db.commit()

        payload = {"stars": 4, "body": "מוצר מאוד טרי ואיכותי, ממליצה!"}
        r1 = client.post(f"/producers/{producer.id}/reviews", json=payload, headers=headers)
        assert r1.status_code in (200, 201)

        r2 = client.post(f"/producers/{producer.id}/reviews", json=payload, headers=headers)
        assert r2.status_code in (200, 201), f"Second POST returned {r2.status_code}: {r2.text}"


# ---------- MEH-153: Cloudinary Hebrew error messages ----------

class TestCloudinaryHebrewErrors:
    """Upload error responses must be Hebrew (MEH-153)."""

    def test_freemium_limit_returns_hebrew(self, client, db):
        """A free-plan producer growing the gallery past 3 gets a Hebrew 403."""

        user = make_user(db, role="producer", email="upload_limit@test.com")
        producer = make_producer(db)
        user.producer_id = producer.id
        producer.plan = "free"
        # images is ARRAY(Text) on Producer; set 3 URLs to hit the limit
        producer.images = [
            "https://res.cloudinary.com/test/img/0.jpg",
            "https://res.cloudinary.com/test/img/1.jpg",
            "https://res.cloudinary.com/test/img/2.jpg",
        ]
        db.commit()

        # MEH-3220: the cap is enforced on the gallery write, not the upload.
        resp = client.put(
            "/producers/me",
            json={"images": [f"https://res.cloudinary.com/test/img/{i}.jpg" for i in range(4)]},
            headers=auth_header(user),
        )
        assert resp.status_code == 403
        detail = resp.json()["detail"]
        # MEH-1008: the cap copy dropped "חשבון החינם" (no tier framing while
        # MEH-617 is undecided) — assert Hebrew via the stable cap phrase instead.
        assert "עד 3 תמונות" in detail, f"Expected Hebrew cap message, got: {detail}"
        assert "Free plan" not in detail, "English error leaked to user"
        # MEH-1008: no premium/upgrade promise in the cap error.
        assert "פרמיום" not in detail and "שדרג" not in detail

    def test_oversized_image_returns_hebrew(self, client, db):
        """Files over 5 MB return a Hebrew 400 error."""
        import io
        user = make_user(db, email="upload_size@test.com")
        big_content = b"\xff\xd8\xff" + b"\x00" * (5 * 1024 * 1024 + 1)
        resp = client.post(
            "/upload/image",
            files={"file": ("big.jpg", io.BytesIO(big_content), "image/jpeg")},
            headers=auth_header(user),
        )
        assert resp.status_code == 400
        detail = resp.json()["detail"]
        assert "MB" in detail
        assert "Upload failed" not in detail

    def test_invalid_file_type_returns_hebrew(self, client, db):
        """Non-image binary returns a Hebrew 400 error."""
        import io
        user = make_user(db, email="upload_type@test.com")
        fake_pdf = b"%PDF-1.4 not an image"
        resp = client.post(
            "/upload/image",
            files={"file": ("doc.pdf", io.BytesIO(fake_pdf), "application/pdf")},
            headers=auth_header(user),
        )
        assert resp.status_code == 400
        detail = resp.json()["detail"]
        assert "JPG" in detail or "PNG" in detail or "תמונות" in detail
        assert "Upload failed" not in detail


# ---------- MEH-1335: owner story fields (owner_bio + owner_photo_url) ----------

class TestOwnerStoryFields:
    """MEH-1335: owner story data path — owner write, PUBLIC read, dedicated
    upload endpoint. The fields feed the OwnerCard "מאחורי העסק" variants
    (dormant in PR #1936 / MEH-1334); absence must change nothing."""

    def _producer_user(self, db, *, plan="free", images=None, email="owner_story@test.com"):
        user = make_user(db, role="producer", email=email)
        producer = make_producer(db, images=images)
        producer.plan = plan
        user.producer_id = producer.id
        db.commit()
        return user, producer

    def test_owner_put_and_public_get_roundtrip(self, client, db):
        """Owner PUT writes both fields; the PUBLIC detail GET returns them —
        they are deliberately public, unlike address (MEH-829)."""
        user, producer = self._producer_user(db)
        resp = client.put(
            "/producers/me",
            json={
                "owner_bio": "גדלתי בין העיזים.",
                "owner_photo_url": "https://res.cloudinary.com/test/image/upload/owner/noa.jpg",
            },
            headers=auth_header(user),
        )
        assert resp.status_code == 200
        public = client.get(f"/producers/{producer.id}")
        assert public.status_code == 200
        body = public.json()
        assert body["owner_bio"] == "גדלתי בין העיזים."
        assert (
            body["owner_photo_url"]
            == "https://res.cloudinary.com/test/image/upload/owner/noa.jpg"
        )
        # MEH-829 regression guard: the same public payload still must NOT
        # carry the street address.
        assert "address" not in body

    def test_absence_changes_nothing(self, client, db):
        """Fields never set → public GET returns null for both (the dormant
        OwnerCard contract: NULL = compact variant)."""
        _, producer = self._producer_user(db, email="owner_absent@test.com")
        body = client.get(f"/producers/{producer.id}").json()
        assert body["owner_bio"] is None
        assert body["owner_photo_url"] is None

    def test_owner_bio_capped_at_300(self, client, db):
        """Server-side cap: 400 chars in → ≤300 stored (sanitize_text truncation,
        mirrors the short_description 200-cap pattern)."""
        user, _ = self._producer_user(db, email="owner_bio_cap@test.com")
        resp = client.put(
            "/producers/me", json={"owner_bio": "א" * 400}, headers=auth_header(user)
        )
        assert resp.status_code == 200
        assert len(resp.json()["owner_bio"]) <= 300

    def test_owner_bio_html_stripped(self, client, db):
        """Bleach strips tags at the input layer (ASVS V13 / MEH-329 pattern)."""
        user, _ = self._producer_user(db, email="owner_bio_html@test.com")
        resp = client.put(
            "/producers/me",
            json={"owner_bio": "<script>alert(1)</script>שלום"},
            headers=auth_header(user),
        )
        assert resp.status_code == 200
        assert "<script>" not in (resp.json()["owner_bio"] or "")

    def test_owner_photo_url_capped_at_500(self, client, db):
        """Field(max_length=500) on ProducerUpdate → 422 for an over-long URL
        (parallel to the bio cap test; column is VARCHAR(500))."""
        user, _ = self._producer_user(db, email="owner_url_cap@test.com")
        long_url = "https://res.cloudinary.com/test/" + "a" * 500 + ".jpg"
        resp = client.put(
            "/producers/me",
            json={"owner_photo_url": long_url},
            headers=auth_header(user),
        )
        assert resp.status_code == 422

    def test_owner_photo_url_rejects_bad_scheme(self, client, db):
        """Non-http(s) URL → 422 (MEH-1222 image-URL guard)."""
        user, _ = self._producer_user(db, email="owner_url_bad@test.com")
        resp = client.put(
            "/producers/me",
            json={"owner_photo_url": "javascript:alert(1)"},
            headers=auth_header(user),
        )
        assert resp.status_code == 422

    def test_free_plan_full_gallery_can_upload_owner_photo(self, client, db):
        """THE justification for /upload/owner-photo: the 3-image gallery cap
        blocks /upload/image but must NOT block the owner photo."""
        import io

        user, producer = self._producer_user(
            db,
            plan="free",
            images=[
                "https://res.cloudinary.com/test/img/0.jpg",
                "https://res.cloudinary.com/test/img/1.jpg",
                "https://res.cloudinary.com/test/img/2.jpg",
            ],
            email="owner_upload_cap@test.com",
        )
        fake_jpg = b"\xff\xd8\xff" + b"\x00" * 100
        # MEH-3220: the gallery cap moved off /upload/image to the gallery
        # write (PUT /producers/me), so there is no upload 403 to contrast
        # with any more; the owner-photo endpoint must still accept a full
        # gallery's owner.
        resp = client.post(
            "/upload/owner-photo",
            files={"file": ("me.jpg", io.BytesIO(fake_jpg), "image/jpeg")},
            headers=auth_header(user),
        )
        assert resp.status_code == 200
        url = resp.json()["url"]
        assert url
        db.refresh(producer)
        assert producer.owner_photo_url == url

    def test_owner_photo_upload_requires_auth(self, client):
        """POST /upload/owner-photo without JWT → 401 (schema-valid file body)."""
        import io

        resp = client.post(
            "/upload/owner-photo",
            files={
                "file": (
                    "me.jpg",
                    io.BytesIO(b"\xff\xd8\xff" + b"\x00" * 100),
                    "image/jpeg",
                )
            },
        )
        assert resp.status_code == 401

    def test_owner_photo_upload_without_producer_403(self, client, db):
        """A logged-in user with no producer attached cannot upload."""
        import io

        user = make_user(db, email="owner_no_producer@test.com")
        resp = client.post(
            "/upload/owner-photo",
            files={
                "file": (
                    "me.jpg",
                    io.BytesIO(b"\xff\xd8\xff" + b"\x00" * 100),
                    "image/jpeg",
                )
            },
            headers=auth_header(user),
        )
        assert resp.status_code == 403

    def test_owner_photo_rejects_non_image(self, client, db):
        """Magic-byte sniff applies to the new endpoint too."""
        import io

        user, _ = self._producer_user(db, email="owner_bad_file@test.com")
        resp = client.post(
            "/upload/owner-photo",
            files={"file": ("doc.pdf", io.BytesIO(b"%PDF-1.4 nope"), "application/pdf")},
            headers=auth_header(user),
        )
        assert resp.status_code == 400


# ---------- MEH-155: Vacation badge auto-clear after return_date ----------

class TestVacationBadgeClear:
    """vacation_until field auto-clears expired vacation at serialization time (MEH-155).

    MEH-2271 changed HOW these rows are constructed, not what MEH-155
    guarantees. The auto-clear used to fire on `availability_status ==
    "vacation"` OR `availability_state == "on_vacation"`; it is state-only now,
    because the status field is DERIVED from the state at serialization time
    and reading it there would be reading the validator's own output.

    So the setups below put the producer on vacation the way every app write
    path does — `availability_state = "on_vacation"` — instead of poking the
    legacy column, which no code has written since chunk 3a. The invariant
    under test is unchanged and still asserted: an expired vacation must not be
    served, neither as a status nor as a date.

    `test_a_legacy_only_vacation_row_is_ignored` pins the other half of that
    change deliberately, so the behaviour is a recorded decision rather than a
    silent consequence.
    """

    def test_set_vacation_with_future_date(self, client, db):
        """POST availability-state with on_vacation + future vacation_until persists both."""
        from datetime import timedelta
        user = make_user(db, role="producer")
        producer = make_producer(db)
        user.producer_id = producer.id
        db.commit()

        future = (israel_today() + timedelta(days=7)).isoformat()
        # MEH-2758: the legacy /availability-status endpoint is gone.
        resp = client.post(
            "/producers/me/availability-state",
            json={"state": "on_vacation", "vacation_until": future},
            headers=auth_header(user),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["availability_state"] == "on_vacation"
        assert body["vacation_until"] == future

    def test_expired_vacation_clears_in_api_response(self, client, db):
        """A producer with vacation_until in the past should appear as 'available' in GET /producers."""
        from datetime import timedelta
        producer = make_producer(db)
        # MEH-2271: the enum is what every write path sets, so it is what the
        # auto-clear reads. Setting the legacy column here instead would build
        # a row the application can no longer produce.
        producer.availability_state = "on_vacation"
        producer.vacation_until = israel_today() - timedelta(days=1)
        db.commit()

        resp = client.get(f"/producers/{producer.id}")
        assert resp.status_code == 200
        body = resp.json()
        # MEH-2272: the enum is the only availability field served; an expired
        # vacation must read accepting_orders, not on_vacation.
        assert body["availability_state"] == "accepting_orders", (
            f"Expected 'accepting_orders' for expired vacation, got '{body['availability_state']}'"
        )
        assert body.get("vacation_until") is None

    def test_active_vacation_stays_in_api_response(self, client, db):
        """A producer with vacation_until in the future stays as 'vacation'."""
        from datetime import timedelta
        producer = make_producer(db)
        producer.availability_state = "on_vacation"
        producer.vacation_until = israel_today() + timedelta(days=3)
        db.commit()

        resp = client.get(f"/producers/{producer.id}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["availability_state"] == "on_vacation"
        assert body["vacation_until"] is not None

    # MEH-2758: removed with the legacy endpoint it exercised (POST /producers/me/availability).

    def test_a_legacy_only_vacation_row_is_ignored(self, client, db):
        """MEH-2271, pinned deliberately: the legacy COLUMN no longer speaks.

        A row carrying availability_status='vacation' with the enum left at its
        default is the shape the two tests above used to build, and it is the
        shape a pre-chunk-3a row froze into. Nothing writes it any more and
        nothing reads it: the response reports what the ENUM says.

        This is the intended consequence of making the enum the single
        authority, recorded here rather than discovered later from a
        mysteriously green suite. It is safe because the desync between the two
        was measured at 0 of 29 rows on staging (06/09) before the switch — had
        it been non-zero, those rows would have needed a backfill first.
        """
        from datetime import timedelta
        producer = make_producer(db)
        producer.availability_status = "vacation"
        producer.vacation_until = israel_today() + timedelta(days=3)
        db.commit()
        assert producer.availability_state == "accepting_orders"

        body = client.get(f"/producers/{producer.id}").json()
        assert body["availability_state"] == "accepting_orders"
        # MEH-2272: and the stale column value has no field to leak through.
        assert "availability_status" not in body
        assert "is_available_today" not in body

    def test_switching_away_from_vacation_clears_date(self, client, db):
        """Setting state to accepting_orders must clear vacation_until."""
        from datetime import timedelta
        user = make_user(db, role="producer")
        producer = make_producer(db)
        user.producer_id = producer.id
        producer.availability_state = "on_vacation"
        producer.vacation_until = israel_today() + timedelta(days=5)
        db.commit()

        # MEH-2758: the legacy /availability-status endpoint is gone.
        resp = client.post(
            "/producers/me/availability-state",
            json={"state": "accepting_orders"},
            headers=auth_header(user),
        )
        assert resp.status_code == 200
        assert resp.json()["vacation_until"] is None
