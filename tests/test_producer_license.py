"""
MEH-530: producer_license_number conditional-required validation.

Covers all four input surfaces that accept producer category data:
  - /auth/register/producer (public registration)
  - /producers (authenticated public create — covered indirectly via the
    helper — not separately exercised here; the helper is the same)
  - /admin/producers (admin create + PATCH)

The Pydantic layer only enforces max_length=20. The 422 for missing
license against a license-required category is raised by
`app/services/license_validation.py::ensure_license_for_categories`
from the router. Format validation is intentionally absent on the
backend (manual-approval flow per MEH-530 product decision) — test 8
locks that decision in as a regression guard.
"""

from __future__ import annotations

from app.models.models import Producer
from tests.conftest import auth_header, make_category, make_producer, make_user


BAKERY = "לחמים ואפייה"
VEGGIES = "ירקות"
# MEH-743: honey split from "שמנים ודבש"; honey requires a license per
# צו הפיקוח, תשל"ז-1977, olive-oil-only does not.
HONEY = "דבש"
OILS = "שמנים"
LICENSE_REQUIRED_HE = "מספר רישיון יצרן חובה לקטגוריה זו"


def _register_payload(
    category_ids, *, license_number, email="x@example.com", license_pending=False
):
    """Schema-valid /auth/register/producer body with overridable license."""
    payload = {
        "email": email,
        "name": "יצרנית",
        "password": "Zx7Yp9Mq2Lr4",
        "producer_name": "עסק לדוגמה",
        "phone": "0501234567",
        "category_ids": category_ids,
        "primary_contact_method": "whatsapp",
        "declaration_accepted": True,  # MEH-759: mandatory binding declaration
    }
    if license_number is not None:
        payload["producer_license_number"] = license_number
    if license_pending:
        payload["license_pending"] = True  # MEH-971 chunk 2
    return payload


class TestRegisterProducerLicense:
    """MEH-530 — public /auth/register/producer guard."""

    def test_bakery_with_license_201(self, client, db):
        """Test 1 — bakery + valid license → 200 (registration success)."""
        bakery = make_category(db, name=BAKERY, emoji="🍞")
        resp = client.post(
            "/auth/register/producer",
            json=_register_payload(
                [bakery.id],
                license_number="1234567",
                email="bakery1@example.com",
            ),
        )
        assert resp.status_code == 200, resp.text
        # MEH-328 Chunk B: /auth/register/producer non-upgrade now returns
        # RegisterAck (no token). License-required guard is unchanged —
        # we only assert the success status here.
        assert "access_token" not in resp.json()

    def test_bakery_without_license_422(self, client, db):
        """Test 3 — bakery + no license → 422 + Hebrew error."""
        bakery = make_category(db, name=BAKERY, emoji="🍞")
        resp = client.post(
            "/auth/register/producer",
            json=_register_payload(
                [bakery.id],
                license_number=None,
                email="bakery2@example.com",
            ),
        )
        assert resp.status_code == 422, resp.text
        assert resp.json()["detail"] == LICENSE_REQUIRED_HE

    def test_bakery_with_empty_string_license_422(self, client, db):
        """Test 4 — empty-string license treated as missing → 422."""
        bakery = make_category(db, name=BAKERY, emoji="🍞")
        resp = client.post(
            "/auth/register/producer",
            json=_register_payload(
                [bakery.id],
                license_number="",
                email="bakery3@example.com",
            ),
        )
        assert resp.status_code == 422, resp.text
        assert resp.json()["detail"] == LICENSE_REQUIRED_HE

    def test_veggies_without_license_201(self, client, db):
        """Test 5 — veggies + no license → 200 (license optional)."""
        veggies = make_category(db, name=VEGGIES, emoji="🥬")
        resp = client.post(
            "/auth/register/producer",
            json=_register_payload(
                [veggies.id],
                license_number=None,
                email="veggie@example.com",
            ),
        )
        assert resp.status_code == 200, resp.text
        # MEH-328 Chunk B: /auth/register/producer non-upgrade now returns
        # RegisterAck (no token). License-required guard is unchanged —
        # we only assert the success status here.
        assert "access_token" not in resp.json()

    def test_mixed_categories_without_license_422(self, client, db):
        """Test 6 — veggies + bakery, no license → 422 (any required wins)."""
        veggies = make_category(db, name=VEGGIES, emoji="🥬")
        bakery = make_category(db, name=BAKERY, emoji="🍞")
        resp = client.post(
            "/auth/register/producer",
            json=_register_payload(
                [veggies.id, bakery.id],
                license_number=None,
                email="mixed@example.com",
            ),
        )
        assert resp.status_code == 422, resp.text
        assert resp.json()["detail"] == LICENSE_REQUIRED_HE


class TestAdminProducerLicense:
    """MEH-530 — admin /admin/producers create + PATCH guard."""

    def _admin_payload(
        self,
        category_ids,
        *,
        license_number,
        name="עסק אדמין",
    ):
        payload = {
            "name": name,
            "category_ids": category_ids,
        }
        if license_number is not None:
            payload["producer_license_number"] = license_number
        return payload

    def test_admin_bakery_with_license_201(self, client, db):
        """Test 2 — admin POST bakery + license → 201."""
        admin = make_user(db, email="admin@example.com", role="admin")
        bakery = make_category(db, name=BAKERY, emoji="🍞")
        resp = client.post(
            "/admin/producers",
            json=self._admin_payload([bakery.id], license_number="1234567"),
            headers=auth_header(admin),
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["producer_license_number"] == "1234567"

    def test_admin_bakery_with_legacy_non_regex_license_201(self, client, db):
        """Test 8 — manual-approval flow: non-regex value still accepted.

        Locks in the MEH-530 product decision (Sapir reviewer can approve a
        legacy/stub license like 'PENDING-1234'). If a future PR flips the
        format check to backend-blocking this test will fail loudly.
        """
        admin = make_user(db, email="admin2@example.com", role="admin")
        bakery = make_category(db, name=BAKERY, emoji="🍞")
        resp = client.post(
            "/admin/producers",
            json=self._admin_payload(
                [bakery.id],
                license_number="PENDING-1234",
                name="עסק PENDING",
            ),
            headers=auth_header(admin),
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["producer_license_number"] == "PENDING-1234"

    def test_admin_patch_veggies_to_bakery_without_license_422(self, client, db):
        """Test 7 — start as veggies (no license required), PATCH to add
        bakery without license → 422. Exercises the effective-state guard
        path in routers/admin.py::admin_update_producer.
        """
        admin = make_user(db, email="admin3@example.com", role="admin")
        veggies = make_category(db, name=VEGGIES, emoji="🥬")
        bakery = make_category(db, name=BAKERY, emoji="🍞")

        # Create as veggies, no license — that's legal.
        create = client.post(
            "/admin/producers",
            json=self._admin_payload([veggies.id], license_number=None),
            headers=auth_header(admin),
        )
        assert create.status_code == 201, create.text
        producer_id = create.json()["id"]

        # PATCH to add bakery, still no license → 422.
        resp = client.put(
            f"/admin/producers/{producer_id}",
            json={"category_ids": [veggies.id, bakery.id]},
            headers=auth_header(admin),
        )
        assert resp.status_code == 422, resp.text
        assert resp.json()["detail"] == LICENSE_REQUIRED_HE


class TestRegisterProducerHoneyLicense:
    """MEH-743 — honey is license-required; olive-oil alone is not."""

    def test_honey_without_license_422(self, client, db):
        honey = make_category(db, name=HONEY, emoji="🍯")
        resp = client.post(
            "/auth/register/producer",
            json=_register_payload(
                [honey.id],
                license_number=None,
                email="honey1@example.com",
            ),
        )
        assert resp.status_code == 422, resp.text
        assert resp.json()["detail"] == LICENSE_REQUIRED_HE

    def test_honey_with_license_200(self, client, db):
        honey = make_category(db, name=HONEY, emoji="🍯")
        resp = client.post(
            "/auth/register/producer",
            json=_register_payload(
                [honey.id],
                license_number="1234567",
                email="honey2@example.com",
            ),
        )
        assert resp.status_code == 200, resp.text

    def test_oils_only_without_license_200(self, client, db):
        """Olive-oil-only producers stay license-optional (exempt under
        4.6ו plant-based < 5t/yr; the split is precisely so honey can be
        required without sweeping in oil."""
        oils = make_category(db, name=OILS, emoji="🫒")
        resp = client.post(
            "/auth/register/producer",
            json=_register_payload(
                [oils.id],
                license_number=None,
                email="oils@example.com",
            ),
        )
        assert resp.status_code == 200, resp.text


class TestRegisterProducerLicensePending:
    """MEH-971 chunk 2 — license_pending opt-in skips the register-time 422.

    The licensed-only rule is NOT weakened: license_pending only lands the
    producer in the pending queue (status="pending_whatsapp") with a NULL
    license. The chunk-4 approval guard (admin.py) still blocks approval
    without a license, and publication requires status=="approved"
    (producer_listing.py) — so a license_pending producer can never publish.
    """

    def _created_producer(self, db):
        return (
            db.query(Producer)
            .filter(Producer.name == "עסק לדוגמה")
            .order_by(Producer.created_at.desc())
            .first()
        )

    def test_a_license_required_no_license_pending_true_200(self, client, db):
        """(a) license-required + no license + pending=True → 200, NULL license."""
        bakery = make_category(db, name=BAKERY, emoji="🍞")
        resp = client.post(
            "/auth/register/producer",
            json=_register_payload(
                [bakery.id],
                license_number=None,
                license_pending=True,
                email="pending_a@example.com",
            ),
        )
        assert resp.status_code == 200, resp.text
        producer = self._created_producer(db)
        assert producer is not None
        assert producer.producer_license_number is None
        assert producer.status == "pending_whatsapp"

    def test_b_license_required_no_license_default_still_422(self, client, db):
        """(b) pending omitted (default False) → existing 422 unchanged."""
        bakery = make_category(db, name=BAKERY, emoji="🍞")
        resp = client.post(
            "/auth/register/producer",
            json=_register_payload(
                [bakery.id],
                license_number=None,
                email="pending_b@example.com",
            ),
        )
        assert resp.status_code == 422, resp.text
        assert resp.json()["detail"] == LICENSE_REQUIRED_HE

    def test_c_license_required_with_license_pending_true_200(self, client, db):
        """(c) license supplied + pending=True → accepted normally (no conflict)."""
        bakery = make_category(db, name=BAKERY, emoji="🍞")
        resp = client.post(
            "/auth/register/producer",
            json=_register_payload(
                [bakery.id],
                license_number="1234567",
                license_pending=True,
                email="pending_c@example.com",
            ),
        )
        assert resp.status_code == 200, resp.text
        producer = self._created_producer(db)
        assert producer is not None
        assert producer.producer_license_number == "1234567"

    def test_d_non_license_category_pending_true_200(self, client, db):
        """(d) non-license category + no license + pending=True → 200."""
        veggies = make_category(db, name=VEGGIES, emoji="🥬")
        resp = client.post(
            "/auth/register/producer",
            json=_register_payload(
                [veggies.id],
                license_number=None,
                license_pending=True,
                email="pending_d@example.com",
            ),
        )
        assert resp.status_code == 200, resp.text

    def test_e_upgrade_path_license_required_pending_true_200(self, client, db):
        """(e) upgrade path: authenticated user + license-required + no license
        + pending=True → 200 with token; producer created NULL license. Proves
        the single shared gate covers the upgrade branch too."""
        user = make_user(db, email="upgrade_pending@example.com")
        bakery = make_category(db, name=BAKERY, emoji="🍞")
        payload = _register_payload(
            [bakery.id],
            license_number=None,
            license_pending=True,
            email="upgrade_pending@example.com",
        )
        resp = client.post(
            "/auth/register/producer",
            json=payload,
            headers=auth_header(user),
        )
        assert resp.status_code == 200, resp.text
        assert "access_token" in resp.json(), "upgrade path returns a token"
        producer = self._created_producer(db)
        assert producer is not None
        assert producer.producer_license_number is None
        assert producer.status == "pending_whatsapp"


class TestAdminLicensePendingFlag:
    """MEH-971 chunk 3 — ProducerAdminOut.license_pending derived flag.

    True iff the producer is in >=1 license-required category AND has no
    license number. Computed schema-side from the loaded categories +
    constants.LICENSE_REQUIRED_CATEGORIES (no new column, no DB round-trip).
    Status-independent. Admin-only (not on the public ProducerListOut).
    """

    def _set_license(self, db, producer, value):
        producer.producer_license_number = value
        db.commit()
        db.refresh(producer)

    def _fetch_admin_row(self, client, admin, producer_id):
        resp = client.get("/admin/producers", headers=auth_header(admin))
        assert resp.status_code == 200, resp.text
        rows = {str(r["id"]): r for r in resp.json()}  # str() = id-type-agnostic key
        return rows.get(str(producer_id))

    def test_required_category_empty_license_true(self, client, db):
        """(1) license-required + empty license → license_pending True."""
        admin = make_user(db, email="lpadmin1@example.com", role="admin")
        bakery = make_category(db, name=BAKERY, emoji="🍞")
        producer = make_producer(db, status="pending", category=bakery)
        row = self._fetch_admin_row(client, admin, producer.id)
        assert row is not None
        assert row["license_pending"] is True

    def test_required_category_with_license_false(self, client, db):
        """(2) license-required + license present → False."""
        admin = make_user(db, email="lpadmin2@example.com", role="admin")
        bakery = make_category(db, name=BAKERY, emoji="🍞")
        producer = make_producer(db, status="pending", category=bakery)
        self._set_license(db, producer, "1234567")
        row = self._fetch_admin_row(client, admin, producer.id)
        assert row is not None
        assert row["license_pending"] is False

    def test_non_license_category_empty_false(self, client, db):
        """(3) non-license category + empty license → False."""
        admin = make_user(db, email="lpadmin3@example.com", role="admin")
        veggies = make_category(db, name=VEGGIES, emoji="🥬")
        producer = make_producer(db, status="pending", category=veggies)
        row = self._fetch_admin_row(client, admin, producer.id)
        assert row is not None
        assert row["license_pending"] is False

    def test_non_license_category_with_license_false(self, client, db):
        """(4) non-license category + license present → False."""
        admin = make_user(db, email="lpadmin4@example.com", role="admin")
        veggies = make_category(db, name=VEGGIES, emoji="🥬")
        producer = make_producer(db, status="pending", category=veggies)
        self._set_license(db, producer, "1234567")
        row = self._fetch_admin_row(client, admin, producer.id)
        assert row is not None
        assert row["license_pending"] is False

    def test_pending_queue_endpoint_exposes_field(self, client, db):
        """GET /admin/producers?status=pending returns license_pending."""
        admin = make_user(db, email="lpadmin5@example.com", role="admin")
        bakery = make_category(db, name=BAKERY, emoji="🍞")
        producer = make_producer(db, status="pending", category=bakery)
        resp = client.get("/admin/producers?status=pending", headers=auth_header(admin))
        assert resp.status_code == 200, resp.text
        rows = {str(r["id"]): r for r in resp.json()}  # str() = id-type-agnostic key
        row = rows.get(str(producer.id))
        assert row is not None
        assert "license_pending" in row
        assert row["license_pending"] is True


class TestOwnerPutGrandfathersLicense:
    """MEH-999 (B10) — PUT /producers/me grandfathers already-held categories.

    A producer who registered via the MEH-971 license_pending opt-in holds a
    license-required category with a NULL license. The PUT gate previously
    re-validated her FULL persisted category set on every edit, bricking the
    whole edit surface. The grandfather rule validates NEWLY-ADDED categories
    only, plus an explicit license-clearing guard (a licensed producer cannot
    blank her license while keeping a license-required category).
    """

    def _owner(self, db, *, category, license_number=None):
        """Pending producer + linked producer-role user (owner)."""
        producer = make_producer(db, status="pending", category=category)
        if license_number is not None:
            producer.producer_license_number = license_number
            db.commit()
            db.refresh(producer)
        user = make_user(db, role="producer")
        user.producer_id = producer.id
        db.commit()
        return producer, user

    def test_a_pending_producer_saves_unrelated_edit_200(self, client, db):
        """(a) license-pending producer edits her bio → 200, edit persists."""
        bakery = make_category(db, name=BAKERY, emoji="🍞")
        producer, user = self._owner(db, category=bakery)  # NULL license
        resp = client.put(
            "/producers/me",
            json={"description": "מאפייה ביתית עם אהבה"},
            headers=auth_header(user),
        )
        assert resp.status_code == 200, resp.text
        db.refresh(producer)
        assert producer.description == "מאפייה ביתית עם אהבה"
        assert producer.producer_license_number is None  # still pending

    def test_b_pending_producer_adds_new_licensed_category_422(self, client, db):
        """(b) grandfather does NOT cover newly-added licensed categories."""
        bakery = make_category(db, name=BAKERY, emoji="🍞")
        honey = make_category(db, name=HONEY, emoji="🍯")
        producer, user = self._owner(db, category=bakery)  # NULL license
        resp = client.put(
            "/producers/me",
            json={"category_ids": [bakery.id, honey.id]},
            headers=auth_header(user),
        )
        assert resp.status_code == 422, resp.text
        assert LICENSE_REQUIRED_HE in resp.text
        db.refresh(producer)
        assert {c.id for c in producer.categories} == {bakery.id}  # unchanged

    def test_c_licensed_producer_clears_license_keeping_category_422(
        self, client, db
    ):
        """(c) 2c guard — blanking a held license with a licensed category → 422."""
        bakery = make_category(db, name=BAKERY, emoji="🍞")
        producer, user = self._owner(db, category=bakery, license_number="1234567")
        resp = client.put(
            "/producers/me",
            json={"producer_license_number": ""},
            headers=auth_header(user),
        )
        assert resp.status_code == 422, resp.text
        assert LICENSE_REQUIRED_HE in resp.text
        db.refresh(producer)
        assert producer.producer_license_number == "1234567"  # not cleared

    def test_d_pending_producer_adds_unlicensed_category_200(self, client, db):
        """(d) adding a NON-licensed category while pending stays allowed."""
        bakery = make_category(db, name=BAKERY, emoji="🍞")
        veggies = make_category(db, name=VEGGIES, emoji="🥬")
        producer, user = self._owner(db, category=bakery)  # NULL license
        resp = client.put(
            "/producers/me",
            json={"category_ids": [bakery.id, veggies.id]},
            headers=auth_header(user),
        )
        assert resp.status_code == 200, resp.text
        db.refresh(producer)
        assert {c.id for c in producer.categories} == {bakery.id, veggies.id}
