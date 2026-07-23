# ADR-028: QA gates per-tier — CI מחליף QA ידני בנייד ל-GREEN/YELLOW, אדם נשאר ב-RED + release

**Status:** Accepted · Amends the DoD provision of ADR-016 (does NOT change the GREEN/YELLOW/RED merge-authority tiers)
**Date:** 2026-07-13
**Deciders:** Sapir Levi
**Source:** MEH-1185 (Ticket C, QA אוטונומי שלב 2) · מחקר template 05 (13/07/26) · תלוי MEH-1171 (Ticket A) + MEH-991 Chunk 3

## Assumptions (verify before merge)
- מטריצת ה-QA האוטונומית של MEH-1171 merged — `docs/qa/manual-testing-matrix.md` קיים (טור `DEVICE-ONLY` = 26 פריטים, "consolidated Tier-3 checklist", שורה 42). אם תזוז — ההפניה מה-ADR הזה מותנית, לא חוסמת.
- MEH-991 Chunk 3 (VRT baselines ירוקים + הפיכת ה-gate לחוסם) עדיין In Progress. ה-ADR מסמן את שער ה-VRT כ"רץ-ירוק-אך-לא-חוסם" עד לסגירתו — ראו Appendix A.
- ה-`protect-staging` ruleset (ID 15240090) דורש כיום 2 aggregator gates בלבד (`CI gate` + `Deploy gate`) — מקור: `.claude/rules/testing.md` (אומת מול ruleset API 2026-07-04). לא ניתן לאמת מחדש את ה-ruleset מסשן CC (אין MCP tool לקריאת rulesets); הקביעה נשענת על testing.md + היעדר e2e מ-`needs:` של שני ה-aggregators.

## Context

ה-DoD בכל טיקט עדיין דורש מספיר "נבדק בנייד (iOS Safari + Chrome)" ידני פר-PR (`docs/CONTEXT.md:146` — "Mobile-checked"), גם כאשר ה-CI כבר מריץ על אותו PR פרויקט mobile (Pixel 5) + pytest + VRT. זהו ה-MEH-271 anti-pattern (שני מנגנונים לאותה עבודה): אדם וגם CI מכסים את אותו viewport, והאדם הוא הצוואר בקבוק. מחקר template 05 (13/07/26) מצא שהתעשייה מקודדת QA כ-CI gates חוסמי-merge ומשאירה אדם רק ב-release gate; אמולציה מספיקה ל-PR-level, מכשיר אמיתי ב-release בלבד.

התשתית כבר קיימת ב-staging (אומת file:line — ראו Gate inventory למטה). מה שחסר הוא שכבת ה-governance: החלטה מתועדת אילו gates מספקים את ה-DoD פר-tier, שמצמצמת את "נבדק בנייד" הידני ל-RED-tier ול-`staging→main` release בלבד.

### Gate inventory (Phase-0 evidence, אומת 13/07/26)

| Gate | קובץ:שורה | רץ על | required (חוסם merge)? | מצב |
|---|---|---|---|---|
| `Playwright E2E (Vercel preview)` — desktop 1440×900 + mobile Pixel 5, flows + visual | `e2e.yml:80,162` · projects `playwright.config.ts:67-80` · trigger `e2e.yml:34-35` · docs-skip `e2e.yml:71-74` | כל PR ל-staging שאינו docs-only | לא — אינו ב-`needs:` של `ci-gate` או `deploy-gate` | GREEN על staging (ראו VRT למטה) |
| VRT parity (`e2e/visual/parity.spec.ts` + 12 baselines `parity.spec.ts-snapshots/*-linux.png`) | testMatch `playwright.config.ts:7` · tolerance 2% `playwright.config.ts:26-30` · baselines runner-generated `vrt-update.yml` | רץ בתוך job ה-E2E למעלה (אותו `npx playwright test` ללא `--project`/scope) | לא (יורש מ-E2E) | GREEN — run `29243943410` (commit `167cff27`, staging push 2026-07-13T10:46) job "Run E2E tests" = success |
| `Backend tests (pytest)` — postgres:15, coverage 70% | `pr-checks.yml:177,287` · paths filter `pr-checks.yml:122-124` (`backend/** + tests/**`) | כל PR שנוגע ב-`backend/**` או `tests/**` | כן — ב-`ci-gate` needs (`pr-checks.yml:530,587-591`) | active |
| `CI gate (required)` | `pr-checks.yml:522-536` | כל PR | כן (aggregator) | active |
| `Deploy gate (required)` | `deploy.yml:380-386` | כל PR + push | כן (aggregator) | active |
| `staging-smoke` post-deploy | `staging-smoke.yml` (MEH-671) | אחרי deploy ל-staging | post-deploy gate (שכבה 3) | active |

**נקודת המפתח (Phase 0b/0e):** פרויקט ה-mobile וה-VRT *רצים ומצליחים* על כל PR שאינו docs-only, אבל דרך `e2e.yml`, שאינו required check. לכן הם gates אמינים-אך-לא-חוסמים כרגע. `e2e.yml:77-80` מתעד ש-"required-check identities match on the name: field" — כלומר אפשר להפוך אותם לחוסמים ע"י הוספת ה-context ל-ruleset (Appendix A), אך זה טרם נעשה.

## Decision

מחליפים את ה-DoD הידני "נבדק בנייד" פר-PR בשערי ה-CI הקיימים עבור tier GREEN ו-YELLOW. QA ידני על מכשיר אמיתי נשאר חובה עבור tier RED ועבור release `staging→main` בלבד. tier-ים מוגדרים ב-ADR-016; ה-ADR הזה משנה רק את *provision ה-DoD*, לא את סמכות ה-merge פר-tier.

### Gate matrix פר-tier

| Tier (ADR-016) | מה מספק "mobile verified" ב-DoD | QA ידני של ספיר בנייד |
|---|---|---|
| **GREEN** (docs / copy / i18n / single-dep / tests / CI YAML ללא שינוי התנהגות) | `Backend tests (pytest)` green (אם נגע ב-backend/tests) — pytest הוא required. E2E/VRT/mobile רלוונטיים רק אם נגע ב-UI; docs-only מדלג עליהם ב-paths-filter | לא נדרש |
| **YELLOW** (refactor 3–7 קבצים לא-מרכזיים, UI לא-משותף, copy-with-logic, CI YAML שמשנה התנהגות) | (1) פרויקט `mobile` (Pixel 5) של `e2e.yml` green + (2) `Backend tests (pytest)` green + (3) VRT parity green — כרגע "רץ-ירוק-אך-לא-חוסם", יהפוך ל-active gate עם סגירת MEH-991 Chunk 3 (Appendix A) + (4) CC self-QA screenshots ב-375px ו-1440px per ADR-016 YELLOW, בתקציב `qa-artifacts` (2MB, MEH-1156) | לא נדרש פר-PR |
| **RED** (auth / schema / security / central components / production deploy / brand) | כל שערי YELLOW **בנוסף** ל-QA ידני | **נדרש** — ספיר, מכשיר אמיתי (iOS Safari), Tier-3 DEVICE-ONLY מ-`docs/MANUAL_TESTING.md:889-908` |
| **release `staging→main`** | כל השערים לעיל + `staging-smoke` post-deploy | **נדרש** — Tier-3 DEVICE-ONLY (26 פריטים, `docs/qa/manual-testing-matrix.md:42`) |

**"mobile verified" ל-GREEN/YELLOW = ירוק ב-CI, לא claim של סוכן.** Anti-pattern שנמנע: "QA רק בסשן של הסוכן". השער הוא ריצת runner אמיתית ב-GitHub Actions, לא הצהרה בטקסט.

### Tier-3 DEVICE-ONLY — התחום היחיד שנשאר ידני

מה שנשאר חובה אנושית מוגדר ב:
- `docs/MANUAL_TESTING.md:889-908` — "מה CC לא יכול (real-device-only)": touch tap-feel, animation smoothness על CPU/GPU/רשת אמיתיים, font anti-aliasing, color rendering, perceived latency; + "Tier 3 — Smadar (mobile real device)" checklist (רף: כל פריט testable ב-<30 שניות בטלפון).
- `docs/qa/manual-testing-matrix.md:42` — טור `DEVICE-ONLY` (26 פריטים, "consolidated Tier-3 checklist") + שורות `KEEP-RUNBOOK` (490-495).

מתי הוא רץ: **release gate** (`staging→main`) ו-tier RED — לא פר-PR ב-GREEN/YELLOW.

## Residual risk

השער אינו סוגר את כל מחלקות הבאגים. מה שעדיין מגיע ל-staging תחת GREEN/YELLOW ללא בדיקה אנושית:

- **אמולציית Pixel 5 (Chromium) ≠ iPhone אמיתי (Safari).** `playwright.config.ts:76-78` — mobile הוא Pixel 5 עם `browserName: "chromium"` (אין webkit binary ב-sandbox/CI). באגים ספציפיים ל-WebKit/iOS Safari (`-webkit-` quirks, `background-attachment: fixed` — ראו `docs/MANUAL_TESTING.md:1317-1330`, `100vh`/dynamic viewport, momentum scroll, input zoom) **לא** ייתפסו. זו הסיבה שמכשיר אמיתי נשאר ב-release.
- **VRT tolerance 2%** (`playwright.config.ts:27`, `maxDiffPixelRatio: 0.02`). רגרסיות ויזואליות מתחת ל-2% פיקסלים (הזזות sub-pixel, שינויי גוון עדינים, drift של 1-2px ב-spacing) עוברות מתחת לסף. VRT תופס שינויי layout גסים, לא polish עדין.
- **VRT מכסה 6 עמודים בלבד** (home/about/login/map/producer-detail/register × desktop+mobile = 12 baselines). מסכים/מצבים מחוץ לרשימה (dashboards, admin, מצבי error, flows מקוננים) אינם מכוסים ב-VRT.
- **perceived latency / felt-fast / touch tap-feel / anti-aliasing** — לא ניתנים למדידה אוטומטית (`docs/MANUAL_TESTING.md:890-894`); נשארים Tier-3.
- **VRT אינו חוסם merge כרגע** (Phase 0e). עד סגירת MEH-991 Chunk 3, drift ויזואלי יכול תיאורטית להתמזג אם מפתח מתעלם מכישלון ה-E2E הלא-required. ה-mitigation: ה-E2E מפרסם `Playwright QA — PASS/FAIL` comment על ה-PR (`e2e.yml:176-214`), כך שכישלון גלוי גם ללא סטטוס חוסם.

**מחלקות באגים שכן נתפסות אוטומטית:** רגרסיות layout גסות (VRT), שבירת flows (login/register/WhatsApp click/פרסום מוצר — `e2e/flows/**`), RTL overflow ברמת DOM, שבירת API contract (pytest + `deploy.yml` API contract audit), migration drift (`pr-checks.yml:226-277`).

## Consequences

**Positive:** ספיר יוצאת מלולאת ה-QA הידני פר-PR ל-GREEN/YELLOW (רוב ה-PRs); זמן ה-mobile שלה שמור אך ורק ל-Tier-3 real-device (`docs/MANUAL_TESTING.md:896`); "mobile verified" הופך לאות CI ניתן-לאימות במקום claim; MEH-271 (שני מנגנונים לאותו viewport) נסגר לשני ה-tier-ים הנפוצים.

**Negative:** באגי iOS Safari/WebKit ו-drift ויזואלי מתחת ל-2% יכולים להגיע ל-staging בין release-ים (mitigation: release gate תופס אותם לפני production). כל עוד VRT אינו required, הסתמכות על משמעת מפתח שלא להתעלם מ-E2E אדום שאינו חוסם.

**Mitigations:** מכשיר אמיתי נשאר ב-`staging→main` release + RED — לא נמחק, רק זז מהשוטף. הפיכת VRT ל-required מתועדת ב-Appendix A להפעלה עם MEH-991 Chunk 3. ADR יחיד הוא ההפניה הקנונית; ה-DoD ב-`docs/CONTEXT.md` מצביע לכאן ולא מגדיר מחדש מקומית.

## Alternatives considered

- **(b) לשמור "נבדק בנייד" ידני פר-PR כמו היום.** נדחה: ספיר נשארת צוואר הבקבוק; ה-CI כבר מכסה את אותו viewport — כפילות MEH-271.
- **(c) למחוק QA ידני לגמרי (גם ב-release).** נדחה: אמולציית Pixel 5 ≠ iPhone אמיתי; מחלקת באגי WebKit תגיע ל-production ללא שער אנושי כלשהו.
- **(d) לחסום merge על VRT מיד (להוסיף ל-ruleset עכשיו).** נדחה כ-scope של ה-ADR הזה: הפיכת שער לחוסם היא שינוי branch-protection/workflow שספיר מחילה (`.github/workflows/**` הוא CC-deny, MEH-671), ותלויה בסגירת MEH-991 Chunk 3. מתועד ב-Appendix A, לא מבוצע כאן.

## References
- ADR-016 (Risk-tier nomenclature — GREEN/YELLOW/RED) + amendment 2026-07-12 + amendment MEH-1155 (merge-block marker gate). **ה-ADR הזה משנה רק את provision ה-DoD, לא את סמכות ה-merge פר-tier.**
- ADR-025 (loop-primitive authority per tier) — GREEN `/goal` DoD self-check (`mehamakor-dod`).
- MEH-1171 (Ticket A — matrix), MEH-991 Chunk 3 (VRT baselines), MEH-671 (staging-smoke), MEH-1044 (E2E local CI), MEH-1156 (qa-artifacts 2MB cap).

## Appendix A — הפיכת VRT/mobile ל-required gate (Sapir מחילה; לא מבוצע ב-PR הזה)

`.github/workflows/**` ו-branch-protection הם CC-deny (MEH-671) — הצעדים למטה מיועדים לספיר בטרמינל/UI, להפעלה עם סגירת MEH-991 Chunk 3.

**אפשרות 1 (מינימלית, ללא שינוי YAML) — מומלצת.** להוסיף את ה-context הקיים `Playwright E2E (Vercel preview)` לרשימת ה-required checks של ה-`protect-staging` ruleset (ID 15240090) ב-Settings → Rules → Rulesets. `e2e.yml` כבר מריץ אותו על כל PR שאינו docs-only; ה-job כבר מדלג docs-only (`e2e.yml:71-74`) כך ש-PR של docs עדיין ממוזג ללא override (ה-context מדווח success על skip תחת paths-filter). שם ה-context הוא זהות ה-branch-protection לפי `e2e.yml:77-80` — אין לשנות את שדה ה-`name:` בלי לעדכן את ה-ruleset באותו שינוי.

**אפשרות 2 (docs-diff-safe דרך ה-aggregator הקיים).** אם רוצים ש-VRT ייחסם דרך `CI gate (required)` הקיים במקום context נפרד: להעביר job VRT-scoped ל-`pr-checks.yml` (jobs חוצי-workflow לא ניתנים ב-`needs:`), לחווט אותו ל-`ci-gate` `needs:` + בדיקת result, ולתחום אותו ב-paths-filter frontend כך שידלג docs-only. עלות: הרצת Playwright כפולה (pr-checks + e2e). מועדף רק אם אפשרות 1 נדחית.

## Appendix B — Sapir follow-ups (post-merge, ידני מתועד)
- לעדכן template 06 (שורת ה-DoD "נבדק בנייד") — templates 00-08 חיים מחוץ ל-repo, זו הערת PR ולא עריכת קובץ.
- אם required checks השתנו (Appendix A הופעל) — לעדכן branch-protection בהתאם.
- אינדקס ה-ADR ב-`docs/decisions/README.md` מפגר: חסרים ADR-027 ו-ADR-028. להוסיף שתי שורות index (מחוץ ל-scope של MEH-1185 — verification נעל 4 קבצים).

## Amendment (2026-07-13) — Appendix A option 1 הוחל ובוטל; המסלול המאושר = E2E gate aggregator (MEH-1201)

**מתקן:** Phase 0b/0e (למעלה) + Appendix A option 1.

**מה קרה (13/07, ערב):** ספיר הוסיפה את ה-context הישיר `Playwright E2E (Vercel
preview)` ל-required checks של ה-`protect-staging` ruleset (ID 15240090), לפי
Appendix A option 1. **ההנחה שם — ש-job שמדולג ב-paths-filter מדווח `success` ולכן
docs-only ימשיך להתמזג — שגויה בריפו הזה.** MEH-892 (Done, 29/06) כבר הוכיח ב-merge
אמיתי (`405: 6 of 6 required status checks have not succeeded: 5 expected`) ש-job
שדולג ורשום **ישירות** כ-required נספר כ-`Expected` וחוסם תחת ה-ruleset. הוספת
ה-job הישיר החזירה בדיוק את הבאג הזה. **ספיר הסירה את ה-context מה-ruleset באותו
ערב** — המצב הנוכחי: E2E רץ, מפרסם `Playwright QA — PASS/FAIL` על ה-PR
(`e2e.yml:176-214`), לא חוסם.

**המסקנה:** Appendix A **option 1 נדחית** (היא שוברת docs-only). המסלול המאושר הוא
**E2E gate aggregator** — job `e2e-gate` בשם `E2E gate (required)`, `if: always()`
+ `needs: [filter, e2e]`, בתבנית `ci-gate`/`deploy-gate` הקיימת. ה-aggregator תמיד
רץ ומדווח `success` גם כש-`e2e` דולג (docs-only), כך שה-context הנרשם ל-ruleset
לעולם אינו `Expected`. זה בדיוק מה ש-MEH-892 העביר את הריפו אליו; ה-option הישיר
עקף את הארכיטקטורה הזו.

**מה בוצע ב-MEH-1201:**
- ה-YAML של ה-aggregator מוכן ב-`docs/ci/e2e-gate.patch.md` (ספיר מדביקה ל-`e2e.yml`
  — `.github/workflows/**` הוא CC-deny, MEH-671).
- אחרי ההדבקה: ספיר מוסיפה את ה-context **`E2E gate (required)`** (ולא את
  `Playwright E2E (Vercel preview)`) ל-required checks של ruleset 15240090.
- זה משלים את הפיכת ה-mobile+VRT לחוסם התלויה ב-MEH-991 Chunk 3 (Phase 0e / residual
  risk #5) — בלי לשבור docs-only.

**עדכון לטבלת ה-tier (YELLOW, שורה 41):** VRT parity "רץ-ירוק-אך-לא-חוסם" הופך
ל-active gate כשספיר מחילה את ה-E2E gate aggregator (לא בהוספת ה-job הישיר ל-ruleset).
Appendix A option 2 (העברת job VRT-scoped ל-`pr-checks.yml` תחת `ci-gate`) נשארת
חלופה שנדחתה — עלות הרצת Playwright כפולה; ה-aggregator ב-`e2e.yml` עדיף.

### תיקון הנחת Phase-0: ה-paths-filter של `e2e.yml` אינו מדלג docs-only (MEH-1201, נמצא ב-CI)

Phase-0 של ה-ADR הזה (Gate inventory שורה 23, ו-"נקודת המפתח" Phase 0b/0e) הניח
ש-`e2e.yml` מדלג docs-only דרך paths-filter (`e2e.yml:71-74`). **ההנחה שגויה —
הופרכה ב-CI של PR #1741 (MEH-1201, docs-only).** ה-run `29283974004`, job `Paths
filter`: `predicate-quantifier: some` + 5 קבצי `.md` → `frontend = true`, וה-E2E
רץ (ונכשל: `4 failed · 1 flaky · 100 passed`, הכשלים ב-`/producer/[id]` a11y + VRT
parity — MEH-991 Chunk 3). שורש הבעיה: תחת `some`, דפוסי-השלילה (`!**/*.md`,
`!docs/**`, `!.changeset/**`, `!CHANGELOG.md`) נבדקים כ-OR נפרד וכל אחד מהם מותאם
לכמעט כל קובץ → ה-"docs-skip" של MEH-499 מעולם לא עבד.

**מסקנה לשער:** ה-aggregator לבדו אינו מספיק. שני תנאים מוקדמים חובה **לפני** הוספת
`E2E gate (required)` ל-ruleset (אחרת כל PR של docs-only ייחסם — בדיוק כשל MEH-892
משורש אחר):

- **A — לתקן את ה-paths-filter** ב-`e2e.yml:62-74`: להסיר את דפוסי-השלילה ולמרר את
  ה-job `changes` ב-`pr-checks.yml:117-121` (ללא שלילות — פולט נכון `frontend=false`
  על docs). YAML מוכן ב-`docs/ci/e2e-gate.patch.md` ("תנאי מוקדם A".
- **B — לייצב את הסוויטה**: 4 הכשלים ב-`/producer/[id]` (MEH-991 Chunk 3 parity +
  a11y) חייבים להיסגר; אחרת השער אדום גם על non-docs.

Residual-risk #5 למעלה ("VRT אינו חוסם merge כרגע") נשאר בתוקף עד שכל אלה נסגרים.
