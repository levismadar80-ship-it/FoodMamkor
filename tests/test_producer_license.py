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

from tests.conftest import auth_header, make_category, make_user


BAKERY = "לחמים ואפייה"
VEGGIES = "ירקות"
# MEH-743: honey split from "שמנים ודבש"; honey requires a license per
# צו הפיקוח, תשל"ז-1977, olive-oil-only does not.
HONEY = "דבש"
OILS = "שמנים"
LICENSE_REQUIRED_HE = "מספר רישיון יצרן חובה לקטגוריה זו"


def _register_payload(category_ids, *, license_number, email="x@example.com"):
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
