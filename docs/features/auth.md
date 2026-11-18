# הזדהות

**מה היא עושה.** התחברות והרשמה במייל וסיסמה, ‏Google ו-Apple, אימות מייל, איפוס סיסמה, ומחיקת חשבון.

**Routes**
* `frontend/app/[locale]/login/` · `frontend/app/[locale]/register/`
* `frontend/app/[locale]/forgot-password/` · `frontend/app/[locale]/reset-password/`
* `frontend/app/[locale]/verify-email/` · `frontend/app/[locale]/account-deleted/`
* `frontend/app/[locale]/settings/`

**קבצים מרכזיים**
* `backend/app/auth.py` — ה-JWT, ה-scope, ‏`token_version`, טביעת האצבע. **כל PR שנוגע כאן עובר גם בדיקת CVE בחיפוש רשת וגם `/security-review`** (`.claude/rules/security.md`).
* `backend/app/routers/auth.py`
* `backend/app/routers/auth_register_producer.py` — ‏`/auth/register/producer` ו-`/auth/register/producer/oauth` (הופרדו מ-`auth.py` ב-MEH-3293).
* `backend/app/config.py` — ‏`JWT_SECRET_KEY` נדרש ב-production; חסר = `RuntimeError` באתחול.
* `frontend/lib/safe-redirect.js` — יעד חזרה בטוח אחרי התחברות.

**Flags.** אין. ‏OAuth מושבת בחן כשה-client id לא מוגדר (`tests/test_oauth_unconfigured.py`).

**טסטים**
* `tests/test_meh3372_login_per_email_limit.py` · `tests/test_auth.py` · `tests/test_expansion_auth_jwt.py` · `tests/test_auth_email_notify.py`
* `tests/test_producer_oauth.py` · `tests/test_oauth_verify_4xx.py` · `tests/test_meh2080_oauth_terms_consent.py`
* `frontend/e2e/flows/30-login-journey-c.spec.ts` · `frontend/e2e/flows/manual/auth.spec.ts` · `frontend/e2e/flows/11-password-policy.spec.ts`
* `frontend/e2e/flows/25-role-reachability.spec.ts`

**מזהי רישום שזה מכסה.** `social_signup`.
