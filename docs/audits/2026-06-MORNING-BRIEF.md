# 🌅 בריף בוקר — 2026-06-07

> סינתזה של עבודת הלילה. נכתב ע"י session סינתזה (read-only על קוד הזולת; כתב רק את הבריף הזה + תגובות pre-review ב-PRs). **Skeptic Mode:** טענות "CI green" אומתו מול ה-check runs, לא מול ה-ledger. ממצאים שלא ניתן לאמת מסומנים _unverified_.
>
> זמן צילום מצב: ~21:55 UTC, 2026-06-06. שישה PRs פתוחים.

---

## 1. שורה אחת — מה קרה הלילה

6 PRs פתוחים מ-5 sessions לילה (3 backend/2 frontend code + 1 docs); **2 מתוך 5 סיכוני-העל של ביקורת `2026-06-full-audit` נסגרים הלילה** (AUD-009/010 ב-#991, AUD-039/040 ב-#995); סקירת-diff עברה על כל ה-6 — **אפס Must-Fix מכני**, 3 watch-items; ביקורת-העל מנתה 56 ממצאים (0 RED, 33 YELLOW, 23 GREEN) שמתוכם ~23 issues מוצעים לבק-לוג.

---

## 2. חמש פעולות ה-30 דקות (לפי סדר)

1. **#975 (test-expansion) — לבדוק שה-pytest רץ ולא דולג.** ה-check `Backend tests (pytest)` הופיע כ-**`skipped`** על PR שמוסיף `tests/test_*.py`. תחת Rulesets check נדרש שדולג = "Expected" = **חוסם merge**. → rebase על `origin/staging` ולוודא שה-pytest **מבוצע ירוק**. זה ה-anchor של רכבת MEH-214.
2. **למזג #975 ראשון** (נועל את חוזה ה-bool של WhatsApp וחוזה קודי-הסטטוס של availability שעליהם #991/#995 נשענים).
3. **#996 (events/new categories) — merge בטוח-עצמאי.** טריוויאלי, frontend קובץ אחד, מפתחות i18n אומתו בשתי השפות. אפשר למזג מיד.
4. **#994 (launch_cohort tag) — merge בטוח-עצמאי.** Frontend-only, additive, **לא-draft (מוכן)**. אחרי merge: לזכור לעדכן `LAUNCH_START` ביום ההשקה.
5. **#997 (docs ledger) — merge/דריקט.** Docs-only; לפי Rule 7 אפשר ישר ל-staging בלי PR.

> נשאר טרמינל ×2 (פעולות שחייבות לרוץ אצל ספיר): (א) ה-Alembic של WhatsApp `outbound_messages` (מוכן ב-body של #991), (ב) תיקוני `.env.example` (DEFER-ENV — חסום ע"י env-read hook). פירוט בסעיף 6.

---

## 3. רכבת המרג'ים המלאה

| # | PR | מה | בטוח-עצמאי? | תלות-סדר | הערה |
|---|---|---|---|---|---|
| 1 | **#975** | test-expansion (72 tests) | כן* | — | *קודם לוודא pytest לא-skipped. נועל חוזים → ראשון ב-MEH-214 |
| 2 | **#991** | WhatsApp 200≠delivered (AUD-009/010) | כן | **אחרי #975** | חוזה bool ש-#975 נועל. Base 5 commits מאחורי staging → `git merge origin/staging` קודם |
| 3 | **#995** | availability validation + tz (AUD-039/040) | כן | אחרי #975 (לא חוסם את #991) | Base = staging tip. read-path tz עדיין פתוח (follow-up) |
| 4 | **#994** | launch_cohort Sentry tag (MEH-434) | **כן — עצמאי** | — | לא-draft. frontend-only |
| 5 | **#996** | events/new EN categories (MEH-475) | **כן — עצמאי** | — | קובץ אחד, 0 עריכות JSON |
| 6 | **#997** | night-batch-6 ledger | **כן — עצמאי** | — | docs-only |

**קצוות-סדר (reason per edge):**
- `#975 → #991`: #975 מוסיף 5 בדיקות send-layer שנועלות את חוזה ה-`bool` ש-#991 משמר. תיעוד-מקור: hint המשימה + body של #991.
- `#975 → #995`: #995 משאיר במכוון את ה-auto-clear ב-`schemas.py:591` כדי ש-#975 AV-3 (`test_vacation_ending_today_is_not_auto_cleared`) יישאר ירוק. אם #995 ימוזג ראשון — עדיין תואם, אבל #975-first בטוח יותר.

**התנגשויות קבצים בין PRs פתוחים — נסרק:** אין חפיפת קוד-מקור. `producer_me.py` רק ב-#995, `whatsapp.py` רק ב-#991, `auth-context.js` רק ב-#994, `page.js` רק ב-#996. **החפיפה היחידה: `docs/CHANGELOG.md`** (ב-#995/#991/#994) — append-only → **Accept-Both** (Rule 25); מי שממוזג אחרון עושה `git merge origin/staging`. אין סיכון he.json/en.json — אף PR פתוח לא נוגע בקבצי messages (#996 משתמש במפתחות קיימים).

**אומת מול staging:** #976 (MEH-753 he-IL event dates) + #988 (vitest mock) **מוזגו** (staging `686eb63`/`532cce9`) → גל ה-he-IL כבר אחרי #976 כנדרש. ✅

---

## 4. תוכנית 60 / 120 דקות

**60 דק' (ערך גבוה / סיכון נמוך):**
1. רכבת המרג'ים 1–6 לפי סדר (סעיף 3). #996/#994/#997 ראשונים (עצמאיים, אפס סיכון) בזמן שה-CI של #975/#991/#995 מתייצב.
2. #975: rebase + ודאי pytest רץ → merge → אז #991 (merge staging קודם) → #995.
3. אחרי כל merge backend: לוודא `Backend tests (pytest)` + `Backend lint (ruff)` **ירוקים בפועל** (לא skipped, לא budget-exhaustion — Rule 21).

**120 דק' (אם יש זמן — triage בק-לוג):**
4. לפתוח את ה-issues מסעיף 5 לפי עדיפות. **קודם Rule 27: לחפש ב-Linear** (חשד-כפילויות מסומן inline).
5. הכרעות-ספיר החסומות (סעיף 6): env-token, Alembic של WhatsApp/races, MEH-688 emoji, החלטות security headers/CSP.

**מה לבדוק בכל PR לפני merge:**
- #991/#995 (backend): endpoint מושפע + pytest ירוק. #994/#996 (UI): preview בנייד. #975 (tests): pytest מבוצע. #997 (docs): קריאת diff.

---

## 5. טבלת הממצאים המאוחדת + issue drafts

### 5.1 נסגר הלילה (ייסגר ב-merge)

| ממצא | מקורות | PR | סטטוס |
|---|---|---|---|
| WhatsApp HTTP 200 ≠ נמסר | AUD-009/010, FUZZ/mutant #975 SURVIVED, Phase0-WA | **#991** | parse body (Option A). persistence = follow-up |
| availability ולידציית-שרת + tz (write-path) | AUD-039/040, Phase0-availability | **#995** | write-path. **read-path tz `schemas.py:591` עדיין פתוח** |
| bidi LTR-isolation של מספרים | AUD-026 | #974 (מוזג) | ✅ |

### 5.2 ממצאים פתוחים → issues מוצעים (deduped)

עמודות: ממצא · מקור(ות) · עדיפות · risk tier · חסום-על-ספיר?

| # | ממצא | מקורות | עדיפות | tier | חסום-ספיר |
|---|---|---|---|---|---|
| I-1 | `.env.example` `ACCESS_TOKEN_EXPIRE_MINUTES=10080` (7 ימים, דורס 15-דק') + env vars לא-מתועדים (`TRUSTED_PROXY`) + hygiene | AUD-050/049/051, DEFER-ENV | **1** | RED-ish (security) | **כן — env-read hook; להריץ בטרמינל** |
| I-2 | check-then-act races בלי unique-constraint (Report/GroupBuy/Referral) + double-notify באישור-אדמין + GroupBuy deadline naive-tz | AUD-042/043/044, DEFER-SCHEMA/LOGIC | **2** | HIGH (schema) | **כן — Alembic (042)** |
| I-3 | MEH-736 docs-only twin jobs חסרים ב-`pr-checks.yml`+`deploy.yml` → PRs docs-only נחסמים | AUD-052, DEFER-CI | **2** | YELLOW | חלקית (workflows denied; YAML מוכן ב-fix-wave) |
| I-4 | auth hardening: fingerprint לא-constant-time + `/reset-password` ללא rate-limit + 404/410 token-oracle + Apple JWKS `time.time()` | AUD-014/015/016, DEFER-AUTH | **2** | HIGH (auth+CVE) | חלקית — דורש CVE check (rule 5a) |
| I-5 | dep bumps: pyjwt 2.12 (alg-bypass), python-multipart (DoS CVE-2026-42561), postcss<8.5.10 (XSS via next), transitive batch | AUD-002/003/006/008, DEFER-DEP | **2** | YELLOW (CVE) | לא |
| I-6 | UIS Pattern A — 10 CRITICAL: handlers אדמין `api.post`→reload בלי try/catch / in-flight disable | UIS-038/039/040/041/055/060/061/063/064/065 | **2** | HIGH | לא |
| I-7 | UIS Pattern B — טופס submit לא מושבת → יצירת מוצר כפולה | UIS (ui-states) | **2** | HIGH | לא |
| I-8 | UIS Pattern C — מחיקה הרסנית בלי idempotency/confirm (מחיקת חשבון/מוצר) | UIS-024 + others | **2** | HIGH | לא |
| I-9 | UIS Pattern D — `.catch(() => [])` שגיאת-fetch שקטה (cross-cutting) | UIS Pattern D | 3 | MEDIUM | לא |
| I-10 | MEH-555 free-text validation gaps (producer/product/experience) + `admin_notes` sanitize + unbounded `list[str]` | AUD-011/012/013, DEFER-BE | 3 | MEDIUM | לא — **חשד-כפ' MEH-555** |
| I-11 | security headers: backend חסר HSTS+CSP; conflict `next.config.js`↔`vercel.json`; CSP `unsafe-inline`+`unsafe-eval` | AUD-020/053/054, DEFER-SEC | 3 | MEDIUM (security decision) | חלקית (החלטת CSP) |
| I-12 | FE batch: RTL `text-right`→`text-end` (~30) · a11y labels (×3) · `Math.random` id→`useId` · modal focus-trap · date-in-render hydration · `useSearchParams` Suspense · ISR revalidation · registration UX | AUD-025/030/031/032/033/035/045/046, DEFER-FE | 3 | MEDIUM | לא (חלק autofix-eligible) |
| I-13 | copy: `en.json` ערכים בעברית (×6-8) · ChatWidget hardcoded · מונח אסור "יצרן" | AUD-027/028/029, DEFER-COPY | 3 | LOW | **כן — אישור copy מילולי (Rule 22)** |
| I-14 | design tokens: contrast `fg-muted` · color drift (~50 hex/65 קבצים) · tier-2 gray (ADR-019) | AUD-034/036/047, DEFER-DESIGN | 3 | LOW | **כן — החלטת design-token** |
| I-15 | PII/hygiene: contact-form log לא-מוסתר · Sentry `send_default_pii` · bare-except ×4 · SHA1 `usedforsecurity=False` · `create_all` boot gate · CORS credentials+env-origin | AUD-017/018/001/005/024/022, DEFER-BE | 4 | LOW | לא |
| I-16 | WhatsApp delivery persistence (Option B/C): טבלת `outbound_messages` + צריכת delivery webhooks | Phase0-WA, follow-up #991 | 2 | HIGH (schema) | **כן — Alembic** |
| I-17 | availability read-path tz (`schemas.py:591` `date.today()`→Israel) | Phase0-availability, follow-up #995 | 3 | MEDIUM | לא (תלוי merge #975+#995) |
| I-18 | mypy 639 errors — annotation debt (0 runtime crashes) | AUD-055 | 4 | LOW | לא |
| I-19 | MEH-692 root cause — מילת-הקסם בגוף-ה-PR (לא ב-trailer) סוגרת epic; Rule 26/27 לא מכסות | MEH-692 forensics, #989 | 3 | LOW | החלטה — workflow-rule חדש |
| I-20 | MEH-688 emoji sweep — אינדיקטורים פונקציונליים (🟢🟠⏸/✡️/⚠️) + גבולות A/C | MEH-688, #990 | 3 | LOW | **כן — ADR/Sapir (Decision #7)** |
| I-21 | MEH-290 producer tour — BLOCKED על MEH-288 (anchor targets לא קיימים) | night-batch-6, #997 | 3 | MEDIUM | תלות MEH-288 |

### 5.3 Issue drafts (template-06 — מוכנים להדבקה; **אל תפתחי בלי Rule-27 dup-check + אישור**)

> הערה: התבנית בדיסק היא v2.0 (לא v2.1). השתמשתי במבנה ה-8-חלקים שלה. לכל issue: לפני `save_issue` להריץ `list_issues` עם שמות-העצם בכותרת (Rule 27).

#### I-1 — 🔒 `.env.example` token-TTL + env-var hygiene

```markdown
## מטרה
לסגור פער-אבטחה: `.env.example` מגדיר טוקן-גישה ל-7 ימים ודורס את ברירת-המחדל של 15 דק', + env vars לא-מתועדים (incl. `TRUSTED_PROXY` רגיש).

## הקשר / הבעיה
AUD-050: `ACCESS_TOKEN_EXPIRE_MINUTES=10080` ב-`.env.example`. AUD-049: vars נקראים בקוד בלי תיעוד. AUD-051: שמות-secret כפולים (`JWT_SECRET_KEY`/`SECRET_KEY`).

## Model + Effort + Thinking
- Model: 🟢 Sonnet 4.6 · Effort: medium · Thinking: ON
- Reasoning: שינוי קבצי-config ממוקד, סיכון נמוך אך security-sensitive.

## Prompt לClaude Code
⚠️ **טרמינל-ספיר:** עריכת `.env.example` חסומה ב-session ע"י env-read hook. ה-diffs המדויקים מוכנים ב-`docs/audits/2026-06-fix-wave.md` § DEFER-ENV — להריץ בטרמינל.

## Definition of Done
- [ ] `.env.example` ל-15 דק' (או הסרת השורה הדורסת)
- [ ] כל env var נקרא-בקוד מתועד ב-`.env.example` + `docs/DEPLOYMENT.md`
- [ ] env-drift CI ירוק

## Branch
`feature/meh-XX-env-example-token-ttl` off staging

## תלויות / קשורים
- חשד-כפ': לחפש "env" / "token TTL" ב-Linear
```

#### I-2 — 🗄️ Concurrency races — unique constraints + status guards

```markdown
## מטרה
למנוע כפילויות/double-notify ב-Report/GroupBuy/Referral תחת מקביליות.

## הקשר / הבעיה
AUD-042: check-then-act בלי unique-constraint/row-lock (×3). AUD-043: אישור-אדמין מקביל → notify כפול. AUD-044: `GroupBuy.deadline` naive מול `datetime.utcnow()`.

## Model + Effort + Thinking
- Model: 🟣 Opus 4.7 · Effort: high · Thinking: ON
- Reasoning: HIGH-RISK — schema migration (Alembic) + concurrency. chunk-by-chunk.

## Prompt לClaude Code
⚠️ **Alembic = Sapir-explicit** (ADR-007 expand-contract). unique constraints ל-Report/GroupBuy/Referral; status-guard באישור; tz-aware deadline. diffs ב-fix-wave § DEFER-SCHEMA/LOGIC.

## Definition of Done
- [ ] Alembic migration (expand-only) + `EXPECTED_REV` bump
- [ ] בדיקת race (2 בקשות במקביל → רשומה אחת)
- [ ] pytest ירוק

## Branch
`feature/meh-XX-concurrency-unique-constraints` off staging
```

#### I-3 — ⚙️ MEH-736 docs-only twin jobs (CI unblock)

```markdown
## מטרה
PRs docs-only ייכשלו ב-merge תחת Rulesets כי checks נדרשים מדולגים = "Expected". להוסיף no-op twin jobs.

## הקשר / הבעיה
AUD-052: ה-twins של MEH-736 מעולם לא נוספו ל-`pr-checks.yml`+`deploy.yml`. כל PR docs-only חוסם (ראי `.claude/rules/testing.md`).

## Model + Effort: 🟢 Sonnet 4.6 · low · Thinking OFF
⚠️ **`.github/workflows/**` denied ב-session** — ה-YAML המלא מוכן ב-fix-wave § DEFER-CI; ספיר מוסיפה בטרמינל.

## Definition of Done
- [ ] twin jobs (אותו `name:`, `if:` משלים, exit 0) לכל 6 ה-checks הנדרשים
- [ ] PR docs-only עובר את כל ה-6 בלי admin-override

## Branch
`feature/meh-XX-meh736-docs-twins` off staging
## חשד-כפ': **MEH-736 קיים** — אולי extend ולא חדש (Rule 27)
```

#### I-6 — 🛡️ UIS Pattern A — `useAdminAction` shared helper (10 CRITICAL)

```markdown
## מטרה
10 handlers אדמין עושים `api.post`→reload בלי try/catch / in-flight disable → double-fire ב-moderation/block/delete.

## הקשר / הבעיה
UIS-038/039/040/041/055/060/061/063/064/065. helper משותף `useAdminAction(fn)` (busy-id, await, catch→toast, reload פעם אחת) פותר את כולם.

## Model + Effort: 🟣 Opus 4.7 · high · Thinking ON
- Reasoning: נוגע בכמה דפי-אדמין; logic-risk. chunk: helper → אימוץ פר-דף.

## Prompt לClaude Code
[XML מ-template-04 refactor — לבנות `useAdminAction`, להחיל על 10 ה-sites ב-`admin/reports|users|content|producers`, להוסיף בדיקות double-click]

## Definition of Done
- [ ] `useAdminAction` + בדיקה (double-click → קריאה אחת)
- [ ] 10 ה-handlers משתמשים בו · build+pytest ירוק · preview אדמין בנייד

## Branch
`feature/meh-XX-uis-pattern-a-admin-action` off staging
## הערה: "useAdminAction leftovers" — אולי helper חלקי כבר קיים, grep קודם
```

**שאר ה-drafts (I-4,5,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21)** — כותרת + עדיפות + tier + מקור כבר בטבלה 5.2; להרחיב למבנה-8-חלקים בעת הפתיחה. תבניות-בסיס:
- **I-4** 🔐 auth hardening (constant-time fingerprint + reset-password rate-limit + JWKS monotonic) — Opus/high, **CVE check (rule 5a) חובה**. חשד-כפ': MEH-337/343.
- **I-5** ⬆️ dep-bump batch (pyjwt/python-multipart/postcss/transitive) — Sonnet/medium, CVE-driven.
- **I-7/I-8** 🛡️ UIS Pattern B (submit-disable) / Pattern C (idempotent delete+confirm) — Sonnet/medium כל אחד.
- **I-9** UIS Pattern D silent-catch sweep — Sonnet/medium.
- **I-10** MEH-555 free-text validators — **extend MEH-555, אל תפתחי חדש**.
- **I-11** security headers + CSP — Opus/high, החלטת CSP unsafe-eval.
- **I-12** FE-batch (RTL/a11y/hydration) — לפצל ל-2-3 sub-issues; autofix-eligible חלקם.
- **I-13** copy fixes — **חסום על אישור-copy מילולי (Rule 22)**.
- **I-14** design tokens — חסום על החלטת token.
- **I-15** BE hygiene (PII log/Sentry/bare-except/CORS) — Sonnet/medium.
- **I-16** WhatsApp persistence (Alembic `outbound_messages` + webhooks) — Opus/high, **Sapir-Alembic**.
- **I-17** availability read-path tz — Sonnet/low, אחרי #975+#995.
- **I-18** mypy annotation debt — Sonnet/low, v2+.
- **I-19** MEH-692 workflow-rule note — docs.
- **I-20** MEH-688 emoji functional-indicators — **ADR/Sapir Decision #7**.
- **I-21** MEH-290 producer tour — **חסום על MEH-288**.

---

## 6. BLOCKED + מה דורש הכרעת ספיר

### 6.1 טרמינל-ספיר (חייב לרוץ אצלך — hooks/policy חוסמים ב-session)
- **Alembic — WhatsApp `outbound_messages`**: ה-revision המלא מוכן ב-body של **#991** (head `f1c7b9a3e264`, rev `c1d2e3f4a5b6`) + עדכון `EXPECTED_REV` ב-`pr-checks.yml`. נדרש כדי לעבור מ-Option A (פרסור) ל-Option B (persistence). (I-16)
- **Alembic — unique constraints** ל-races (I-2). diffs ב-fix-wave § DEFER-SCHEMA.
- **`.env.example`** (I-1) — env-read hook חוסם; diffs ב-fix-wave § DEFER-ENV.
- **`.github/workflows/**`** — twins של MEH-736 (I-3); YAML ב-fix-wave § DEFER-CI.

### 6.2 הכרעות (schema / copy / decision)
- **copy** (I-13): `en.json` ערכים-בעברית, ChatWidget, מונח "יצרן" — אישור מילולי לפני issue (Rule 22).
- **design** (I-14): contrast `fg-muted`, color-drift, tier-2 gray — החלטת design-token / ADR-019.
- **security** (I-11): CSP `unsafe-inline`+`unsafe-eval` — האם לסגור (עלול לשבור GSI/Cloudinary).
- **MEH-688** (I-20): אינדיקטורים פונקציונליים emoji — ADR/Sapir Decision #7. unblock path ב-`2026-06-meh688-emoji-inventory.md`.

### 6.3 BLOCKED מהלילה (לא נעשה — מתועד, לא ננטש בשקט)
- **MEH-290** (producer tour): anchor targets לא קיימים — תלוי **MEH-288** (add-product + share buttons). #997.
- **MEH-688 sweep**: אין מה להסיר losslessly בלי לסתור את methodology של MEH-657. → Discovery בלבד (#990).
- **B1 MOB / B2 FUZZ** (night-batch-6): לא הופעלו — branches/PRs נעדרו (`feature/meh-233-mobile-audit`, `feature/schemathesis-fuzz`).

### 6.4 לא-אומת (Skeptic — לא לסמוך בלי בדיקה)
- **#975 `Backend tests (pytest)` = skipped** — עלול לחסום merge תחת Rulesets. לוודא שרץ. (_unverified: לא ראיתי לוג, רק conclusion=skipped_)
- **#991/#995 — 0 check runs** בזמן הצילום (~21:48 push). להמתין לרישום ה-checks ולוודא ירוק (לא budget-exhaustion, Rule 21).
- **#975 AvailabilityBadge mutant** — "verified-killed locally", לא ב-CI.

---

### נספח — מתודולוגיה
- Pre-reviews פורסמו כ-**תגובות PR** (לא עריכת-body) כדי לא לפגום ב-fenced blocks של sessions אחרים (#991 Alembic block, #975). זו סטייה מודעת מ"append to body" לטובת integrity — אותו ערך לספיר, אפס סיכון-שחיתות.
- מקורות: `2026-06-full-audit.md` (AUD-001..056), `2026-06-fix-wave.md` (triage+DEFER), `2026-06-ui-states-audit.md` (UIS), `discovery/2026-06-{whatsapp-delivery,availability}-phase0.md`, `2026-06-meh{692,688}-*.md`, night-batch-{,2,4,6}.
