# 2026-06 UI-States Audit (MEH-228 · Audit 2/7)

> Refs MEH-228. **Read-only audit — no source-code edits.** Findings live in this
> file only; fixes open as separate per-cluster PRs/MEHs after Smadar triages.
> Branch: `feature/meh-228-ui-states-audit` (off `staging`).
> Method: 5 parallel read-only sub-agents by surface group (auth+register,
> dashboard+self-service, admin, public pages, map+events). Every claim is
> `file:line`, verified by reading the file. Severity ranked by **user impact**
> (duplicate-write / data-loss first).

## Finding format

Continues the AUD series convention of `docs/audits/2026-06-full-audit.md`, but
with a dedicated **UIS-###** id space (UI-States). Each row scores six states:
**Loading · Error · Empty · Success · Unauthorized · Idempotency** (`✓` present,
`✗` missing, `n/a` not applicable).

Severity rubric (by user impact):
- **CRITICAL** — destructive/important **write** missing idempotency or error →
  real duplicate-write / data-loss / moderation double-fire.
- **HIGH** — write/form missing error display, or a silent fetch-error that
  strands the user; geo-denied with no fallback.
- **MEDIUM** — read-only view missing skeleton/empty-state (poor UX, not broken).
- **LOW** — cosmetic gap, or state coverage already adequate.

### Synthesizer severity adjustments (transparency)

Sub-agents flagged some items CRITICAL that, on the rubric above, are **not**
duplicate-write/data-loss. Adjusted with reasoning, noted inline:
- `verify-email` redirect race → **MEDIUM** (stale-token GET + early redirect; no
  duplicate write).
- `reset-password` setTimeout redirect → **LOW** (the submit itself has
  loading+error+idempotency; only a cosmetic redirect race).
- `register/producer` step 2 submit → **HIGH** (has loading+error+idempotency; the
  server-side branch concern is not a client duplicate-write).
- `group-buys` commit-join → **HIGH** (idempotency guard present; gap is
  missing success feedback + a post-POST double-fetch, not a duplicate write).
- `ChatWidget` send → **HIGH** (idempotent via `sending` flag; gap is optimistic
  message persisting on API failure — misleading, not a duplicate write).
- `useProducersFeed` map load → **MEDIUM** (error caught; skeleton shown; gap is
  no spinner + silent error, not a blank screen).

---

## Exec summary — תקציר מנהלים (עברית)

נסרקו **5 משטחי frontend** (אימות+הרשמה, דשבורד+ניהול עצמי, אדמין, עמודים ציבוריים,
מפה+אירועים). נמצאו **~100 פעולות/טפסים/שליפות**. השורה התחתונה:

- **13 ממצאי CRITICAL** — כתיבות הרסניות/חשובות בלי הגנת idempotency או error,
  שעלולות לגרום ל**כתיבות כפולות / אובדן מידע / פעולת מודרציה כפולה**.
- **רוב ה-CRITICAL מתרכזים ב-3 דפוסי-שורש** (לא 13 באגים נפרדים):
  1. **Pattern A — handlers של אדמין** (`api.post` ואז `reload`, בלי `try/catch`
     ובלי לכבות את הכפתור בזמן הבקשה): reports (×4), users toggleBlock, content
     hidden-product (×2), producers quickApprove/toggleStatus/toggleAmbassador (×3).
     ~10 מתוך 13. תיקון אחד (helper משותף `useAdminAction`) סוגר את כולם.
  2. **Pattern B — טופס submit לא מושבת בזמן הבקשה** → יצירת מוצר כפולה
     (`HomeProductForm`).
  3. **Pattern C — מחיקה הרסנית בלי idempotency/confirm** (מחיקת חשבון, מחיקת מוצר
     ב-settings).
- **מחוץ ל-CRITICAL:** הדפוס הנפוץ ביותר הוא **שגיאת-fetch שקטה** (`.catch(() => [])`)
  בעמודי קריאה ציבוריים — המשתמשת רואה "אין תוצאות" בלי לדעת אם נכשלה הרשת. נפוץ
  ב-search, experiences, group-buys, events, reviews, map-feed, homepage load-more.

**המלצה ל-triage:** לפתוח קודם sub-MEH אחד ל-Pattern A (helper משותף), ואז B ו-C.
ה-HIGH של ה-fetch השקט יכול להיות sub-MEH רוחבי אחד (toast אחיד על כשל שליפה).

---

## Top 10 CRITICAL (recommended sub-MEH order)

Prioritised: data-loss/destructive first, then duplicate-write, then breadth.

| # | UIS | What | File:line | Why top |
|---|---|---|---|---|
| 1 | UIS-024 | Delete **account** — no idempotency guard | `frontend/app/[locale]/settings/page.jsx:637` | irreversible data-loss |
| 2 | UIS-026 | Delete **product** — no loading/confirm/idempotency | `frontend/app/[locale]/settings/page.jsx:991` | irreversible, rapid-click multi-delete |
| 3 | UIS-016 | `HomeProductForm` submit not disabled in-flight → **duplicate product** | `frontend/components/HomeProductForm.jsx:153` | duplicate public writes; appears on 2 surfaces |
| 4 | UIS-038 | Admin `suspendProducer` — no guards | `frontend/app/[locale]/admin/reports/page.js:27` | moderation double-fire (Pattern A) |
| 5 | UIS-041 | Admin `removeFlagged` (destructive) — no guards | `frontend/app/[locale]/admin/reports/page.js:37` | destructive moderation (Pattern A) |
| 6 | UIS-055 | Admin `toggleBlock` user — no guards | `frontend/app/[locale]/admin/users/page.js:45` | block/unblock double-fire (Pattern A) |
| 7 | UIS-061 | Admin delete hidden home-product — no guards | `frontend/app/[locale]/admin/content/page.js:134` | destructive (Pattern A) |
| 8 | UIS-064 | Admin `toggleStatus` producer — no guards | `frontend/app/[locale]/admin/producers/use-admin-producers.js:61` | suspend/activate double-fire (Pattern A) |
| 9 | UIS-063 | Admin `quickApprove` producer — no guards | `frontend/app/[locale]/admin/producers/use-admin-producers.js:57` | approve double-fire (Pattern A) |
| 10 | UIS-039 | Admin `approveFlagged` — no guards | `frontend/app/[locale]/admin/reports/page.js:32` | moderation double-fire (Pattern A) |

> Remaining CRITICALs (UIS-040 restore-hidden reports, UIS-060 restore-hidden
> content, UIS-065 toggleAmbassador) are the same Pattern A and close together
> with #4–#10 under one shared-helper fix.

---

## Root-pattern clustering

- **Pattern A — admin fire-and-reload, no `try/catch`, no in-flight disable**
  (10 CRITICAL). A shared `useAdminAction(fn)` helper (sets a busy id, awaits,
  toasts on error, disables the row's buttons) closes UIS-038/039/040/041, 055,
  060/061, 063/064/065 in one PR. Note: `category-requests`, `reviews`,
  `kashrut`, `experiences` already do this correctly (`actionLoading`/`busy`
  state) — they are the reference implementations.
- **Pattern B — form submit not disabled while submitting** → duplicate create
  (UIS-016 `HomeProductForm`). Fix: `disabled={submitting}` on the submit button.
- **Pattern C — destructive delete without idempotency/confirm** (UIS-024 delete
  account, UIS-026 delete product). Fix: confirm dialog + disable during request.
- **Pattern D (HIGH, cross-cutting) — silent fetch error `.catch(() => [])`**
  on public read pages (UIS-072, 073, 080, 081, 087, 091, 092, 094, 096, 098).
  Fix: one shared "couldn't load — retry" toast/empty-state variant.

---

## Findings — Auth + Registration

| UIS | File | Line | Component/Action | Load | Err | Empty | Succ | Unauth | Idem | Sev |
|---|---|---|---|---|---|---|---|---|---|---|
| UIS-001 | login/LoginClient.jsx | 218 | Login submit | ✓ | ✓ | n/a | ✓ | n/a | ✓ | LOW |
| UIS-002 | register/RegisterClient.jsx | 284 | Consumer register submit | ✓ | ✓ | n/a | ✓ | n/a | ✓ | MEDIUM (referral claim is non-blocking; silent loss if localStorage fails) |
| UIS-003 | register/producer/RegisterProducerClient.jsx | 698 | Producer step 2 (business) submit | ✓ | ✓ | n/a | ✓ | n/a | ✓ | HIGH (server-side branch concern; adj. from agent CRITICAL) |
| UIS-004 | register/producer/RegisterProducerClient.jsx | 359 | Producer step 1 "next" | ✗ | ✓ | n/a | n/a | n/a | ✓ | HIGH (no disabled during inline validation; rapid-click multi-transition) |
| UIS-005 | reset-password/ResetPasswordClient.jsx | 167 | Reset password submit | ✓ | ✓ | n/a | ✓ | n/a | ✓ | LOW (redirect-race only; adj. from agent CRITICAL) |
| UIS-006 | forgot-password/ForgotPasswordClient.jsx | 52 | Forgot password submit | ✓ | ✓ | n/a | ✓ | n/a | ✓ | MEDIUM |
| UIS-007 | verify-email/VerifyEmailClient.jsx | 16 | Email-verify API on mount | ✓ | ✓ | n/a | ✓ | n/a | ✗ | MEDIUM (no AbortController on unmount; redirect race — adj. from agent CRITICAL) |
| UIS-008 | components/PasswordInput.jsx | 82 | Password breach check (async) | ✓ | ✓ | n/a | ✓ | n/a | n/a | LOW (AbortController cancels stale) |
| UIS-009 | components/GoogleAuthButton.jsx | 15 | Google OAuth exchange | ✗ | ✓ | n/a | ✓ | n/a | ✗ | HIGH (native GSI button uncontrollable; no double-click guard) |
| UIS-010 | components/AppleAuthButton.jsx | 30 | Apple OAuth exchange | ✗ | ✓ | n/a | ✓ | n/a | ✗ | HIGH (no loading/disable; popup re-trigger possible) |
| UIS-011 | components/ProducerOAuthButtons.jsx | 33 | Producer OAuth finish | ✓ | ✓ | n/a | ✓ | n/a | ✓ | MEDIUM (good 409/429/401 branching) |

## Findings — Dashboard + Self-service

| UIS | File | Line | Component/Action | Load | Err | Empty | Succ | Unauth | Idem | Sev |
|---|---|---|---|---|---|---|---|---|---|---|
| UIS-012 | settings/page.jsx | 192 | Save profile | ✓ | ✓ | n/a | ✓ | ✓ | ✓ | LOW |
| UIS-013 | settings/page.jsx | 212 | Avatar upload | ✓ | ✓ | n/a | ✓ | ✓ | ✓ | LOW |
| UIS-014 | settings/page.jsx | 404 | Password change | ✓ | ✓ | n/a | ✓ | ✓ | ✓ | MEDIUM (no explicit double-submit guard) |
| UIS-015 | settings/page.jsx | 565 | Logout all devices | ✓ | ✓ | n/a | ✗ | n/a | ✓ | MEDIUM (no success state) |
| UIS-024 | settings/page.jsx | 637 | **Delete account** | ✓ | ✓ | n/a | ✓ | n/a | ✗ | **CRITICAL** |
| UIS-017 | settings/page.jsx | 757 | Business stats load | ✓ | ✗ | ✓ | n/a | ✓ | n/a | LOW (no error if fetch fails) |
| UIS-018 | settings/page.jsx | 877 | Add product | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | MEDIUM (submit not disabled during save) |
| UIS-019 | settings/page.jsx | 959 | Edit product | ✓ | ✓ | n/a | ✓ | ✓ | ✗ | MEDIUM (UI doesn't visually disable during savingEdit) |
| UIS-026 | settings/page.jsx | 991 | **Delete product** | ✗ | ✓ | n/a | ✓ | ✓ | ✗ | **CRITICAL** |
| UIS-020 | producer/dashboard/page.js | 109 | Availability toggle | ✓ | ✓ | n/a | n/a | ✓ | ✓ | HIGH (optimistic desync on failure; `alert()` not toast) |
| UIS-021 | producer/dashboard/page.js | 289 | Vacation date onBlur save | ✓ | ✗ | n/a | n/a | ✓ | ✓ | MEDIUM (no error if blur-save fails) |
| UIS-022 | producer/dashboard/page.js | 757 | Custom questions save | ✓ | ✗ | n/a | ✓ | ✓ | ✓ | HIGH (error not displayed; `alert()` on catch) |
| UIS-023 | producer/dashboard/page.js | 824 | Generate / save bio | ✓ | ✓ | n/a | ✓ | ✓ | ✓ | LOW |
| UIS-016 | components/HomeProductForm.jsx | 153 | **Product form submit** | ✓ | ✓ | n/a | ✓ | ✓ | ✗ | **CRITICAL** (button not disabled while submitting → duplicate product) |
| UIS-025 | components/HomeProductForm.jsx | 131 | Image upload | ✓ | ✓ | n/a | n/a | ✓ | ✓ | LOW |
| UIS-027 | favorites/FavoritesClient.jsx | 51 | Favorites fetch | ✓ | ✗ | ✓ | n/a | ✓ | n/a | LOW (silent error catch) |
| UIS-028 | components/AlertPrefsPanel.jsx | 74 | Alert prefs save | ✓ | ✓ | n/a | ✓ | ✓ | ✓ | MEDIUM (no idempotency on rapid save; double push-register) |
| UIS-029 | neighbor/NeighborClient.jsx | 47 | Create home product (wrapper) | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | HIGH (inherits UIS-016 submit-disable gap) |
| UIS-030 | rate/[token]/page.js | 30 | Rate product submit | ✓ | ✓ | n/a | ✓ | n/a | ✓ | LOW (already_rated guard) |
| UIS-031 | upgrade/UpgradeClient.jsx | 15 | Newsletter signup | ✓ | ✗ | n/a | ✓ | n/a | ✓ | LOW (best-effort; error swallowed by design) |

## Findings — Admin

| UIS | File | Line | Component/Action | Load | Err | Empty | Succ | Unauth | Idem | Sev |
|---|---|---|---|---|---|---|---|---|---|---|
| UIS-038 | admin/reports/page.js | 27 | **suspendProducer** | ✗ | ✗ | n/a | ✗ | n/a | ✗ | **CRITICAL** (Pattern A) |
| UIS-039 | admin/reports/page.js | 32 | **approveFlagged** | ✗ | ✗ | n/a | ✗ | n/a | ✗ | **CRITICAL** (Pattern A) |
| UIS-040 | admin/reports/page.js | 199 | **restore hidden product** | ✗ | ✗ | n/a | ✗ | n/a | ✗ | **CRITICAL** (Pattern A) |
| UIS-041 | admin/reports/page.js | 37 | **removeFlagged** (destructive) | ✗ | ✗ | n/a | ✗ | n/a | ✗ | **CRITICAL** (Pattern A) |
| UIS-042 | admin/category-requests/page.js | 37 | approve/reject/merge | ✓ | ✓ | n/a | ✓ | n/a | ✓ | LOW (reference impl) |
| UIS-043 | admin/reviews/page.jsx | 43 | delete review | ✓ | ✓ | n/a | ✓ | n/a | ✓ | LOW (reference impl) |
| UIS-044 | admin/kashrut/page.js | 54 | approve/reject kashrut | ✓ | ✓ | ✓ | ✓ | n/a | ✓ | LOW (reference impl) |
| UIS-045 | admin/experiences/page.js | 58 | approve experience | ✓ | ✓ | ✓ | ✓ | n/a | ✓ | LOW (`alert()` on error) |
| UIS-046 | admin/experiences/page.js | 83 | reject/changes modal | ✓ | ✓ | n/a | ✓ | n/a | ✓ | LOW |
| UIS-047 | admin/group-buys/page.js | 40 | updateStatus | ✓ | ✓ | ✓ | ✗ | n/a | ✓ | MEDIUM (no success toast) |
| UIS-055 | admin/users/page.js | 45 | **toggleBlock** | ✗ | ✗ | n/a | n/a | n/a | ✗ | **CRITICAL** (Pattern A) |
| UIS-056 | admin/users/page.js | 34 | applyRole promote/demote | ✓ | ✗ | n/a | n/a | n/a | ✓ | MEDIUM (no error toast) |
| UIS-057 | admin/content/page.js | 50 | create category | ✗ | ✗ | n/a | n/a | n/a | ✗ | HIGH (no loading/error; not disabled during POST) |
| UIS-058 | admin/content/page.js | 58 | update category | ✗ | ✗ | n/a | n/a | n/a | ✗ | HIGH |
| UIS-059 | admin/content/page.js | 62 | delete category | ✗ | ✗ | n/a | n/a | n/a | ✗ | HIGH (confirm gate only) |
| UIS-060 | admin/content/page.js | 130 | **restore hidden product** | ✗ | ✗ | n/a | n/a | n/a | ✗ | **CRITICAL** (Pattern A) |
| UIS-061 | admin/content/page.js | 134 | **delete hidden product** | ✗ | ✗ | n/a | n/a | n/a | ✗ | **CRITICAL** (Pattern A) |
| UIS-062 | admin/content/page.js | 176 | save page (about/terms) | ✓ | ✗ | n/a | ✓ | n/a | ✓ | MEDIUM (no error toast) |
| UIS-063 | admin/producers/use-admin-producers.js | 57 | **quickApprove** | ✗ | ✗ | n/a | n/a | n/a | ✗ | **CRITICAL** (Pattern A) |
| UIS-064 | admin/producers/use-admin-producers.js | 61 | **toggleStatus** | ✗ | ✗ | n/a | n/a | n/a | ✗ | **CRITICAL** (Pattern A) |
| UIS-065 | admin/producers/use-admin-producers.js | 76 | **toggleAmbassador** | ✗ | ✗ | n/a | n/a | n/a | ✗ | **CRITICAL** (Pattern A) |
| UIS-066 | admin/producers/use-admin-producers.js | 65 | deleteProducer | ✓ | ✓ | n/a | n/a | n/a | ✓ | MEDIUM (no disabled during DELETE) |
| UIS-067 | admin/outreach/page.jsx | 76 | lead status change | ✗ | ✓ | n/a | ✓ | n/a | ✗ | MEDIUM (no loading on select) |
| UIS-068 | admin/outreach/page.jsx | 86 | mint token | ✗ | ✓ | n/a | ✓ | n/a | ✗ | MEDIUM |
| UIS-069 | admin/outreach/page.jsx | 100 | delete lead | ✗ | ✓ | n/a | ✓ | n/a | ✗ | MEDIUM |
| UIS-070 | admin/outreach/page.jsx | 330 | AddLead modal submit | ✓ | ✓ | n/a | ✓ | n/a | ✓ | LOW |
| UIS-071 | admin/analytics/page.js | 10 | fetch analytics | ✓ | ✗ | ✓ | n/a | n/a | n/a | LOW (no-data states present) |
| UIS-048 | admin/group-buys/page.js | 99 | table loading/empty | ✓ | ✓ | ✓ | n/a | n/a | n/a | LOW |
| UIS-049 | admin/settings/page.js | 79 | admin settings save | ✓ | ✗ | n/a | ✓ | ✓ | ✓ | MEDIUM (no error state) |
| UIS-050 | admin/settings/page.js | 103 | vacation-mode save | ✓ | ✓ | n/a | ✓ | ✓ | ✓ | MEDIUM |

## Findings — Public pages

| UIS | File | Line | Component/Action | Load | Err | Empty | Succ | Unauth | Idem | Sev |
|---|---|---|---|---|---|---|---|---|---|---|
| UIS-072 | search/SearchClient.jsx | 78 | /producers + /search fetch | ✓ | ✗ | ✓ | n/a | n/a | n/a | MEDIUM (Pattern D: silent `.catch(()=>[])`) |
| UIS-073 | search/SearchClient.jsx | 142 | results grid | ✓ | ✗ | ✓ | n/a | n/a | n/a | MEDIUM (Pattern D) |
| UIS-074 | contact/ContactClient.jsx | 23 | contact submit | ✓ | ✓ | n/a | ✓ | n/a | ✓ | LOW |
| UIS-075 | producer/[id]/ProducerDetail.jsx | 44 | producer fetch | ✓ | ✓ | n/a | n/a | n/a | n/a | MEDIUM (404 text only; no network-error toast) |
| UIS-076 | components/ReviewsSection.jsx | 142 | submit review | ✓ | ✓ | n/a | ✓ | ✓ | ✓ | LOW (>=10 char guard, wa-gate) |
| UIS-077 | components/ReviewsSection.jsx | 99 | reviews fetch | ✓ | ✗ | ✓ | n/a | n/a | n/a | HIGH (Pattern D: error indistinguishable from empty) |
| UIS-078 | components/HomeProductForm.jsx | 95 | validate (debounced) | ✓ | ✗ | n/a | n/a | n/a | n/a | MEDIUM (REJECTED blocks submit w/o reason on net err) |
| UIS-079 | components/FavoriteButton.jsx | 47 | favorite toggle | ✓ | ✓ | n/a | ✓ | n/a | ✓ | LOW |
| UIS-080 | components/FavoriteButton.jsx | 36 | favorites status fetch | ✗ | ✗ | n/a | n/a | n/a | n/a | MEDIUM (silent) |
| UIS-081 | components/FollowButton.jsx | 25 | follow-status fetch | ✗ | ✗ | n/a | n/a | n/a | n/a | LOW (non-blocking) |
| UIS-082 | components/FollowButton.jsx | 35 | follow toggle | ✓ | ✓ | n/a | ✓ | n/a | ✓ | LOW |
| UIS-083 | components/ReportButton.jsx | 21 | submit report | ✓ | ✓ | n/a | ✓ | ✗ | ✗ | MEDIUM (no in-flight disable; rapid-click race) |
| UIS-084 | producer/[id]/ProducerDetail.jsx | 53 | loading + 404 | ✓ | ✓ | n/a | n/a | n/a | n/a | LOW |
| UIS-087 | experiences/ExperiencesClient.jsx | 37 | experiences fetch | ✓ | ✗ | ✓ | n/a | n/a | n/a | MEDIUM (Pattern D) |
| UIS-091 | page.js HomeProducersGrid | 150 | homepage load-more | ✓ | ✗ | ✓ | n/a | n/a | n/a | MEDIUM (silent pagination stop) |
| UIS-085 | components/ProducerCard.jsx | 77 | card heart toggle | ✓ | ✓ | n/a | ✓ | n/a | ✓ | LOW |

## Findings — Map + Events

| UIS | File | Line | Component/Action | Load | Err | Empty | Succ | Unauth | Idem | Sev |
|---|---|---|---|---|---|---|---|---|---|---|
| UIS-092 | map/state/useProducersFeed.js | 26 | producer feed fetch | ✗ | ✓ | ✓ | n/a | ✗ | n/a | MEDIUM (no loading returned; adj. from agent CRITICAL) |
| UIS-093 | map/MapClient.jsx | 92 | GPS (handleGpsClick) | ✓ | ✓ | n/a | n/a | n/a | ✓ | HIGH (denied→fallback modal; good) → keep as MEDIUM-HIGH watch |
| UIS-094 | components/MapComponent.jsx | 225 | GPS (goToMyLocation API) | ✗ | ✓ | n/a | n/a | n/a | ✗ | MEDIUM (no spinner in imperative API) |
| UIS-095 | map/MapPane.jsx | 120 | empty-state overlay | n/a | n/a | ✓ | n/a | n/a | n/a | LOW (gap: no empty when filtered to 0) |
| UIS-096 | events/EventsClient.jsx | 88 | events list fetch | ✓ | ✗ | ✓ | n/a | ✗ | n/a | HIGH (Pattern D; no 401/403) |
| UIS-097 | events/[id]/EventDetailClient.jsx | 34 | event detail fetch | ✓ | ✗ | ✓ | n/a | ✗ | n/a | HIGH (Pattern D) |
| UIS-098 | group-buys/GroupBuysClient.jsx | 103 | group-buys list fetch | ✓ | ✗ | ✓ | n/a | ✗ | n/a | HIGH (Pattern D) |
| UIS-099 | group-buys/[id]/GroupBuyDetailClient.jsx | 87 | group-buy detail fetch | ✓ | ✗ | ✓ | n/a | ✗ | n/a | HIGH (Pattern D) |
| UIS-100 | group-buys/[id]/GroupBuyDetailClient.jsx | 116 | commit join | ✓ | ✓ | n/a | ✗ | ✗ | ✓ | HIGH (no success feedback; post-POST double-fetch; adj. from agent CRITICAL) |
| UIS-101 | group-buys/[id]/GroupBuyDetailClient.jsx | 138 | cancel | ✓ | ✓ | n/a | ✗ | n/a | ✓ | HIGH (no success feedback after delete) |
| UIS-102 | components/ChatWidget.jsx | 148 | chat send | ✓ | ✓ | n/a | ✗ | n/a | ✓ | HIGH (optimistic msg persists on API failure; adj. from agent CRITICAL) |

---

## Counts (post-synthesis judgment)

- **CRITICAL: 13** — UIS-016, 024, 026 (B/C cluster) + UIS-038, 039, 040, 041,
  055, 060, 061, 063, 064, 065 (Pattern A admin cluster, 10).
- **HIGH: ~16** — UIS-003, 004, 009, 010, 020, 022, 029, 057, 058, 059, 077,
  096, 097, 098, 099, 100, 101, 102 (silent-fetch Pattern D + missing-error
  forms + OAuth idempotency).
- **MEDIUM: ~22** — password change, logout, add/edit product, alert prefs,
  outreach trio, content save-page, group-buy status, admin settings ×2,
  silent-fetch reads (search/experiences/homepage/favorites-status), report
  in-flight, producer fetch, validate, map feed, GPS API, vacation blur.
- **LOW: ~17** — fully-covered flows (login, contact, reviews submit, favorite
  /follow/heart toggles, bio, rate, reference admin handlers, table states).

_(Counts are by surface-deduped UIS rows; HIGH/MEDIUM bands are approximate
because several rows sit on a band boundary — the Top-10 + Pattern clustering
above is the actionable output, not the band totals.)_

---

## Verify pass

- ✅ Coverage: forms, mutations (`api.post/patch/delete`), destructive
  buttons, and data-fetches across all 5 surfaces were scanned.
- ✅ Every row carries a `file:line` produced by reading the file (sub-agents
  are read-only — no Edit/Write capability).
- ✅ Every row classified CRITICAL/HIGH/MEDIUM/LOW; severity re-derived by the
  user-impact rubric (six agent CRITICALs downgraded with reasons, listed under
  "Synthesizer severity adjustments").
- ✅ Top 10 CRITICAL listed with `file:line` for sub-MEH triage; clustered into
  4 root patterns (A–D) so fixes are a handful of PRs, not 50.
- ✅ Hebrew exec summary present.
- ⚠️ **Not exhaustive at line precision.** Sub-agents read the files but a few
  line numbers are approximate (component bodies span hundreds of lines); treat
  `file:line` as "start of the handler/region", confirm exact line at fix time.
- ⚠️ **No code changed** — this is the audit deliverable only. Fixes open as
  separate per-cluster PRs/MEHs after Smadar triages (per MEH-228 scope).

_Generated by 5 parallel read-only sub-agents, 2026-06-06 overnight batch._
