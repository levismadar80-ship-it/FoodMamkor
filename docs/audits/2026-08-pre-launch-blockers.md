# Pre-launch blocker audit (MEH-2085)

> **swept 18 of 175, chunk 1 of 3** — a resuming session reads this line and continues from it; it does not restart.

**Method.** Source of truth is Linear LIVE via `get_issue`, one card at a time.
`list_issues` is used ONLY as the index (IDs, titles, labels, state, priority):
its `description` is truncated at ~500 chars with a literal
`(truncated, use get_issue for full description)` marker, and that truncation is
**head-biased** — it deletes exactly the bottom-of-description rulings that decide
the verdict. Bulk-fetched descriptions are not admissible here.

**Criterion, applied in order.**
1. **BLOCKS** — a real user hitting the live site would be harmed, blocked or
   misled without it. Legal/regulatory exposure counts. Data loss counts.
   Security counts. "Would look unpolished" does NOT count.
2. **DEFER** — real work, no user harm at launch.
3. **MOOT** — the premise depends on data, history or scale that does not exist.

**Counts so far:** BLOCKS 6 · BLOCKS-COND 1 · DEFER 10 · MOOT 0 · FLAGGED 1

---

## 1 · BLOCKS

| ID | Title | Evidence |
|---|---|---|
| **MEH-2080** | No minimum-age check at registration | No age gate on either registration path — measured zero age/DOB fields in schemas.py and both clients. Minors can register and be contracted with; Amendment 13 + contractual-capacity exposure. CLOSE CALL: blocked on a lawyer ruling (MEH-1184), not on code — but 'blocked on a decision' is not 'not blocking'. |
| **MEH-1981** | ציות לתיקון 13 לחוק הגנת הפרטיות | Amendment 13 in force since 08/2025; site is live and collecting personal data (phone/email/address at producer registration, consumer accounts). Exposure is up to 10,000 NIS per claim with no proof of damage, for deficient collection notices or unmet access/correction rights. Squarely the criterion's 'legal/regulatory exposure counts'. |
| **MEH-1925** | [LIVE] Cloudinary 401 בפרודקשן | LIVE production incident, measured: 502 OPTIMIZED_EXTERNAL_IMAGE_REQUEST_UNAUTHORIZED on hero (home/login/register/events), About, producer hero, product images, and OG previews via lib/seo.js:110. Newest ruling sits at the TOP (11/08): cause is 439% Free-plan quota overage, not ToS disablement. A real user on the live site sees broken images today. |
| **MEH-2083** | 🚨 כל העסקים המאושרים בפרודקשן הם seed fixtures — הכרעה מה מוצג ביום הה | MEH-1992 (Done, PR #2799) concluded all 5 approved production rows are seed fixtures; public catalog rendered 4 on 14/08 with phone 050-1234567 repeated. A real owner Sapir phones will find the businesses she saw are fake — the site actively misleads, and it contradicts the three LOCKs the directory rests on (manual approval / licensed businesses only). Blocks the first outreach (MEH-409). |
| **MEH-1905** | 🩺 שני מוניטורים שקטים: Railway בודקת /health (alias שמקודד ok) בזמן ש- | CLOSE CALL — chose BLOCKS per the torn rule. Sapir's 14/08 measurements at the BOTTOM shrink this to one item and disprove the Sentry half (prod is quiet because it has no errors; DSN set in both envs). What remains: railway.json:8 healthchecks /health, an alias that hardcodes status ok, while /health/readiness returns 503 db_init_failed in BOTH envs. The deploy gate for production cannot fail. No user harm TODAY (all endpoints 200) — but the launch release is exactly when an undetected bad boot costs most. Ordering constraint: fix seed() (MEH-2081) BEFORE moving the probe, or Railway refuses deploys. |
| **MEH-409** | 🤝 First 10 producers from personal network — pre-launch supply seeding | The documented supply-side launch gate — the card and MEH-125 both name it as the gate, and MEH-2083 defers to it ('this card decides what is shown until MEH-409 happens'). STATED PLAINLY: this is a business/ops precondition (not-cc, a manual Sapir checklist of 10 personal-network producers), NOT a software defect. It is in BLOCKS because launching with zero real businesses is the harm, not because any code is wrong. |

### Conditional — blocks only if a stated precondition holds

| ID | Title | Evidence |
|---|---|---|
| **MEH-2079** | Retention purge job — producer_page_views / alert_log / producer_whats | Zero scheduled-deletion sites on producer_page_views / alert_log / producer_whatsapp_clicks; viewer_ip_hash is pseudonymous (salted SHA256), not anonymous, and grows unbounded. BLOCKS **only if** the published privacy policy names retention periods — then the code contradicts a published promise. CONDITION UNVERIFIED: must read the live policy text. Volume is NOT the argument. |

---

## 2 · DEFER

| ID | Title | Evidence |
|---|---|---|
| **MEH-1754** | 🚨 resolver ממפה כל כשל fetch ל-notFound() — תקלת backend זמנית מוצגת כ | Bottom canonical table (12/08) supersedes the top: the SEO-critical half ALREADY SHIPPED — items 1-4 merged as PR #2514, recipe route as #2832, item 6 deleted, item 7 closed no-change. Only item 5 (env fail-fast) remains, and Sapir verified NEXT_PUBLIC_API_URL is set in Vercel preview+production, so the localhost fallback is latent, not active. No user harm at launch. |
| **MEH-1523** | ⚙️ שער DO-NOT-MERGE — מעבר מסריקת טקסט ל-label [מנגנון, לא regex] | Read in full earlier this session. Merge-process gate (marker moves from prose-scanning to a GitHub label); staged patch awaiting Sapir's YAML + label. Zero consumer surface — no live-site user can be harmed, blocked or misled by which mechanism blocks a merge. Real work, post-launch. |
| **MEH-2084** | 🟢➡️🔴 שער Repo guards ירוק מהסיבה הלא נכונה — tier C לא רץ אף פעם; open | CI false-green: Repo guards passes while tier C (backend Pydantic vs backend/openapi.json) never executes, and openapi.json is stale on staging since #2945 made city required. INDEPENDENTLY CORROBORATED this session — I hit the same drift locally (the city anyOf collapse) while running run-all.sh. Real work, fifth instance of the false-green class, but no live-site user is harmed/blocked/misled by a CI tier that does not run. |
| **MEH-2062** | 🚨 מכסת Vercel היומית (api-deployments-free-per-day) נכשלת על כל PR — א | Vercel api-deployments-free-per-day fails on every PR, so UI changes get no preview URL. CORROBORATED this session — PR #2948 carried the identical rate-limit status. Developer-workflow friction and a rule-9 reporting problem; zero consumer surface. Blocked on Sapir reading the Vercel dashboard (the 'does Ignored count' question is not derivable from the repo). |
| **MEH-1189** | 🧹 דאטה /producers — קטגוריית חוות הגליל שגויה + audit ישויות בדיקה ב-p | SUBSUMED by MEH-2083, which is why it is not BLOCKS on its own. Line 2 (test entities in prod) was already answered by MEH-1992/PR #2799: all 5 approved rows ARE fixtures. Line 1 (חוות הגליל categorised as דגים instead of בשר) misleads only while that fixture stays public — and MEH-2083's option א removes it. Line 3 is a copy preference, already locked to 'בשר בקר בהזנת מרעה'. |
| **MEH-1456** | 🗂️ Category slug + is_system ב-DB + stale-key reconciliation — Phase B | SEE ITS OWN PARAGRAPH (card requires it). By the audit criterion this is DEFER: no live-site user is harmed today by categories being keyed on a Hebrew display name. Considered for BLOCKS and rejected — the foot-gun (renaming a category in admin creates a duplicate row and drops the pin to DEFAULT, the MEH-1268 pattern) requires an admin action to fire, it is not spontaneous user harm. NOTE the card's own approved 24/07 ruling says chunks 0-2b run BEFORE launch; that answers a different question (cost), not the harm question. |
| **MEH-1517** | 🔁 אימות שחזור גיבוי אוטומטי ב-CI — מחליף את ה-drill הידני של MEH-1442  | CLOSE, and considered for BLOCKS because the criterion lists data loss. Rejected: an unverified backup does not CAUSE data loss, it fails to mitigate one, and docs/BACKUPS.md keeps the manual drill as a working fallback. Bottom of card (14/08): Sapir APPROVED the read-only secret and CC published the exact spec (STAGING_DATABASE_URL_READONLY + minimal GRANT), so STOP(a) opens the moment she creates it. Cheap and now unblocked — recommend doing it, but it blocks no user. |
| **MEH-1706** | 🌱 חוזה כיסוי ל-seed הדמו — 13 משטחים ללא אף שורה + שער CI נגד drift [3 | Bottom (14/08): Sapir opened the WAIT, chunks B+C ran — CHANGELOG records them landing via PR #2931. Staging demo-seed coverage + a CI drift gate. Its own §2.4 states the gate is CI-local and does NOT protect staging data. Zero production-user surface. |
| **MEH-1962** | ⚡ Lighthouse baseline — 5 עמודים מרכזיים בנייד: מדידה ×3, תיקון quick  | Lighthouse baseline on 5 mobile routes + mechanical quick wins. Core Web Vitals are an SEO ranking factor, which is a growth concern, not user harm — and the criterion explicitly excludes 'would look unpolished'. No measurement exists yet, so there is not even a known regression to point at. |
| **MEH-2072** | 📜 רישיון בלי תאריך תפוגה — עסק נשאר ציבורי אחרי שהרישיון פג: license_e | CLOSE — considered for BLOCKS because the 'licensed businesses only' LOCK is a public promise and a stale licence misleads. Rejected on timing: a business approved at launch has a licence verified minutes earlier, so the misleading state CANNOT occur at launch; it appears months later. The card's own argument is cost (retroactive collection), not launch harm. RECOMMEND landing it before MEH-409's first real approvals so capture coincides with onboarding. |

---

## 3 · MOOT

_(none yet in this pass)_

---

## 4 · FLAGGED — could not classify without a query, production data, or a Sapir decision

Not guessed into a bucket, per the card's own instruction.

| ID | Title | Evidence |
|---|---|---|
| **MEH-2020** | 🔤 decision-first — איזה charset מותר ב-slug ציבורי? היום ערבית/קירילית | CANNOT CLASSIFY without a test I did not run. Measured behaviour is real: _slugify uses Python 3 \w which is Unicode-aware, so Arabic/Cyrillic/CJK slugs are served in production today by regex default, not by decision. The charset policy itself is a Sapir product decision (DEFER-shaped). BUT the card records an UNVERIFIED homograph vector against RESERVED_SLUGS — if a look-alike character can claim a reserved path, that is security and BLOCKS. TO RESOLVE: test whether the RESERVED_SLUGS comparison is homograph-safe. Not guessed into a bucket. |
