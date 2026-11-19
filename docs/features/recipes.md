# מתכונים

**מה הם עושים.** בית עסק מפרסם מתכון שמשתמש במוצרים שלו. המתכון עובר מודרציה של AI ואז תור אישור של הניהול, ומתפרסם תחת ה-slug של בית העסק.

**Routes**
* `frontend/app/[locale]/[slug]/recipes/[recipe_id]/`
* `frontend/app/[locale]/producer/dashboard/recipes/` ‏(+ `[id]/edit`)
* `frontend/app/[locale]/admin/recipes/`
* כתובת מתכון עם ה-slug הישן של בית עסק ששינה כתובת מקבלת 301 לכתובת החדשה (MEH-3342), דרך `frontend/middleware.js` ו-`frontend/lib/middleware-exists.js`, רק כשהמתכון מפורסם בכתובת החדשה.

**קבצים מרכזיים**
* `backend/app/routers/producer_recipes.py`
* `backend/app/services/producer_recipe_moderation.py`

**Flags.** אין.

**טסטים**
* `tests/test_producer_recipes.py` · `tests/test_producer_recipe_moderation_unit.py`
* `tests/test_meh2910_recipe_patch_idor.py` — בדיקת בעלות.
* `tests/test_meh1000_recipe_admin_notification.py` · `tests/test_meh1361_recipe_alert.py` · `tests/test_meh997_admin_recipes_badge.py`
* `tests/test_meh3342_recipe_old_slug.py` · `frontend/__tests__/MiddlewareRecipeSlugMoved.test.js` — הפניה מכתובת ישנה.
* `frontend/e2e/flows/20-admin-recipes-queue.spec.ts` · `frontend/e2e/flows/manual/admin-recipes-kebab.spec.ts`

**מזהי רישום שזה מכסה.** `recipes`.
