"""
Module:   test_meh997_admin_recipes_badge
Purpose:  Failing-test-now-passing for the MEH-997 seed fix — the admin
          sidebar badge (/admin/dashboard pending_moderation_count) must
          count recipe moderation work. Before the fix, a recipe sitting
          in producer_recipes with moderation_status='pending' was
          invisible: no /admin/recipes page, no badge contribution.
Touches:  Postgres test DB via TestClient (GET /admin/dashboard).
Does NOT: test the moderation transitions themselves — that's
          tests/test_meh997_e2e_journeys.py (journey 1) and
          tests/test_producer_recipes.py (TestAdminModeration).
Related:  backend/app/routers/admin_extra.py get_dashboard;
          frontend/app/[locale]/admin/layout.js (badge consumer).
History:  MEH-997 (creation — seed: מתכון לא מופיע באדמין).
"""

from uuid import uuid4

from app.models.models import ProducerRecipe
from conftest import auth_header, make_producer, make_user


def _make_recipe(db, producer, *, moderation_status="pending", published=False):
    recipe = ProducerRecipe(
        producer_id=producer.id,
        title=f"מתכון {uuid4().hex[:6]}",
        ingredients="קמח, מים, מלח",
        instructions="לערבב ולאפות",
        moderation_status=moderation_status,
        published=published,
    )
    db.add(recipe)
    db.commit()
    db.refresh(recipe)
    return recipe


class TestDashboardCountsPendingRecipes:
    def test_pending_and_needs_revision_counted(self, client, db):
        admin = make_user(db, role="admin", email=f"a{uuid4().hex[:6]}@t.com")
        producer = make_producer(db)
        _make_recipe(db, producer, moderation_status="pending")
        _make_recipe(db, producer, moderation_status="needs_revision")
        # Terminal states must NOT count as pending moderation work.
        _make_recipe(db, producer, moderation_status="approved", published=True)
        _make_recipe(db, producer, moderation_status="rejected")

        stats = client.get(
            "/admin/dashboard", headers=auth_header(admin)
        ).json()["stats"]

        assert stats["pending_recipes"] == 2
        # The sidebar badge sum includes the recipe queue.
        assert stats["pending_moderation_count"] >= 2

    def test_no_recipes_contributes_zero(self, client, db):
        admin = make_user(db, role="admin", email=f"a{uuid4().hex[:6]}@t.com")
        stats = client.get(
            "/admin/dashboard", headers=auth_header(admin)
        ).json()["stats"]
        assert stats["pending_recipes"] == 0
