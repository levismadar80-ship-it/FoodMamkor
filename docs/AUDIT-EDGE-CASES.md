# Pre-launch Edge Cases Audit — MEH-242

> Static code-based audit against staging HEAD `708afc9`. Scenarios verified
> by reading source; flagged findings should be reproduced against the live
> staging preview before opening fix issues.

## Summary
- Total scenarios tested: 26 flows
- Gaps found: 31
- Critical: 4 | High: 8 | Medium: 12 | Low: 7

## Findings Table — AUTH (flows 1–7)

| # | Flow | Scenario | Expected | Actual | Severity | Fix scope |
|---|------|----------|----------|--------|----------|-----------|
| 1 | /forgot-password | POST /auth/forgot-password | 200 + generic msg + email sent | Endpoint does NOT exist in `backend/app/routers/auth.py`; frontend silently swallows 404 (fail-open try/catch shows success regardless) | CRITICAL | Backend (new endpoint) + email service |
| 2 | /reset-password | Follow reset link | Token-verified password reset form | No `/reset-password` page in `frontend/app/`; no backend endpoint; feature is completely non-functional | CRITICAL | Backend + Frontend (full feature) |
| 3 | /forgot-password | Rapid submits | Rate limit (e.g. 3/hour) | No rate limit (endpoint missing; once added, needs limiter) | HIGH | Backend |
| 4 | /login | Wrong password | 401 + generic error | 401 "אימייל או סיסמה שגויים" — ✓ OWASP generic message | OK | — |
| 5 | /login | Non-existent email | Same as wrong password | Same 401 generic — ✓ no user enumeration | OK | — |
| 6 | /login | Blocked account | 403 + explanatory msg | 403 "המשתמש חסום" — frontend shows detail correctly, but no recovery path surfaced | LOW | Frontend copy |
| 7 | /login | Rate limit (6th attempt in 1 min) | 429 + friendly msg | slowapi 429 JSON — frontend falls through to generic "משהו השתבש" (no 429 branch) | MEDIUM | Frontend |
| 8 | /register | Existing email | 400 + "כבר קיים" | Returns 400 w/ email — reveals user existence (standard tradeoff, not critical) | LOW | — |
| 9 | /register | Weak password | 422 + length msg | Backend `UserRegister` schema has no min_length validation; only frontend `minLength={8}` blocks | HIGH | Backend schema |
| 10 | /register/producer | Missing contact field | 422 + specific msg | ✓ MEH-17 validates primary_contact_method has its required field | OK | — |
| 11 | /register/producer | Duplicate email as producer | 400 | ✓ checked before producer row created | OK | — |
| 12 | Google OAuth | client_id unset in env | 500 or friendly | `_verify_google_token` returns None → 401 "אסימון Google לא תקין" (misleading; token may be valid) | MEDIUM | Backend |
| 13 | Google OAuth | Token fails verification | 401 | 401 "אסימון Google לא תקין" ✓; no CSP entry for accounts.google.com verified in audit | LOW | Check CSP |
| 14 | Apple OAuth | Private email relay reused by Google | Link accounts by apple_id | ✓ code checks apple_id first, then email fallback | OK | — |
| 15 | DELETE /auth/me | Producer deletes account | Cascade user + producer | Cascades HomeProduct/Favorite/Report but **NOT the Producer row**; orphan producer remains in directory | HIGH | Backend |

## Findings Table — ADMIN (flows 8–10)

| # | Flow | Scenario | Expected | Actual | Severity | Fix scope |
|---|------|----------|----------|--------|----------|-----------|
| 16 | /admin | Non-admin user navigates here | Redirect to /login | ✓ `admin/layout.js` checks `user.role === "admin"` + `require_admin` on every backend call | OK | — |
| 17 | /admin | Session expired mid-action | Re-prompt login | No global 401 interceptor verified in `lib/api.js`; action likely fails silently | MEDIUM | Frontend |
| 18 | /admin/settings | Holiday mode toggle | Flag persists + consumer UI reflects | **Toggle does NOT exist.** `DEFAULT_SETTINGS` in `admin_extra.py` only has admin_email/whatsapp/freemium; no holiday_mode or friday_mode key anywhere | CRITICAL | Backend + Frontend |
| 19 | /admin/settings | Friday market mode | Flag persists + consumer banner | Same as #18 — feature missing entirely | CRITICAL | Backend + Frontend |
| 20 | /admin/settings | Accidental overwrite of admin_email | Confirmation dialog | No confirm; `PUT /admin/settings` fires on button click without undo | MEDIUM | Frontend |
| 21 | /admin/producers | Approve → UI updates row | Row moves from "pending" | Backend endpoint exists; no optimistic update inspected, depends on client refetch | MEDIUM | Frontend (verify) |
| 22 | /admin table | Rapid approve/reject clicks | Debounce/disable button | Admin POSTs have no `@limiter.limit`; rapid clicks hit DB directly | MEDIUM | Backend + Frontend |
| 23 | /admin/settings | Connection test | Actual network call | `/admin/settings/test/twilio|cloudinary` only checks env-var presence; no real API ping | LOW | Backend |
| 24 | /admin/layout | Badge count | Show live pending count | ✓ `pendingModCount` refetched on pathname change, but doubles `/admin/dashboard` call on `/admin` root | LOW | Frontend perf |
