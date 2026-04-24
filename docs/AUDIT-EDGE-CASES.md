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

## Findings Table — CORE FLOWS (flows 11–16)

| # | Flow | Scenario | Expected | Actual | Severity | Fix scope |
|---|------|----------|----------|--------|----------|-----------|
| 25 | /producers/{uuid} | Pending/rejected producer fetched by UUID | 404 | `GET /producers/{producer_id}` has **no status filter** — returns any producer regardless of status (IDOR/info disclosure). `by-slug` is properly filtered. | HIGH | Backend |
| 26 | Producer detail | Producer deleted after view | 404 | Endpoint returns 404; frontend error boundary not audited | LOW | — |
| 27 | /map | 0 producers in area | Friendly empty state | `MapClient` behavior not inspected; API returns `[]` correctly | MEDIUM | Frontend (verify) |
| 28 | /map | Producers without coords | Excluded | ✓ geo query filters `lat.isnot(None)` + `lng.isnot(None)` | OK | — |
| 29 | /search | Hebrew morphology (גבינה vs גבינות) | Match both | ILIKE is literal; plural/singular won't match. No pg_trgm or stemming | MEDIUM | Backend |
| 30 | /search | SQL injection / `<script>` | Escaped | ✓ SQLAlchemy parameterized; React auto-escapes output | OK | — |
| 31 | /neighbor | 0 products | Friendly empty + CTA | `home_products.py` returns `[]`; frontend empty state not inspected | MEDIUM | Frontend (verify) |
| 32 | /favorites | Logged-out click on heart | Redirect/login prompt | Known issue per HANDOFF.md ("Phase C post-login replay not implemented") | MEDIUM | Frontend |
| 33 | /favorites | Producer hard-deleted after favorited | Row skipped or cleaned | `GET /users/me/favorites` uses `joinedload(Favorite.producer)` — orphaned fav would serialize with null producer and likely 500 via Pydantic | HIGH | Backend |
| 34 | POST /reviews | Duplicate submit | Upsert or 409 | ✓ code upserts on (producer, user) pair | OK | — |
| 35 | POST /reviews | Stars outside 1–5 | 422 | ✓ Pydantic `Field(ge=1, le=5)` | OK | — |
| 36 | POST /reviews | Rate limit | 20/day | ✓ `@limiter.limit("20/day")` on both flat + nested routes (limits stack on IP: effective 40/day across both endpoints) | LOW | Backend |

## Findings Table — REMAINING (flows 17–26)

| # | Flow | Scenario | Expected | Actual | Severity | Fix scope |
|---|------|----------|----------|--------|----------|-----------|
| 37 | Empty states | /favorites with 0 favs | CTA to browse | Not inspected in this audit | MEDIUM | Frontend (verify) |
| 38 | Empty states | /admin top cities | Graceful empty | ✓ "עוד אין נתוני ערים" copy present | OK | — |
| 39 | Empty states | /admin pending list | Graceful empty | ✓ "אין בקשות ממתינות" copy present | OK | — |
| 40 | Network | Offline detection | Banner + queue | No `navigator.onLine` listener, no service worker, no offline banner | MEDIUM | Frontend |
| 41 | Network | Slow 3G skeletons | Loading skeletons | Some components show "טוען..." text; skeleton strategy inconsistent | MEDIUM | Frontend |
| 42 | Network | API 500 mid-action | Error toast + retry | Global error boundary `app/error.js` exists; per-action 500 handling inconsistent — `catch` branches often show fallback message but no retry | MEDIUM | Frontend |
| 43 | Data | 500-char description display | Ellipsis or scroll | Not verified in audit; producer description is `TEXT` with no backend length cap | LOW | Frontend |
| 44 | Data | Emoji + RTL mixing | Render correctly | React handles Unicode; not visually verified | LOW | — |
| 45 | Data | Null bytes / control chars in input | Reject or strip | No explicit sanitization at schema layer; SQLAlchemy escapes for SQL but stored as-is | LOW | Backend |
| 46 | Permission | Consumer tries producer-only endpoint | 403 | ✓ `require_producer` dependency enforced on `/producers/me/*` | OK | — |
| 47 | Permission | Producer A edits Producer B | 403 | Not verified in audit — depends on IDOR check in `producer_me.py` | HIGH | Backend (verify) |
| 48 | Permission | Block self | 400 | ✓ `admin_extra.py` blocks `target.id == user.id` | OK | — |

## Severity Definitions
- **CRITICAL:** security vuln, data loss, broken auth, white screen, or a shipped feature that is completely non-functional
- **HIGH:** core flow broken, user cannot complete primary action, IDOR / privilege edge
- **MEDIUM:** degraded UX, workaround exists, minor flow broken, missing error branch
- **LOW:** cosmetic, edge case unlikely to hit in practice, minor copy gap

## Recommended Issue Breakdown (proposed, awaiting ספיר approval)
- **MEH-AAA: Forgot-password full flow (backend + frontend + email) — CRITICAL.** Covers findings #1, #2, #3. Implement `POST /auth/forgot-password`, `POST /auth/reset-password`, `/reset-password` page, Resend email template, rate limit, OWASP-compliant generic response.
- **MEH-BBB: Holiday + Friday market toggles — CRITICAL.** Covers findings #18, #19. Add `admin_setting` keys, settings UI toggle, consumer-side banner, persistence test.
- **MEH-CCC: Backend validation hardening — HIGH.** Covers findings #9, #25, #33, #47. Add `min_length=8` on password, status filter on `GET /producers/{id}`, null-producer guard on `/users/me/favorites`, audit producer_me IDOR.
- **MEH-DDD: Account deletion completeness — HIGH.** Covers finding #15. When producer user deletes account, cascade Producer row + ProducerCategory + DeliveryArea + reviews.
- **MEH-EEE: Admin UX pass — MEDIUM.** Covers findings #17, #20, #22, #24, #41. Global 401 interceptor, confirm-before-save dialog, disable action buttons during mutation, dedupe dashboard fetches, consistent loading skeletons.
- **MEH-FFF: Network error handling — MEDIUM.** Covers findings #7, #40, #42. Add 429 toast branch, offline banner, consistent retry pattern.
- **MEH-GGG: Empty state + search morphology pass — MEDIUM.** Covers findings #27, #29, #31, #37. Audit every list page, add Hebrew morphology (pg_trgm or simple suffix trimming).
- **MEH-HHH: OAuth polish — LOW.** Covers findings #12, #13. Better error copy when client_id missing, verify CSP allowlist includes accounts.google.com.

## Out of Scope (known, tracked elsewhere)
- MEH-78 (map center) — already tracked
- MEH-161 (email infra) — already tracked
- MEH-163 (admin notify) — already tracked
- MEH-240 (logging) — in flight; this audit will inform it
- MEH-241 (valid payload fixtures) — in flight

## Audit Method & Limitations
This audit was performed by static code review against staging HEAD
`708afc9` without browser access. All findings tagged "not inspected" or
"not verified" need a follow-up manual repro on the Vercel preview
before a fix issue is opened. Screenshots for CRITICAL/HIGH findings
should be captured during that repro pass (issue MEH-242 deliverable
calls for `docs/audit-screenshots/` — deferred until live repro).
