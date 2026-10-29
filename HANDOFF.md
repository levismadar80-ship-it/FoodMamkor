# Session Handoff
> Updated at the end of every session — **where we are now**, not a history. Read the top sections before starting any work.
> **Keeps the last ~7 days only** (ADR-035). Older sections move to [`docs/archive/handoff/`](./docs/archive/handoff/README.md); the full history is there and in `docs/CHANGELOG.md`. Task state lives in Linear, not here.
> Standing procedures live in [`docs/runbooks/`](./docs/runbooks/) — e.g. the [uptime alert runbook](./docs/runbooks/UPTIME.md).
> Decision capture is proactive — see [ADR-009](./docs/decisions/ADR-009-decision-capture-proactive.md) (MEH-678): Claude offers to write an ADR when a conversation produces an architectural decision.

## 2026-10-29 13:20 — דף «בית העסק הזה כבר לא במהמקור» לכתובת של עסק שנמחק (#3797)

**‏שורה אחת:** ‏כתובת של עסק שנמחק עונה 410 ומציגה דף משלה; כתובות בעברית, שהחזירו 404 גם לעסק חי, תוקנו.

**‏מה צריך לדעת לפני עבודה:**
- ‏Next מעביר את `[slug]` ואת ה-pathname ב-middleware **מקודדים** (`%D7…`). כל קריאה לפרמטר slug עוברת דרך `decodeSlugParam` (`lib/slug.js`) לפני `isSlugShaped` / fetch.
- ‏~~ה-410 האמיתי נקבע ב-middleware~~ — בוטל ב-#3837: ב-Vercel זה מציג את דף ה-GONE של Vercel. מאז #3844 ה-middleware מפנה (בלי סטטוס) ל-`/[locale]/business-gone`, כי דף ה-`[slug]` מגיש מה-Data Cache את ה-200 הישן גם אחרי מחיקה (Next שומר רק 200). שינוי כאן נבדק רק אחרי deploy — `next dev` לא משחזר אף אחד מהשניים.

**‏לא עכשיו:** הפניית 301 אחרי שינוי שם; עסק לא מאושר שנמחק גם מקבל 410 (אין בטבלה סטטוס).

## 2026-10-29 09:20 — שמונה שיפורים בלי ספיר (#3793–#3800)

**‏שורה אחת:** Sentry בדפדפן עובד, הסכמה לתנאים נרשמת בהרשמת OAuth, וה-HTML של כל דף קל ב-~98KB.

**‏מה צריך לדעת לפני עבודה:**
- ‏namespace חדש של next-intl שקומפוננטת client קוראת מחוץ ל-`/admin`, `/producer/dashboard`: אל תוסיפי אותו ל-`ROUTE_SCOPED_NAMESPACES`/`SERVER_ONLY_NAMESPACES` (`lib/client-messages.js`). `ClientMessagesScope.test.jsx` נכשל אם כן.
- ‏ה-shell של האדמין ושל לוח הבקרה נמצאים ב-`AdminLayoutClient.jsx` / `DashboardLayoutClient.jsx`; ה-`layout.js` הוא עטיפת שרת דקה.
- ‏ה-init של Sentry בדפדפן: `frontend/instrumentation-client.js` (לא `sentry.client.config.js`).

**‏לא עכשיו / מחכה לספיר:** מפתח PostHog ב-Vercel; נוסח הסכמה ל-`/login` עם Google/Apple; LCP (MEH-2233) — החשוד הבא הוא JS; `NoEmojiInComponents.test.js` אדום ב-staging (★ ב-`admin/reviews/page.jsx:232`).

## 2026-10-29 07:55 — כתובת של בית עסק שנמחק לא עוברת לעסק אחר (#3781)

**‏שורה אחת:** ‏slug של עסק שהיה ציבורי ונמחק או ששינה כתובת נשמר ב-`retired_slugs` ולא מוקצה שוב.

**‏מה צריך לדעת לפני עבודה:**
- ‏כל כתיבה של `producers.slug` חייבת לקבל את הערך מ-`_ensure_unique_slug` (`routers/admin.py`) — רק שם ה-tombstone נבדק. כתיבת tombstone רק דרך `services/retired_slugs.py`.
- ‏טבלה חדשה מזיזה את `EXPECTED_TABLES` ב-`pr-checks.yml` — עריכה של ספיר (פרומפט Chrome), ואחריה קומיט אמיתי עם `Builder-Model:` כדי ש-builder-model-guard יעבור.

**‏לא עכשיו:** ~~עמוד 410~~ (נעשה ב-#3797); הפניית 301 אחרי שינוי שם (`producer_id` כבר נשמר).

## 2026-10-29 01:00 — לוח הבקרה של בעלת העסק: השאריות נסגרו (#3780, #3783, #3785, #3786)

**‏שורה אחת:** חלונות האישור בלוח נגישים במקלדת, אין פס ריק בתחתית בנייד ויש התנתקות, ביטול לא עובר על קבוצה שהתמלאה באותו רגע, ושני שדות מתים הוסרו מה-API.

**‏מה צריך לדעת לפני עבודה:**
- ‏חלון אישור חדש בלוח משתמש ב-`useDialogFocus(ref, open, fallback)`. ה-fallback מקבל את הפוקוס כשהכפתור שפתח את החלון כבר לא בדף.
- ‏פעולה של בעלת העסק על קבוצת רכש שולחת `expected_status`. השרת בודק אותו אחרי בדיקת הבעלות ותחת ה-row lock.
- ‏מסלול חדש שמסתיר את ה-pill התחתון צריך גם לפרסם `--bottom-nav-clearance` משלו (`BottomNav.jsx`), אחרת נשאר פס ריק.

**‏לא עכשיו:** קישור דף העסק במייל «הקבוצה מומנה» כשהעסק הושעה אחר כך (מחכה להחלטה); התנתקות ב-`/admin` בנייד; ניקוי mocks של `rank_in_city`/`profile_strength` בטסטים של הפרונט.

## 2026-10-28 21:52 — מקרי קצה בסטטוס בתי עסק: מועדפים/ביקורות/התראות, מחיקות, ועריכת אדמין (#3763, #3765, #3767)

**‏שורה אחת:** עסק שהושעה, נדחה או נמחק כבר לא משאיר קצוות פתוחים: לא נשמר במועדפים, לא מקבל ביקורות, לא שולח התראות, נמחק בלי 500, ועריכת אדמין לא משנה סטטוס.

**‏מה צריך לדעת לפני עבודה:**
- ‏«עסק חי» = `is_business()` ב-`services/producer_listing.py` (approved + producer). כל משטח חדש שפונה לצרכניות מסנן דרכו.
- ‏סטטוס של עסק משתנה רק ב-approve / reject / toggle-status. ה-PUT של האדמין מחזיר 422 על `status`.
- ‏relationship חדש ל-FK שהוא NOT NULL צריך `cascade` או `passive_deletes`, אחרת מחיקה נופלת ב-500. `tests/test_meh2503_delete_with_group_buys.py` תופס את זה.

**‏לא עכשיו:** שימוש חוזר ב-slug אחרי מחיקה; עמוד «כבר לא מופיע» לעסק שהוסר (צריך נוסח מספיר).

## 2026-10-28 18:40 — לוח הבקרה של בעלת העסק + קבוצות רכש בידי העסק: כל חמשת השלבים מוזגו

**‏שורה אחת:** בעלת עסק מבטלת, סוגרת ומסמנת «נמסר» לקבוצת רכש שלה מהלוח. המשתתפות מקבלות מייל כשהיא מבטלת. «מתי ואיך מקבלים» הוא שדה חובה, ובדף הקבוצה מוצג «מגיעים אלייך?». ‏PR-ים #3680, ‏#3682, ‏#3683, ‏#3685, ‏#3688, ‏#3693, ‏#3699, ‏#3700, ‏#3739.

**‏מה צריך לדעת לפני עבודה:**
- ‏מעברי הסטטוס של בעלת העסק מוגדרים ב-`OWNER_TRANSITIONS` ב-`routers/group_buys.py`. «בוטלה» ו«נמסרה» הם מצבים סופיים לבעלת העסק, ורק אדמין מוציא קבוצה מהם.
- ‏`fulfillment_note` הוא חובה ב-`GroupBuyCreate` (לפחות 3 אותיות), אבל העמודה nullable: בשורות ישנות נשאר NULL. ‏`GroupBuyNoteLetterContract.test.js` מצמיד את מחלקת האותיות בטופס ל-`_LETTER_REGEX`.
- ‏`send_funded_notifications` מקבל `producer_id`, ובמייל למשתתפות יש קישור לדף העסק, אף פעם לא פרטי קשר.

**‏פתוח (כרטיסי Backlog: MEH-2489 מרוץ הביטול, MEH-2490 ריפוד ויציאה בנייד, MEH-2491 שאר הניקיונות):**
- ‏מרוץ: ביטול קבוצה שהתמלאה בדיוק באותו רגע. צריך `expected_status` בבקשה.
- ‏בחלון האישור אין מלכודת פוקוס ואין החזרת פוקוס (אותו פער ב-ProductsSection).
- ‏שורות שנזרקות בבדיקת Zod לא נרשמות בשום מקום.
- ‏בלוח בנייד יש כ-80px ריפוד מת (`globals.css:223`), ואין בו כפתור יציאה.
- ‏השדות `rank_in_city` / `profile_strength` מתים.
- ‏הקישור במייל יוביל ל-404 אם העסק יושעה אחר כך.

## 2026-10-28 17:40 — בדיקת קישור ההזמנה ב-staging עברה; טופס האדמין: שמות ריקים (#3684) ועיר מהרשימה (#3733)

**‏שורה אחת:** התחברות עם Google מקישור הזמנה עובדת מקצה לקצה ב-staging (בדיקה בכרום, 27/10). שני באגים בטופס האדמין שהבדיקה מצאה תוקנו ומוזגו.

**‏מה צריך לדעת לפני עבודה:**
- ‏בבדיקת קישור הזמנה צריך חשבון Google **שני**: `claim` מחזיר 403 לאדמין ו-409 לחשבון שכבר יש לו עסק. הפרומפט לכרום: `claim/chrome-google-claim-test.md` בקבצי הפרויקט.
- ‏עסק בטיוטה מופיע ברשימת האדמין רק בסינון «טיוטות». «כל הסטטוסים» מסתיר טיוטות בכוונה.

**‏פתוח:**
- ‏עסק הבדיקה «בדיקת קישור הזמנה – למחוק» עדיין ב-staging, משויך לחשבון ה-Google השני. למחוק דרך «טיוטות» ← ⋮ ← מחיקה.
- ‏בלוח הבקרה, טיוטה שנתבעה לא כתובה כ«טיוטה» (רואים «מוכן 0%» ו«שליחה לבדיקה»). שינוי קופי — רק אם ספיר תרצה.

## 2026-10-28 17:30 — סקירת הפרויקט: פיצ'רי הפניות ומעקב נמחקו עד הסוף, «בתיאום אישי» תוקן

**‏שורה אחת:** כל ממצאי הסקירה שאושרו מוזגו: #3687, #3689, #3690, #3691, #3692, #3698, #3734, #3735. ‏MEH-2392, ‏MEH-2393, ‏MEH-2438 ב-Done.

**‏מה צריך לדעת לפני עבודה:**
- ‏`users.referral_code`, ‏`producer_followers` ו-`referral_clicks` כבר לא קיימים (revisions `e5b2d8f4a913`, `1cd44149cc20`). אין להחזיר אותם.
- ‏מחיקת עמודה בבטחה = deploy אחד עם `__mapper_args__ = {"exclude_properties": [...]}`, ורק ב-deploy הבא ה-drop. `deferred()` לא מספיק — ה-INSERT של ה-ORM עדיין מונה כל עמודה ממופה.
- ‏קנייה/איסוף בכרטיס המפה: «קנייה במקום» רק כש-`has_physical_location === true` ויש שעות (`resolveStoreHours`). אחרת «בתיאום מראש».
- ‏commit שכרום עושה בלי שורת `Builder-Model:` נכשל ב-Repo guards. כרום כותב שורה אמיתית משלו, או `guard-ok: edited by Claude in Chrome at Sapir's request; it cannot attest its model id`. אסור לכתוב שאדם ערך.

**‏פתוח:**
- ‏**E2E של PR-ים מתבטל** מאז 28/10 17:09 (שעון ישראל) — באג של #3687: קבוצת concurrency ברמת ה-job מחזיקה ממתין אחד בלבד. אדום ב-E2E gate על PR כרגע הוא לא של ה-PR, ול-E2E אין הצבעה. התיקון `queue: max` ב-`.github/workflows/e2e.yml` מחכה לספיר: `sapir-tasks/chrome-prompt-e2e-queue-2026-10-28.md` (ענף `feature/meh-2398-e2e-queue`).

## 2026-10-28 17:00 — סבב «תחליט ותבדוק»: כל מה שחיכה לספיר הוכרע ומוזג (#3723–#3726, #3728, #3731)

**‏שורה אחת:** ‏ספיר האצילה («כל מה שנשאר עליי — תחליט ותבדוק») ← כל ההחלטות הפתוחות מהסעיף של 15:00 נסגרו לפי מה שאתרים גדולים עושים, ושישה PR-ים מוזגו אחרי adversarial ו-CI ירוק. ‏MEH-2458, ‏2465, ‏2475, ‏2476, ‏2477, ‏2478, ‏2483 ב-Done. נשאר פתוח: MEH-2484.

**‏מה הוחלט (תחת האצלה — אפשר להפוך):**
- ‏MEH-2465 נשאר ילד של MEH-2458 ונסגר בקוד (#3723): מארגן לא מקבל מועדפים, ביקורות (409), דירוג Google, תעודות כשרות ולא נספר בסטטיסטיקות אדמין/דוחות.
- ‏נוסח `pending_nudge` למארגן (#3724): שורות «מיקום או אזורי משלוח», «כמה מילים על השוק או האירועים», «אירוע קרוב אחד לפחות», ונושא/גוף «העמוד שלכם» במקום «העסק שלכם». ‏aria-label של שיתוף בעמוד אירוע = «שתפו את האירוע» (`share.modal_title_event`).
- ‏MEH-2477 (#3725): טלפון של נקודת איסוף = קישור `tel:` ‏44px, ‏`dir="ltr"`.
- ‏MEH-2475 (#3728): עמוד מארגן מציג את כל ערוצי הקשר שמולאו, הערוץ הראשי ראשון; «מאחורי האירועים» (OwnerCard); «פעילים מאז {year}»; כרטיס «העיר שלכם» בלוח הבקרה של מארגן (CitySearch בלבד, ‏422 «יש לבחור עיר» על טקסט חופשי, פינג לאדמין כשהעיר משתנה).
- ‏MEH-2476 (#3731): עמוד חוויה מציג משך («3 שעות וחצי»), «חוזר», «החל מ-», וקישור לבית העסק המארח רק כשהוא approved + `kind='producer'`. ב-/events מוצג ה-`schedule` בשורת המטא (line-clamp-2).
- ‏MEH-2478 (#3726): קבוצות רכש פעילות וחוויות ב-sitemap; JSON-LD ‏Event/Product; Offer עם תאריך ישראלי ו-`SoldOut` כשהקבוצה מלאה.

**‏מה צריך לדעת לפני עבודה:**
- ‏שערי «קיום-בלבד» (מועדפים, ביקורות, דירוג, כשרות, ספירות) חייבים `kind == "producer"` — לא רק `status == "approved"`. ‏`TestOrganizerRefusedByExistenceOnlyGates` ב-`tests/test_organizer_kind.py` מכסה את הקיימים; משטח חדש = שורה חדשה שם.
- ‏`seo.js` מפרש datetime נאיבי כ-UTC (`parseNaiveUtc`) ומציג תאריך ב-Asia/Jerusalem (`israelDate`). ‏`GroupBuyOfferFacts.test.js` מוכיח את זה עם אדום שנדחף לפני התיקון.
- ‏ה-manifest של ה-codegen מתנגש בכל PR שנוגע ב-openapi אחרי מיזוג של PR אחר — אחרי `git merge origin/staging` לחשב מחדש את ה-sha256 של שני הקבצים.
- ‏`normalizePhone` מקבל רק סלולרי: קישור WhatsApp לטלפון קווי נופל בחזרה לטלפון. בכוונה.

**‏פתוח:**
- ‏MEH-2484 — קבוצות רכש לא בודקות שהעסק approved (נמצא ב-adversarial של #3726). לא מומש: session מקביל עובד על `group_buys.py` (#3699, ‏#3700).
- ‏session מקביל פתח את #3727, ‏#3729, ‏#3730 (MEH-2480–2482). לא נגעתי בהם.
- ‏הרשמה ולוח בקרה של מארגן לא צולמו (CC לא מקליד סיסמאות). כרטיס «העיר שלכם» מכוסה ב-`OrganizerCityCard.test.jsx` בלבד.
- ‏אין ב-staging אירוע עם שעת סיום — הטווח «09:30–15:00» ב-375 מכוסה בטסטי קומפוננטה, לא בצילום.
- ‏צולם ב-staging ‏375/1440 (sandbox של Vercel): ‏/he/events ועמוד אירוע — בלי גלישה אופקית. אין ב-staging חוויות, אז עמוד החוויה מכוסה בטסטי קומפוננטה בלבד.

## 2026-10-28 15:00 — מארגנים (MEH-2458), אירועים: תמונות/שיתוף/יומן/שעת סיום, ואודיט שדות-שלא-מוצגים — הכל מוזג

**‏שורה אחת:** ‏9 PR-ים מוזגו ל-staging (#3708, #3711, #3712, #3716–#3721); שתי מיגרציות Expand (`f1a2b3c4d5e6`, ‏`b7e3c1d9a2f4`) רצו בעליית Railway. ‏MEH-2458 נשאר פתוח רק בגלל הילד MEH-2465 (Backlog).

**‏מה צריך לדעת לפני עבודה:**
- ‏מארגן = שורת `producers` עם `kind='organizer'` (ADR-036). כל משטח שמונה/מציג עסקים חייב `producer_listing.is_business()`; שער השליחה למארגן ב-`submission_gate._organizer_missing_items`, ראי `SubmissionGateParity.test.js` (פרסר על קוד ה-Python).
- ‏זמן אירוע מוצג רק דרך `formatTimeRange` בתוך `<span dir="ltr">` — מקף בין מספרים ב-RTL מתהפך («15:00–09:30»). ‏`event_time`/`end_time` נשמרים כ-wall-clock; offset נזרק בגבול.
- ‏`openapi.json` / ‏`api.zod.js` / manifest נכתבו ידנית בסשן (אין venv/npm ב-sandbox); ה-snapshot test ב-CI ירוק. כדאי `orval --write` בסביבה עם רשת — צריך לצאת zero-diff.
- ‏Vercel preview לענף feature: ‏commit עם `[preview]` + `create_deployment` עם `gitSource` ‏(sha). ‏ה-sandbox לא מגיע ל-`*.vercel.app` — צילומים רק בכרום של ספיר; החלון ממוקסם → אין 375.
- ‏CC לא מקליד סיסמאות — הרשמה/לוח בקרה של מארגן לא צולמו.

**‏ממתין לספיר:** אין — כל מה שהיה כאן הוכרע ומוזג בסעיף של 17:00 למעלה.

## 2026-10-28 11:40 — הצ'אט: דוכני שוק בידע הקבוע (#3703 + #3710) ונתונים חיים (#3706) — שלושתם מוזגו

**‏שורה אחת:** MEH-2457 Done; MEH-586 — #3706 `f661193a` מוזג אחרי 3 סבבי adversarial, הסרת `do-not-merge` ע"י ספיר, ושני תיקונים של הרגע האחרון: שרשור מחדש של `a29c7a4a41e7` על `f1a2b3c4d5e6` (#3708 נכנס במקביל → שני heads), והחלת ADR-036 (`kind='producer'`) על כלי העסקים של הצ'אט. נשאר: DoD live ב-staging.

**‏מה צריך לדעת לפני עבודה:**
- `mcp_reader` הוא role `NOLOGIN` עם `SELECT` **ברמת עמודה** (`chat_db_tools.READER_COLUMNS`); הקוד עושה `SET LOCAL ROLE` בתוך READ ONLY + `statement_timeout=5000`. כלי חדש לצ'אט = פונקציה ב-`chat_db_tools.py` + שם ב-`TOOL_NAMES` + **כל עמודה חדשה שהוא קורא ב-`READER_COLUMNS` וגם ב-`GRANTS` של המיגרציה** (טסט drift משווה ביניהם) + שורה ב-`docs/DATA.md`; לעולם לא SQL מהמודל.
- כלי צ'אט שסופר/מציג עסקים חייב `_IS_BUSINESS` (`status='approved' AND kind='producer'`, ADR-036); כלי האירועים בכוונה לא — אירועי מארגנים הם הסיבה ל-`kind`.
- נתונים מה-DB נכנסים לפרומפט רק דרך `_fence_live_data` (תגית `<live_data>`, `<`/`>` מקודדים) — כותרות אירועים לא עוברות מודרציה.
- הטסטים ב-`tests/test_chat_db_tools.py` מריצים את `READER_ROLE_SQL` (מראה של המיגרציה) לפני כל טסט — function-scoped כי `drop_all` ב-`test_lifespan_init` מוחק grants. יצירת role מקבילה ב-xdist זורקת `unique_violation`, לא `duplicate_object` — שניהם מטופלים.
- `.claude/rules/backend.md:47` אומר httpx 0.27.2; ה-pin בפועל הוא `httpx==0.28.1` (`backend/pyproject.toml:22`, נמצא בסבב 3). לא תוקן — לא בscope.
- אומת 28/10 (Railway MCP, בלי לקרוא סודות): שירות ה-Postgres ב-staging הוא `ghcr.io/railwayapp-templates/postgres-ssl:18`, האפליקציה מתחברת כ-`POSTGRES_USER` = superuser של ה-bootstrap → `CREATE ROLE` יעבור. החלופה (login role + `CHAT_DB_READER_URL`) מתועדת בכרטיס ולא נדרשת.
- ה-sandbox של הסשן הזה חסום ל-PyPI → pytest רק ב-CI. GraphQL של GitHub חסום (REST עובד) → אין auto-merge מכאן.

**‏ממתין לספיר:** למזג את #3707 (הקובץ הזה) — docs-only; ב-staging: «כמה עסקים יש?» / «מתי השוק הבא?» / `'; DROP TABLE producers; --` → תשובה, לא שגיאה.
## 2026-10-28 00:20 — release v1.2.3 בפרודקשן (#3580 → `90a4f9c0`): זרימת «אני ממלאת, הבעלים רק מאשר» חיה; שני אדומים בדרך תוקנו (#3705, ‏#3704)

**‏שורה אחת:** ‏main = staging של 27/10 ערב (161 קומיטים, כולל #3702 שמוזג מ-session מקביל ב-22:08Z תוך כדי). כל שרשרת ההזמנה — טיוטה ע"י אדמין (MEH‑2325), קטלוג על טיוטה (MEH‑2326), ‏`/claim/<token>` (MEH‑2324) — בפרודקשן. אפשר לשלוח קישורי הזמנה לבעלות עסק.

**‏מה צריך לדעת לפני עבודה:**
- ‏PR ריליס נגד `main` מריץ שני דברים ש-PR רגיל לא: ‏`pip-audit` (רק כש-`deps == true`, והריליס תמיד נוגע ב-lock) ו-`secrets-scan-guard` על **כל** הריליס (‏`BASE=HEAD~1` = tip של main). שניהם היו אדומים על #3580 ולא על אף PR רגיל.
- ‏`secrets-scan-guard.sh` עושה עכשיו pre-filter אחד על הדיף ומפעיל את ה-classifier רק על שורות-מועמדות (#3705). ‏1.8 ש' על דיף של 32K שורות, במקום timeout. אותם patterns, אותו ALLOW, אותם verdicts — טבלת 7 מקרי הבקרה ב-PR.
- ‏`uv.lock` נכתב ידנית ב-#3704 (PyPI חסום גם ב-sandbox של claude.ai, לא רק ב-CC): בלוקי `[[package]]` מה-JSON של PyPI, ‏upload-time נחתך ל-ms (כמו uv), ‏cp310 הושמט (requires-python ≥3.11), wheels ממוינים לפי שם. ‏`uv lock --check` ב-Deploy gate אישר. זה תקף כדרך חירום; הדרך הרגילה נשארת `uv lock --upgrade-package`.
- ‏CVE-2026-114605 (dnspython) ו-CVE-2026-114613 (msgpack) — שתי תלויות עקיפות (email-validator, cachecontrol). ‏Dependabot לא פתח עליהן PR (הוא לא מרענן uv.lock, MEH‑1527).
- ‏`Adversarial review (calibration)` נפל על #3704 ו-#3705 עם `is_error:true` של ה-action עצמו (לא ממצא). ‏continue-on-error, לא חוסם. אם זה חוזר על PR שלישי — כרטיס.
- ‏`mehamakor.co.il` **לא** נגיש מה-sandbox של claude.ai (CONNECT 403), בניגוד ל-CC. ‏`smoke_production.py` יוצא שם עם exit 2 (control נכשל) — זה נכון, לא תקלה בסקריפט. ה-smoke אחרי הריליס רץ דרך Claude בכרום.
- **‏נמדד אחרי ה-deploy (28/10 00:15):** ‏Vercel READY, ‏Railway production redeploy 67 ש' ירוק. ‏`/api/health/readiness` → `ready`, ‏`migrations: e5b2d8f4a913` (ה-head של הריפו). ‏13 נתיבים ציבוריים ו-API → 200 (‏/, ‏/he, ‏/claim, ‏/claim/<bad>, ‏/producers, ‏/map, ‏/about, ‏/login, ‏/register, ‏liveness, ‏/api/producers, ‏/api/events/upcoming, ‏/api/cities?q=תל ← «תל אביב-יפו» ראשונה, #3702 חי), control `/__smoke-control-must-404__` → 404. ‏`POST /api/producer-claim/preview` עם token שגוי → 404 עם הקופי העברי. ‏Sentry: אפס issues חדשים אחרי ה-deploy (השלושה הפתוחים מלפני: Resend דוחה `example.com` ב-`/auth/register` מה-E2E, שני N+1 באדמין).

**‏ממתין לספיר:**
- **סימולציית הזמנה בפרודקשן** (היא בודקת): ‏Admin → בתי עסק → עסק חדש עם «טיוטה שבעלת העסק תקבל בקישור הזמנה» → בעמוד העריכה «יצירת קישור» → לפתוח בחלון פרטי, להירשם/להתחבר עם חשבון בלי עסק, לסמן ולאשר → לוח בקרה. צ'קליסט מלא: `docs/MANUAL_TESTING.md` §MEH‑2325 ו-§MEH‑2324.
- ‏`API contract probe (staging)` אדום על ה-push האחרונים ל-staging (לא required ל-main). לא נחקר הלילה — כרטיס אם נמשך.
- הודעת ה-WhatsApp לצ'ופצ'יק / חגי והלחם / עלעלים — הנוסח לא הגיע בשיחה; לאשר נוסח לפני שליחה (כלל 22).

## 2026-10-27 15:35 — טבלאות האדמין בנייד: שורה = כרטיס (#3678, MEH-2426)

**‏שורה אחת:** כל טבלאות האדמין נשאות `.table-stack` (globals.css): מתחת ל-md כל שורה כרטיס, וכל תא «תווית: ערך» מ-`data-label`. הבאנר «המסך הזה זמין במחשב» הוסר. ‏A-narrow של MEH-2070 כבר לא בתוקף.

**‏מה צריך לדעת לפני עבודה:**
- טבלת אדמין חדשה = `className="table-stack ..."` + `data-label` לכל תא חוץ מתא הכותרת + `data-cell="actions"`. בלי זה `AdminTablesStackGuard.test.js` אדום. עטיפה עם `overflow-hidden` מעל `<table>` מותרת רק אם יש בתוכה `overflow-x-auto`.
- «נבדק בנייד» חל עכשיו על כל `/admin` (CLAUDE.md עודכן במקום).
- ‏`e2e/qa-meh2070-admin-mobile.mjs` (סקריפט חד-פעמי, לא ב-CI) עדיין מצפה לבאנר. הוא היסטוריה ולא מריצים אותו.
- בזמן העבודה ה-API של staging לא ענה (‏`/api/health` → timeout, 14:45Z). הסריקה רצה מקומית עם fixtures.

**‏ממתין לספיר:** אין.

## 2026-10-27 11:30 — סקירת הפרויקט נסגרה: 9 PR-ים מוזגו, ‏/search אוחד ל-/producers (#3645), ‏E2E של staging חוזר לירוק (#3641)

**‏שורה אחת:** כל הכרטיסים מסקירת 26/10 (MEH-2367 עד MEH-2375, ‏MEH-819) ב-Done. מה שנשאר הם שלושה כרטיסי Expand-Contract / ניקוי ל-post-launch (MEH-2392, ‏MEH-2393, ‏MEH-2395).

**‏מה צריך לדעת לפני עבודה:**
- אין יותר `/search`. חיפוש = `/producers?q=`, וההפניה 308 נבדקת ב-`__tests__/SearchRouteRedirect.test.js` וב-`17-producers-search.spec.ts`. קומפוננטה שמרנדרת את `ProducersClient` בטסט צריכה `vi.mock("@/components/EnSearchNotice")`, אחרת `next-intl` מושך את `next/navigation` האמיתי.
- הפוטר שואל `GET /events/upcoming`. spec אדמין חדש שמרנדר את הפוטר חייב stub לנתיב הזה (ליד ה-stub של `/experiences/count`), אחרת ה-404 catch-all מפיל אותו.
- ‏regen של VRT: תווית אחת בכל פעם (`concurrency` של ה-workflow מבטל ריצות מקבילות), ה-workflow מסיר את התווית בסיום. ‏«Baselines unchanged» הוא תוצאה תקינה. אחרי commit של ה-bot צריך push רגיל כדי להריץ את השערים.
- ‏`producer_followers`, ‏`users.referral_code` ו-`referral_clicks` עדיין בסכימה בכוונה (Expand-Contract, ADR-007). לא להסיר בלי הכרטיסים שלהם.

**‏ממתין לספיר:** אין חדש מהשרשור הזה. ‏MEH-2398 (concurrency ב-`e2e.yml`) עדיין פתוח מהסעיף למטה.

## 2026-10-27 10:30 — דף האדמין = אישורים בלבד (#3617), והשעון הישראלי בשלוש שכבות: טסטים, backend, frontend (#3636, ‏#3640, ‏#3644, ‏#3653, ‏#3652, ‏#3642)

**‏שורה אחת:** ‏`/admin` מציג רק מה שמחכה להחלטה. כל זריעת זמן בטסטים עוברת דרך `israel_today()` / `israel_days_ago()`, כל קריאת שעון ב-backend דרך `utc_now()`, וכל קריאה ל-frontend דרך `israelNowParts`. שני guards (‏`test-clock-guard.sh`, ‏`israel-clock-guard.sh`) שומרים על אפס ממצאים.

**‏מה צריך לדעת לפני עבודה:**
- משטח מודרציה חדש באדמין = שורה אחת ב-`admin/queues.js` + מפתח ספירה ב-`GET /admin/dashboard`. ‏`__tests__/AdminQueuesContract.test.js` נכשל על מפתח שה-backend לא שולח. ספירה לא ידועה מוצגת כשגיאה, לא כ«אין פריטים».
- טסט שצריך «לפני N ימים» משתמש ב-`israel_days_ago(N)`; תאריך יחסי להיום ב-`israel_today()`. ‏`date.today()` ו-`datetime.now(timezone.utc) - timedelta(days=N)` בטסטים הם הבאג של MEH-2380 ו-MEH-2382 (ירוק ברוב השעות, אדום ב-21:00–22:00 UTC בשבוע שאחרי מעבר השעון).
- ‏`datetime.utcnow()` לא קיים יותר ב-`backend/app`. ‏`utc_now()` הוא naive-UTC בכוונה (העמודות naive). עמודה עם `timezone=True` (כמו `terms_accepted_at`) ממשיכה לקבל `datetime.now(timezone.utc)`.
- ‏E2E במקביל על כמה PR-ים מפיל את ה-backend של staging (MEH-2398). ‏499 / «ZERO COVERAGE» ב-`Playwright E2E` הם סימפטום של זה, לא של ה-PR. ‏`E2E gate` לא נדרש למיזוג.

**‏ממתין לספיר:**
- **‏MEH-2398:** להוסיף `concurrency` ל-`.github/workflows/e2e.yml` (קובץ שלה), או להגדיל את ה-pool בסטייג'ינג.
- שאריות קוסמטיות אחרי תקרת שלושת הסבבים, רשומות ב-#3640 (הערת lookbehind ישנה ב-`test-clock-guard.sh`; האם רוצים guard גם ל-`datetime.now()` בטסטים) וב-#3652 (מיקום ייבוא `utc_now` בכמה קבצי טסט).
- ‏#3617: שלושת פריטי הסוקר שנדחו (vitest ל-`visibleQueues`/`queueCount`, שורת ADMIN.md על יציאת `/admin/group-buys` מהניווט, endpoint ספירות בלבד) נמצאים ב-MEH-2399 (Backlog).

## 2026-10-26 21:15 — משפט המותג של ADR-011 באתר (#3622), ‏BRAND.md נסקר (#3620), ה-hook מציג את HANDOFF (#3606)

**‏שורה אחת:** כל מה שנשאר פתוח בסעיף של 09:45 נסגר. ה-hook תוקן, קבצי ה-xlsx יצאו מהריפו, ‏BRAND.md נסקר, ומשפט המותג הנעול מוצג באתר.

**‏מה צריך לדעת לפני עבודה:**
- משפט המותג מוצג בפוטר וב-meta/OG, ומקורו ב-`docs/decisions/ADR-011-tagline-locked.md`. ‏`__tests__/adr011-tagline.test.js` קורא אותו מה-ADR ונכשל אם `SITE_DESCRIPTION` או אחד מחמשת המפתחות ב-he.json זזים. כדי לשנות את המשפט צריך ADR חדש, לא עריכת קופי.
- ה-baselines של about, login ו-register בדסקטופ עדיין מציגים את הנוסח הישן של הפוטר, כי השינוי נשאר בתוך ה-tolerance. הם יתעדכנו ב-regen הבא של המסלולים האלה.
- ‏`NoEmojiInComponents.test.js` נכשל מקומית ב-Node 22 (‏★ מזוהה כאמוג'י) וירוק ב-CI. זה לא נגרם משינוי בקוד.

**‏ממתין לספיר:**
- **ייצוא מרכז הסושיאל מהחשבון הקודם:** להדביק שם את הפרומפט מ-`prompts/old-account-export-social-hub.md` (בתיקיית הקבצים של הפרויקט) ולהעביר את ה-JSON. אחרי זה הנתונים ייובאו ללוח החדש, והאוטומציות ייבנו כאן מחדש.
- **אופציונלי:** נוסח חדש לכותרות האתר ולתיאורים של /about, /login ו-/map, שעדיין אומרים «כולם במקום אחד». זה קופי חדש, ולכן לפי כלל 22 צריך את אישורה מילה במילה.
## 2026-10-26 21:10 — סבב המודרציה הושלם: MEH-2348 עד MEH-2354 ב-Done (#3612, ‏#3607–#3610, ‏#3621, ‏#3613)

**‏שורה אחת:** כל כרטיסי המודרציה שנפתחו אחרי המעבר ל-Haiku 5.5 מוזגו. הסתרת אדמין נשארת, fail-open נמדד, ה-JSON מוגבל ב-schema, הטקסט נכנס כנתונים, וביקורת שה-AI סימן מסומנת באדמין.

**‏מה צריך לדעת לפני עבודה:**
- ‏fail-open = APPROVED נשאר (LOCK), אבל כל מקרה מדווח: `report_fail_open` ב-`backend/app/services/moderation_fail_open.py`. מתכון ההתראה ב-`docs/MODERATION.md`.
- ה-schemas של התשובות ב-`backend/app/services/moderation_schemas.py`. שינוי בפרומפט או ב-schema → להריץ את ה-eval (הפקודה בסעיף 09:50 למטה).
- אין תג באדמין ≠ ה-AI בדק. ביקורת שעברה fail-open נשמרת כמאושרת ולא נבדקת שוב בשמירה זהה. זה ממצא פתוח, לא באג ידוע שתוקן.

**‏ממתין לספיר:**
- ממצאי ביקורת מעבר למגבלת 3 הסבבים: `/mnt/project-files/moderation/review-leftovers.md`. רק הראשון דורש החלטה.
- MEH-2361: החלטה על מחיקה ופרסום מחדש של ביקורת מוסתרת.
- **‏visibility:** ספיר עצמה מחליפה את הריפו בין ציבורי לפרטי (נאמר על ידה ב-26/10, בגלל עלות הריצות). כשהוא פרטי, כל job ב-Actions נכשל תוך 2 שניות, וזה לא באג. השאלה איך להסתיר את הקשר בין הריפו למהמקור עברה לשרשור נפרד. ‏`docs/ACCESS.md` §8.

## 2026-10-26 13:30 — קישור ההזמנה לבעלת העסק הושלם (MEH-2321): ‏#3600, ‏#3599, ‏#3611 מוזגו

**‏שורה אחת:** אדמין יוצרת טיוטה «לבעלת העסק», מכינה מוצרים, ושולחת קישור `/claim/<token>` (14 יום). בעלת העסק מתחברת לחשבון משלה, מסמנת את ההצהרות ומקבלת את העמוד. כל ארבעת ה-chunks ב-Done.

**‏מה צריך לדעת לפני עבודה:**
- הקישור הוא credential. אסור שיופיע בכתובת שצד שלישי מקליט. העזרים ב-`frontend/lib/claim-token.js`: ‏`redactClaimPath`, ‏`scrubClaimTokens`, ואחסון ב-sessionStorage. כל כלי טלמטריה חדש צריך לעבור דרכם.
- ‏`/claim/<jwt>` נתפס ב-middleware רק בזכות שתי שורות ב-matcher, כי השורה הכללית מדלגת על נתיבים עם נקודה. טסט: `__tests__/MiddlewareClaimMatcher.test.js`.
- הרצה מול backend אמיתי: `frontend/scripts/qa-meh2324-claim-e2e.mjs --link= --email= --password-file=<path>`. הסיסמה מקובץ, לא ממשתנה סביבה (env-drift).
- ‏follow-ups (לא נפתחו כרטיסים): ‏race בין `admin_delete_producer` לבין קבלה (`FOR UPDATE`) · ‏PostHog ‏`$current_url` אם `trackEvent` יופעל אי פעם ב-`/claim` · מצב שבו sessionStorage חסום: אורחת שמתחברת רואה «הקישור לא פעיל» במקום הנחיה לפתוח שוב · ‏`refreshUser` שמשתיק כשל ‏`/auth/me` אחרי קבלה.

**‏ממתין לספיר:**
- שלושת ה-PR-ים עולים ל-production יחד ב-PR של staging→main (שלה).
- בדיקה אחת ידנית על staging: כניסה עם Google מתוך קישור הזמנה אמיתי. כפתור Google לא מוצג בהרצה מקומית.
- אישור הנוסח של `admin.body` ב-he.json (פנייה בלשון נקבה).

## 2026-10-26 09:50 — מודלי ה-AI ב-backend על Haiku 5.5 (#3592), ושבעה כרטיסי מודרציה

**‏שורה אחת:** ‏#3592 מוזג ל-staging (`322ec9a2`). ה-eval מצא שני מסלולים שבהם ספאם ומידע אישי פורסמו כמאושרים, ושניהם תוקנו באותו PR.

**‏מה צריך לדעת לפני עבודה:**
- מודל ה-fast-tier מוגדר במקום אחד: `AI_FAST_MODEL` ב-`backend/app/config.py`. טסט guard נכשל אם מחרוזת `claude-*` מופיעה בקובץ אחר תחת `backend/app`.
- בכל שינוי בפרומפט או במודל מריצים את ה-eval: `env -u ANTHROPIC_BASE_URL ANTHROPIC_API_KEY="$MEH_EVAL_ANTHROPIC_API_KEY" PYTHONPATH=backend backend/.venv/bin/python scripts/oneoff/eval_meh2335_moderation.py --with-opus`. המפתח נמצא בסביבת הענן "sapir domains" בשם `MEH_EVAL_ANTHROPIC_API_KEY`, כי השם `ANTHROPIC_API_KEY` מסונן שם.
- כרטיסי מודרציה ב-Backlog: MEH-2348 (עקיפת הסתרת אדמין, RED) · MEH-2349 (FLAGGED בביקורות לא עושה כלום, RED) · MEH-2350 (prompt injection) · MEH-2351 (structured outputs) · MEH-2352 (מדידת fail-open) · MEH-2353 (פרומפט מתכונים מסמן FLAGGED גם מתכונים לגיטימיים) · MEH-2354 (שכתוב MODERATION.md).

**‏ממתין לספיר:** אין חדש.

## 2026-10-26 09:45 — סידור הידע אחרי המעבר (MEH-2344): בית אחד לכל עובדה, ו-HANDOFF חזר להיות קצר

**‏שורה אחת:** הפרויקט עבר לחשבון Claude חדש, והבדיקה מצאה את אותן עובדות בחמישה עותקים שהתיישנו כל אחד בקצב שלו. ‏ADR-035 קובע בית אחד לכל סוג עובדה; כל השאר מפנים.

**‏מה השתנה:**
- ‏`HANDOFF.md` מחזיק עכשיו רק מ-21/10 ואילך. הקובץ המלא כפי שהיה (13,716 שורות) נשמר מילה במילה ב-`docs/archive/handoff/HANDOFF-until-2026-10-21.md`, כך שציטוט ישן כמו `HANDOFF.md:2288` נפתר שם באותה שורה.
- ה-runbook של uptime עבר ל-`docs/runbooks/UPTIME.md`.
- ‏`docs/CONTEXT.md` נבדק מול הריפו: דומיין co.il, ‏DoD לפי MEH-2302 וכלל 31, ופרוטוקול סוף סשן שכותב כל עובדה למקום אחד.
- ‏`docs/PROJECT_INSTRUCTIONS.md` הוא המקור להוראות של פרויקט Claude. משנים שם, ואז ספיר מדביקה.
- ‏`DEPLOYMENT.md`: הדומיין של production תוקן ל-`mehamakor.co.il`.
- **שומרים (#3601):** ‏`handoff-retention-guard.sh` ו-`doc-freshness-guard.sh` רצים ב-`run-all.sh` ומזהירים בלבד. כשה-handoff guard מזהיר: `python3 scripts/docs/knowledge_freshness.py archive-handoff` (‏`--dry-run` קודם). כש-doc-freshness מזהיר: לבדוק את המסמך מול הריפו, ורק אז לעדכן את התאריך.
- **‏סטטוס:** #3597 (`828dde50`) ו-#3601 (`205e24e9`) מוזגו. ‏MEH-2344, MEH-2345, MEH-2346 ב-Done.

**‏ממתין לספיר:**

| מה | הפעולה |
| -- | -- |
| ה-hook של SessionStart | להחיל את `docs/ci/meh-2346-session-start-handoff.patch.md`. בלעדיו סשן חדש לא רואה את HANDOFF |

**‏הוכרע ב-26/10 (ספיר העבירה את ההחלטות):**
- **הוראות הפרויקט** הוחלפו בנוסח מ-`docs/PROJECT_INSTRUCTIONS.md`. מעכשיו משנים קודם בקובץ ב-PR, ואז מעדכנים בהגדרות.
- **מקור המותג = הריפו** (ADR-035, Alternatives). ‏`BRAND.md` עודכן עד 09/2026, וקבצי המותג ב-Drive לא נגעו מאז 05–06/2026. ב-`03-Brand-Hub` יש עכשיו קובץ `00-קראי-קודם` שאומר שהתיקייה ארכיון. רק `06-inspiration-swipe-file.md` נשאר חי שם.
- **קבצי ה-xlsx** בשורש יוצאים מהריפו ב-PR נפרד, יחד עם שני הסקריפטים החד-פעמיים שקוראים אותם. 20 עסקים, 14 שמות אנשי קשר, 5 טלפונים והערות אדמין. הם נשארים בהיסטוריה של git. ניקוי ההיסטוריה דורש force-push על `staging` ו-`main`, ולכן לא נעשה.
- **‏`docs/BRAND.md`:** ‏`Last reviewed` מ-23/05 (156 יום), ו-doc-freshness מזהיר. צריך סקירה מול ה-ADRs ואז לעדכן את התאריך. משימה פתוחה, לא החלטה.

## 2026-10-26 09:10 — דיאטת הכללים (MEH-2333): ההקשר שנטען בכל סשן ירד מ-245.7KB ל-59.9KB

**‏שורה אחת:** שלושה PR-ים docs-only (‏#3589, ‏#3590, ‏#3594) קיצרו את הכללים שנטענים בכל סשן, ושום כלל לא נמחק. הנרטיב (מקורות, טבלאות מדידה, תיקונים) עבר מילה במילה ל-`docs/rules-history/`.

**‏מה צריך לדעת לפני עבודה:**
- ‏`.claude/rules/workflow.md` ו-`testing.md` מכילים עכשיו רק את הכללים, 1–4 שורות לכל כלל. לפני שמחלישים, פותחים מחדש או גוזרים מחדש כלל, קוראים את הסעיף המקביל בארכיון `docs/rules-history/<file>.md`. הכותרות ומספרי הכללים זהים בשני הקבצים.
- ‏`skills.md`, `labels.md`, `deployment.md` נטענים רק כשנוגעים בקבצים שהם מכסים (`paths:`).
- ‏`rules-inventory-guard.sh` (ב-Repo guards) נכשל אם כותרת או כלל ממוספר נעלמים מהקובץ החי. מי שרוצה להוציא כלל בכוונה מוסיף את המפתח שלו ל-`docs/rules-history/RETIRED.txt`. זו הסרת אילוץ (כלל 32), ולכן ההחלטה של ספיר.
- ראיה חדשה לכלל נכנסת בקצרה לכלל החי או למסמך נפרד, לא בחזרה לקובץ שנטען תמיד. הארכיונים קפואים.

**‏ממתין לספיר:** אין חדש. ה-CI reviewer (‏`ANTHROPIC_API_KEY`) כבר ברשימה שלה.

## 2026-10-25 22:25 — drain ל' (לילה): קישור «בקשו ביקורת» עובד מקצה לקצה (MEH-1428 chunk 2), ושני כרטיסים נמדדו מחדש

**‏שורה אחת:** ‏#3587 (`efa4e53e`, MEH-2330, Done) מחבר את הצד של הלקוחה ואת הדשבורד לטוקן ש-chunk 1 הוסיף בשרת. ‏MEH-1428 נסגר אוטומטית עם הילד (כלל 36). פתחתי אותו מחדש ל-Backlog עם `needs-sapir`, כי נשארה הכרעה אחת. ‏MEH-2323 ו-MEH-893 נמדדו מחדש, והממצאים נכתבו בתיאור של כל כרטיס (כלל 34).

**‏#3587 — מה נכנס:**
- **צד הלקוחה:** `?rt=` נשמר ב-`sessionStorage` לכל עסק, פותח את טופס הביקורת בלי לחיצת וואטסאפ, ונשלח כ-`review_token`. השרת מאמת אותו (`reviews.py` `_invited_by_token`).
- **חזרה אחרי התחברות:** לינק ההתחברות לאורחת מחזיר לאזור הביקורות (`/login?redirect=…#reviews`). גם «הרשמה» בדף ההתחברות מעביר את ה-`redirect` הלאה.
- **בעלת העסק:** בטאב «כלים» יש כרטיס «בקשו ביקורת מלקוחה», לעסק מאושר בלבד, בנוסח המאושר.
- **באג שנמצא בדרך:** ההפניה של `/p/[slug]` השמיטה את ה-query. הקישור שהשרת מנפיק הוא `/p/{slug}?rt=…`, ולכן אצל כל עסק עם slug הוא לא היה פותח כלום.
- **סקירה אדברסרית:** שלושה ממצאים תוקנו. הטוקן מה-URL נספר גם כשה-storage חסום. «הרשמה» שומר את ה-`redirect`. לחיצה בלי clipboard מציגה שגיאה ולא זורקת. הוחלט לא להסיר את `rt` משורת הכתובת: «פתיחה בדפדפן» מהדפדפן של וואטסאפ מעבירה את הכתובת הנוכחית.
- **E2E:** הריצה הראשונה נכשלה ב-`dashboard-manage-events.spec.ts:122` (desktop + mobile). הכרטיס החדש קרא ל-`review-link` בלי stub, ה-token המזויף קיבל 401, ו-`api.js` ניתק את הסשן. שוחזר מקומית לפני התיקון. נוסף stub בשני ה-specs. אחרי זה: 1390 בוצעו, 0 כשלים.

**‏MEH-2323 chunk 2 (ה-flakes בהתחברות):** חתימת ה-CI של C3 היא כפתור שנשאר `disabled` אחרי `fill`. ההשערה "מילוי לפני hydration" הופרכה (8/8 תקין ב-6× CPU). כן נמצא מסלול שבו React זורק את עותק השרת של הטופס ומרנדר עותק חדש בצד הלקוח, אחרי שהעותק של השרת כבר גלוי (1 מתוך 8 traces ב-2× CPU). זה מתאים לחתימה, אבל לא שוחזר ככשל (0/30, 12/12). אם זו הסיבה, התיקון בקוד המוצר, והכרטיס אומר לעצור ולדווח. פירוט בתיאור הכרטיס.

**‏MEH-893 (eslint 10):** עדיין חסום, אבל לא מהסיבה שבכרטיס. ההתקנה נקייה, ואז `npx eslint .` קורס על `scopeManager.addGlobals is not a function`. ה-Babel parser שמקומפל בתוך `next` (16.3.3 / 16.4.3 / 16.5.0-canary.27) לא תומך ב-eslint 10. בדיקת ה-retest כתובה בכרטיס.

**‏ממתין לספיר:**

| מה | הפעולה |
| -- | -- |
| MEH-1428 Decision 2 | להכריע: «בהזמנת בית העסק» פומבי (חשיפת `source` ב-`ReviewOut` הציבורי, chunk קצר) או אדמין-בלבד, כמו ש-chunk 1 נבנה (ואז לסגור) |
| MEH-2323 chunk 2 | הסיבה לא הוכחה. ה-DoD (‏`--repeat-each=10` על ה-runner + 3 ריצות נקיות על staging) לא רץ מה-sandbox |

**‏לקחים:**
- כרטיס UI חדש שקורא ל-endpoint מאומת נכנס גם ל-specs שמזייפים את כל ה-API. בקשה אחת בלי stub מקבלת 401 עם ה-token המזויף ומנתקת את הסשן באמצע הטסט. לפני push: grep ל-route של הדף ב-`e2e/flows`.
- קישור שהשרת מנפיק צריך להיבדק במסלול המלא שלו, כולל ההפניות. ה-harness מצא את באג ה-`/p/[slug]` רק אחרי שנבדק הקישור האמיתי ולא `/producer/{id}`.

## 2026-10-25 20:20 — drain ל' (ערב): כלל 36 עודכן, תיקון flake במפה (chunk 1 של MEH-2323), והבקרה נפתחה מחדש

**‏שורה אחת:** ‏#3584 (`75e7d043`, MEH-2328, Done) מעדכן את כלל 36: ההגדרה «Auto-close parent» ב-Linear **פועלת** (נמדד 25/10). ‏#3585 (`0c6c1536`, MEH-2323 chunk 1/2) מתקן race ב-`24-producer-locations`. ‏MEH-2323 חזר ל-Backlog עם residual, כי chunk 2 (ה-flakes בהתחברות) עוד בלי סיבה. ‏MEH-2244 נסגר. ‏MEH-2227 נשאר In Progress עם `LEASE: none`.

**‏מה קרה לכרטיס הבקרה:** ‏MEH-2315 (כרטיס ה-docs של הבוקר) היה תת-כרטיס של MEH-2227, וכשנסגר, Linear סגר גם את MEH-2227. נפתח מחדש ונקרא שוב, והפתיחה החזיקה. מעכשיו: **לא מקננים כרטיסי drain תחת כרטיס הבקרה** (כלל 36). לכן כרטיס ה-docs הזה, MEH-2329, עומד בפני עצמו.

**‏MEH-2323 chunk 1, מה תוקן:** הטסט קרא את רשימת ה-clusters בזמן שהמפה עוד הייתה באנימציה (TOCTOU). עכשיו הוא מחכה עד שאין `.leaflet-cluster-anim` ואין `.leaflet-zoom-anim`, ואז בוחר אינדקס ולוחץ באותו `evaluateAll`. ההוכחה היא בנייה דטרמיניסטית: הדפוס הישן נכשל בדיוק עם החתימה של ה-CI (`waiting for locator('.mehamakor-cluster').nth(3)`), והחדש עובר.

**‏chunk 2 (פתוח):** ההשערה ש-C2 נכשל כי המילוי קורה לפני hydration **הופרכה**: React כבר מחובר בזמן המילוי. ב-run `40227801535` ה-flaky היה **C3 forgot-password** (mobile), לא C2. כלומר ה-flakes בהתחברות לא מוגבלים ל-C2. מקומית C2 עבר 160/160.

**‏ממתין לספיר (בנוסף לטבלה בסעיף הקודם):**

| מה | הפעולה |
| -- | -- |
| MEH-2323 chunk 2 | סיבה לא ידועה. ה-DoD (‏`--repeat-each=10` על ה-runner, 3 ריצות נקיות על staging) לא ניתן להרצה מה-sandbox |

**‏לקחים:**
- כשההגדרה auto-close-parent פועלת, כרטיס בקרה שיש לו ילדים נסגר ברגע שהילד האחרון נסגר. כרטיס בקרה לא אמור להיות הורה.
- פתרון ל-race: לא להעלות timeout. מחכים לתנאי שהמוצר עצמו מסמן (מחלקות האנימציה של Leaflet), ואז קוראים ופועלים בפעולה אחת.

## 2026-10-25 19:00 — drain ל': גרף הצפיות, קישורי רשתות בפוטר, המשפט הקנוני; ה-CI חזר אחרי שהריפו הפך לציבורי

**‏שורה אחת:** ‏שלושה כרטיסים מהתור: MEH-2314 (#3572, מוזג), MEH-2311 (#3573, מוזג) ו-MEH-2313 (#3581, מוזג). שלושתם Done עם טבלת DoD על הכרטיס. בין 11:49Z ל-16:23Z אף job ב-Actions לא רץ, כי הריפו היה פרטי ומכסת הדקות נגמרה. ספיר הפכה אותו לציבורי, ומאז ה-CI תקין. ב-Lane B אף כרטיס לא עבר את B1–B4.

**‏ממתין לספיר:**

| מה | הפעולה |
| -- | -- |
| ענף `feature/meh-2227-drain-lamed-docs` | למחוק. הוא ישן ואין לו PR; ה-proxy חוסם מחיקה מ-CC |
| MEH-2272 (3b) | מוכן חוץ מהתנגשות קבצים עם #3528 (מוחזק) ו-#3307 |
| «בתי עסק שכבר בדקנו בשבילך» | `home.hero.subtitle` + `nav.trust_strip` — אותה בעיה של «בדקנו». כרטיס נפרד אם רוצים |

**‏לקחים:**
- בתוך SVG בדף RTL, ‏`text-anchor="start"` נמתח שמאלה. גרף עם קואורדינטות LTR צריך `direction="ltr"` משלו. jsdom לא רואה את זה; רק מדידה בדפדפן רואה.
- ב-375 התווית נחתכה וב-1440 לא, כי ב-1440 הגרף מוגבל בגובה ויש לו מרווח בצדדים. בדיקה ב-1440 בלבד הייתה מחמיצה את הבאג.
- `--grep` של Playwright מחבר את חלקי הכותרת ברווחים, לא ב-`›`. regen של VRT עם `›` בתבנית לא מצא אף טסט ולא שמר כלום.
- ריצת E2E שבוטלה בגבול הזמן אינה כישלון טסט: התקנת Chromium לקחה 6 דקות (cache miss). ריצה חוזרת אחת עברה.

## 2026-10-24 22:10 — release v1.2.2 בייצור (#3571), סיבוב הסודות הסתיים

**‏שורה אחת:** ‏main = `add01d33` (v1.2.2). ה-healthcheck של Railway הוא עכשיו `/health/readiness`: deploy ש-`db_init` שלו נכשל לא יעלה. הסודות סובבו (MEH-2291 Done). מה שלא סובב, בהחלטה: WhatsApp access/app secret, ‏Google Places (ה-billing סגור, אפשר לשחזר עד 15/11), ‏VAPID וסיסמת Postgres.

**‏מה צריך לדעת:** ‏`RESEND_API_KEY` בייצור צריך להיות מהצוות שבו `mehamakor.co.il` מאומת (MEH-2341). ‏staging→main נעשה ב-merge commit.

## 2026-10-24 19:30 — הכנות להשקה: ייצור עודכן ל-v1.2.0 ול-v1.2.1, תיקון rate limiter (כבוי עד הגדרת סוד), נגישות, והחלפת סודות בתהליך

**‏שורה אחת:** ‏ה-backend בייצור ב-Railway היה תקוע מ-7/9 על `8e69ff1`. Railway לא פרס את v1.1.0 ואת v1.1.1 בזמן האירוע, ולכן האתר החדש דיבר עם שרת ישן. ספיר פרסה ידנית, ובאותן דקות סשן אחר מיזג את v1.2.0 (#3566). **ייצור רץ עכשיו על `3517075`** (`db_init: ready`, `alembic_head 0396917da2ea`). אחר כך v1.2.1 (#3568, `c1f72e4`) עלה ל-main, frontend בלבד.

**‏מוזג ל-staging בסשן הזה (squash, כל PR בנפרד):**
- **#3562 `d8f227cf` (MEH-2298):** ה-rate limiter מקבל את ה-IP של הגולשת מה-middleware של Vercel (`x-edge-client-ip`), רק כש-`x-edge-secret` תואם ל-`EDGE_PROXY_SECRET`. כל תגובה מחזירה `X-Client-IP-Source`. **כבוי עד שהסוד מוגדר** ב-Vercel וב-Railway. ספיר אישרה את משתנה הסביבה החדש.
- **#3565 `0f6e0453` (MEH-2308):** קישור האינסטגרם בפוטר וקישור מפות Google ב-MiniMap. השם הנגיש שלהם מכיל עכשיו את הטקסט הנראה (WCAG 2.5.3). כפתור הצ'אט נדחה ל-PR נפרד, כי 7 אתרי טסט מחפשים אותו לפי ה-label, ושניים מהם בודקים היעדר.
- **#3567 `05345e31` (MEH-2286):** «מהמקור פנו אליי ישירות» חזר לטופס ההרשמה.
- **נסגר בלי מיזוג:** #3553. ספיר החזירה את חשבון האינסטגרם ל-`meha_makor`. MEH-2301 בוטל.

**‏ממתין לספיר:**

| מה | הפעולה |
| -- | -- |
| MEH-2291 | להשלים את החלפת הסודות: production, staging, backup-cron (R2), Vercel. שלבי A–F בצ'אט. Postgres רק אם ל-Railway יש Regenerate |
| `EDGE_PROXY_SECRET` | אותו ערך ב-Railway (שתי הסביבות) וב-Vercel (Production + Preview). בדיקה: `/api` מחזיר `X-Client-IP-Source: edge` |
| MEH-1905 | `railway.json:8` → `/health/readiness`. הקובץ חסום ל-CC (deny hook), זו עריכה של שורה אחת ב-GitHub |
| MEH-1495 | Google Cloud billing. בלעדיו שורת הדירוג נעלמת |
| MEH-1189 | קטגוריית חוות הגליל + ניקוי ישויות בדיקה דרך האדמין |
| Sentry | לבדוק מכסה + Rate Limit ב-Client Keys |
| #3515 (npm group, Next 16.4.2) | **לא למזג לפני ההשקה.** axe 4.14 מפיל 40 בדיקות E2E בגלל כפתור הצ'אט; ייתכן גם flake ב-`05-map-navigation:104` |

**‏לקחים:**
- `main` מעודכן לא אומר שייצור מעודכן. לבדוק את `git_sha` ב-`/api/health` מול `main` אחרי כל release.
- כש-axe מתעדכן, הוא יכול להוסיף כללים. 40 כישלונות E2E ב-PR של תלויות היו נגישות אמיתית, לא באג בעדכון.

## 2026-10-22 14:05 — CC מקצה לקצה: כלל 23 שונה, 7 PR-ים מוזגו; staging מושבת בגלל הטוקן של Railway

**‏שורה אחת:** ‏ספיר הודיעה שהיא לא בודקת בנייד וש-CC עושה הכל. כלל 23 עודכן (#3556), ומוזגו ארבעת ה-PR-ים של UI (#3541 · #3542 · #3544 · #3551), הקופי של העיר (#3557) וה-purge (#3558). **הכל מוזג ל-staging. שום דבר מזה עוד לא ב-production**, כי Railway לא נבנה.

**‏חוסם מספר 1 — MEH-2291 (ספיר):** סיבוב הסודות אחרי אירוע Railway, ובמיוחד שלבים #10–#11 — טוקנים חדשים ל-`RAILWAY_STAGING_TOKEN` / `RAILWAY_PRODUCTION_TOKEN` ו-redeploy.
- **עד אז:** ה-backend של staging לא עונה, ה-E2E מריץ 0 טסטים, ו-MEH-2168 לא יכול להיסגר.
- **אחרי «הטוקן הוחלף»:** CC תריץ את Deploy מחדש ותאמת.

**‏ממתין לספיר:**

| מה | הפעולה |
| -- | -- |
| MEH-2291 | סיבוב סודות + טוקני Railway (שלבים בכרטיס) |
| #3543 MEH-1207 (`do-not-merge`) | להגיד ל-CC במפורש «תסיר את ה-do-not-merge» — כלל 30 |
| #3514 pyjwt | `uv lock` ממחשב עם PyPI (פקודה ב-HANDOFF 13:40) |
| MEH-2244 | Linear Settings → Workflow → auto-close parent issues |
| MEH-2295 | טוקן ה-CI reviewer |
| MEH-2298 | הצעת תיקון בכרטיס; מדידה = endpoint זמני + קריאה אחת כאדמין, או Railway logs |
| הוראות הפרויקט ב-claude.ai | DoD עדיין כולל «נבדק בנייד» — לעדכן אצלך |

**‏לקחים:**
- כש-Deploy נכשל, לקרוא את הלוג של `Redeploy staging service` לפני שמאבחנים את ה-backend. כאן השורש היה טוקן, לא קוד.
- טסט «קורא יחיד» שמחפש שם טבלה בטקסט נכשל גם על docstring. מודול שקורא דרך שכבה אחרת לא צריך להזכיר את שם הטבלה.

## 2026-10-22 13:40 — סשן CC בלי npm (רק GitHub נגיש): 4 PR-י UI פתוחים עם צילומים, תיקון flake, ושני ממצאים לפני השקה

**‏שורה אחת:** ‏ה-sandbox של הסשן הזה ראה **רק GitHub** (npm / pypi / mehamakor.co.il / Vercel חסומים — גם אחרי שההגדרות בסביבה תוקנו; הסשן נפתח מהמשימה המתוזמנת, ייתכן שעל סביבה אחרת). העבודה נעשתה עם CI כאורקל, וצילומי 375/1440 הופקו דרך `vrt-update.yml` עם spec זמני על ענף זרוק. **מוזג:** #3547 (flake ב-HomepageMiniMap, MEH-2297) · #3548 `d9506847` (MEH-2284 — stub ל-`/experiences/count` בשני טסטי admin; ה-429 נבע מ-60/דקה ל-IP כשכל ה-CI יוצא מ-IP אחד). **ה-classifier של הסשן חסם מיזוגים נוספים** — כל השאר מחכה לספיר.

**‏ממתין לספיר (לפי סדר):**

| מה | מצב | הפעולה |
| -- | -- | -- |
| **#3514 — pip group: pyjwt 2.13→2.15** | pip-audit מציג advisories על pyjwt 2.13 שנעול ב-staging/prod; CI אדום רק כי dependabot לא מחדש `uv.lock` | ממחשב עם PyPI: `cd backend && uv lock --upgrade-package aiohttp --upgrade-package anyio --upgrade-package certifi --upgrade-package multidict --upgrade-package urllib3 --upgrade-package werkzeug`, אחר כך `uv run mypy app/services/category_slug.py` (שגיאת `var-annotated` אחת), push, pytest על SQLAlchemy 2.1. #3489/#3490 — לקפל לאותו מעבר lock או לנעול מחדש אחרי |
| **MEH-2298 (חדש)** — rate-limit אולי ממפתח לפי IP של Vercel ולא של הלקוחה | **השערה, לא נמדדה.** `/api/*` עובר ב-`rewrites()` צד-שרת (`next.config.js:195-212`) ו-`rate_limit.py:67-93` מעדיף `X-Real-IP` שנכתב מה-TCP peer | מדידה ב-Railway logs לפני ההשקה (פרטים בכרטיס) |
| #3541 MEH-2294 · #3542 MEH-1430 · #3544 MEH-1685 (ACs 1–3) | CI gate ירוק / רץ שוב; צילומים ב-`qa-artifacts/MEH-<N>/` | מעבר על הצילומים + merge. לא מוזגו ע"י CC: כלל 23 דורש Vercel+Sentry MCP למיזוג בלי עין אנושית, ואינם מחוברים |
| #3543 MEH-1207 (`do-not-merge`) | כל ה-jobs ירוקים; מחליף את שורת הטאבים בנייד | אישור ההחלפה + regen ל-VRT של עמוד העסק בנייד |
| #3515 npm group | ירוק בשערים הנדרשים | merge אחרי E2E; לבדוק staging (next 16.3→16.4) |
| #3492 unicorn 74 | ERESOLVE (דורש eslint 10) | להחזיק עד MEH-893 |
| #3551 MEH-2300 — סמן העכבר נעלם מעל צ'אט «שאלו אותנו» | z-index של הסמן 9999→10001 (תיקו עם הצ'אט); טסט אדום→ירוק | בדיקה ידנית ב-Chrome/Safari + merge |
| #3552 MEH-1514 — baseline של /about desktop | שער ה-reveal מדלג על אלמנטים `position: fixed`; baselines חדשים נבדקו בעין (כל הסקציות מרונדרות) | merge אחרי E2E |
| #3543 — VRT | regen של producer-detail במובייל (`b34ac922`); בעין: שורת pills במקום טאבים. **שים לב:** התג «חדש» → «אין ביקורות עדיין» — לא מה-PR הזה, baseline ישן | מבט + merge |
| #3514 — mypy | נוספו הערות טיפוס ב-`category_slug.py` (`255dca5b`) — אחרי `uv lock` נשאר רק pytest | `uv lock` כמפורט למעלה |

**‏נבדק ונעצר — אין מה לבנות:** MEH-2122 chunk A (#3007), MEH-2168 chunk 2 (#3278), MEH-2241 chunks A+B (#3449/#3461 — נשאר רק הכרעת קופי), MEH-2244 (כל ה-chunks נחתו; נשאר wiring ב-workflow + הכרעות). MEH-2079 chunk C — חסום על הכרעת top_cities + עו"ד + שחזור תיאור. MEH-2272 — דורש סשן עם npm+uv. MEH-1428 chunk 2 — ה-Deploy המוצלח האחרון ל-staging הוא 14/08, לא ניתן לאמת את ה-revision (נרשם בתיאור).

**‏לקחים:**
- **סשן בלי npm יכול לספק צילומים:** spec זמני ב-`e2e/visual/` שכותב ל-`*-snapshots/` ורץ רק תחת `--update-snapshots`, הרצה דרך dispatch של `vrt-update.yml` על ענף זרוק — הבוט מחזיר את ה-PNG-ים לענף. ה-backend של staging ישן (14/08), אז endpoints חדשים צריכים stub ב-spec.
- **flake ב-`HomepageMiniMap.test.jsx`** האדים PR-ים לא קשורים — תוקן ב-#3547 (מחכים לאתחול Leaflet, לא ל-div).
- **ענף זרוק `feature/meh-2294-qa-bundle`** — מחיקה מרחוק נדחתה מה-sandbox; למחוק ידנית.

## 2026-10-22 12:55 — סשן claude.ai (לא CC): מדריך outreach לטופז + PR #3545 לקופי ישן מלפני ADR-022

**‏שורה אחת:** ‏ספיר מכניסה את אחותה טופז להתקשר לבתי עסק. נבנו שני artifacts ב-claude.ai (מדריך כתוב + אפליקציית מדריך עם צ'אט `sample`), ובדרך נמצא ש-3 משטחי קופי עדיין אומרים "רישיון בלבד" — מודל שהוחלף ב-ADR-022 (05/06). החמור: מייל 5B (`onboarding_followup.py`) נשלח לעסק **מאושר וחי** בלי מספר רישיון ואומר "הפרופיל ממתין… נסיר את הפרטים". **PR #3545** (`feature/meh-2296-adr022-copy`, 3 קבצים, 2 commits) מתקן את שלושתם — **מוזג ל-staging `f48ab643`** (squash, אומת: הורה אחד) בהרשאת ספיר («כל מה שעליי תעשה אתה בעצמך», 12:58). ה-reviewer האוטומטי נכשל (MEH-2295) → סקירה אדברסרית בסוכן נפרד: 0 BLOCK, 3 MINOR, אחד תוקן (`2ba67c8`). CI: build · vitest · pytest · שני השערים הנדרשים ירוקים. Linear לא סגר אוטומטית → MEH-2296 נסגר ידנית עם DoD (כלל 29b). **ה-backend ב-production עדיין `8e69ff1e`** — מייל 5B החדש מגיע לפרודקשן רק אחרי שה-Railway redeploy יצליח.

**‏מה קרה בסשן הזה, בקצרה:**

| מה | איפה |
| -- | -- |
| מדריך outreach כתוב (7 סעיפים: מה זה מהמקור · איך פונים · תסריט · התנגדויות · העמוד באתר · אחרי השיחה · פערים) | claude.ai Docs artifact «מדריך outreach לאחות — מהמקור» |
| אפליקציית מדריך לטופז, RTL, Frank Ruhl + Heebo, מצב שיחה, חיפוש התנגדויות, צ'אט עם קלוד (`capabilities: sample`) | claude.ai artifact «מדריך השיחות של מהמקור» — פרטי עד שספיר משתפת |
| MEH-2296 נפתח (template 07, קופי מאושר ורבטים 22/10) → PR #3545 | Linear + GitHub |
| ספיר תיקנה אותי: עסק נכנס גם בלי רישיון, הרישיון קובע רק את התג (ADR-022). המדריך, האפליקציה ו-MEH-2296 תוקנו בהתאם | — |

**‏סתירה שהסשן הזה חשף ולא פתר (ספיר):** הוראות הפרויקט ב-claude.ai עדיין נושאות LOCK «Licensed businesses only». הצעת החלפה: «Two-tier licensing (ADR-022): מאומת / מוצהר. Badge = license, never entry. Home cooks stay out.»

**‏עוד ממצאים (לא נגעתי):** **הדומיין הקנוני הוא `mehamakor.co.il`** (ספיר 18/07, MEH-1322 — `robots.txt:59`, `config.py:114`); `docs/DEPLOYMENT.md:22` עדיין אומר `mehamakor.online` = production, וגם הוראות הפרויקט ב-claude.ai — שניהם ישנים, לא הקוד · MEH-2135 אומר "הסקריפט לא הורץ" אבל בגיליון `mehamekor_producers` יש לשונית «מרשם משרד הבריאות» עם 193 שורות (Wave 1, מחוז חיפה) — כלל 34 מבקש לעדכן את ה-description · MEH-2208 (§14, לידים במדיניות הפרטיות) ו-§30א(ה) (`outreach-disclosure-line.md`) עדיין פתוחים משפטית — ה-README של `docs/outreach` אומר במפורש לא להוציא גל כתוב לפני בדיקת עו"ד.

**‏מה שאצל ספיר:** לשתף את שני ה-artifacts עם טופז · משתמש `role='admin'` לטופז (אין תפקיד outreach מצומצם; עד שיהיה, הכללים "מה לא לעשות" בחלק 5 של המדריך) · עדכון ה-LOCK + הדומיין בהוראות הפרויקט (`mehamakor.online` → `mehamakor.co.il`) · תיקון `docs/DEPLOYMENT.md:22` באותו הזדמנות.

**‏סמיכות לסשן ה-CC של הבוקר (11:50):** הסשן הזה הוא claude.ai, לא CC, ולא נגע בתור ה-UI שנרשם שם. הבדיקה המתוזמנת של 13:15 (`direct_outreach`) שייכת לסשן ההוא. המדריך של טופז כבר מכיל fallback («אחר» + "טופז ממהמקור") לזמן שהאפשרות מוסתרת.

## 2026-10-22 11:50 — תור ה-CI נוקה (7 PR-ים); כרטיסי ה-UI ממתינים ל-session עם npm

**‏שורה אחת:** ‏הבוקר מוזגו ל-staging: #3534 (MEH-1981 יידוע §11 בניוזלטר + צור קשר — כרטיס Done) · #3536 (MEH-2279) · #3537 (MEH-2280) · #3539 (MEH-2281) — טסטי vitest, כל אחד עם הוכחת red→green ב-CI · #3538 (MEH-1829 chunk 1/2 — backend של `sort=distance`; sub-issue MEH-2293 Done, ה-frontend הוא MEH-2294) · #3535 (MEH-1742 פריט 5) · #3533 (כרטיס drop חדש MEH-2292). **production backend עדיין `8e69ff1e`** (נמדד 11:45) — Railway לא החזירו builds ל-Hobby.

**‏למה נעצר כאן:** ה-sandbox של הסשן הזה חסום ל-`registry.npmjs.org` / `pypi.org` / `mehamakor.co.il` (נמדד 11:12 גם אחרי שספיר הוסיפה אותם לסביבה — ההגדרה חלה על session חדש). בלי npm אין vitest/build/Playwright מקומי ואין צילומי 375/1440, ולכן כל כרטיס UI נשאר לסשן הבא. **אל תפתחו את הסשן הבא במקביל לזה** (כלל single-session) — רק אחרי שהסשן הזה נסגר.

**‏שורה לפתיחת הסשן הבא (להדביק כמו שהיא):**
> קראי HANDOFF.md → הסעיף «2026-10-22 11:50». קודם בדקי ש-`curl -sS -o /dev/null -w '%{http_code}' https://registry.npmjs.org/vitest` מחזיר 200. ואז עבדי על «התור לסשן עם npm» לפי הסדר, סוכן לכל כרטיס, PR לכל כרטיס.

**‏התור לסשן עם npm (לפי סדר):**

| # | כרטיס | מה | הערות |
| -- | -- | -- | -- |
| 1 | MEH-2294 | אפשרות «לפי מרחק» ב-`ProducersClient.jsx`, מוצגת רק כשיש GPS · vitest · צילומי 375/1440 | ה-backend כבר ב-staging (#3538): `sort=distance` דורש `lat`+`lng` (אחרת 422), מחזיר `distance_km`, `X-Total-Count` לא משתנה. ההורה MEH-1829 נסגר אחרי שזה נכנס |
| 2 | MEH-1430 | רענון `LocationModal.jsx` (bottom-sheet/dialog לפי המוקאפ המאושר) | LOW-RISK, סמכות end-to-end כתובה בכרטיס. Phase 0: hit-test לבאג ה-z-index של GPS (MEH-263) |
| 3 | MEH-1207 | `SectionAnchorNav.jsx` חדש בעמוד בית העסק | עמוד בית העסק = central component → rule 23 carve-out (a): CC בונה + צילומים, **ספיר עוברת בעצמה לפני merge** |
| 4 | MEH-1428 chunk 2 | «בקשו ביקורת» — כרטיס בדשבורד, `?rt=` → sessionStorage, שורת «בהזמנת בית העסק» | chunk 1 = #3368 (`15e2fbda`). Phase 0: לוודא ש-alembic `3f9a7c2e5d18` רץ ב-staging (ספיר) |
| 5 | MEH-1685 ACs 1–3 | autocomplete: highlight הפוך · thumbnails של Cloudinary · תקרת הצעות | AC 4 (focus mode במובייל) = הכרעת עיצוב פתוחה — לא לגעת |
| 6 | MEH-2272 | הסרת ה-alias `is_available_today` + הזוג הלגסי | דורש regen של `openapi.json` + `lib/generated/api.zod.js` (`npm run codegen`) — לכן כאן |
| 7 | — | `--update-baseline` של ה-coverage ratchet אחרי #3536/#3537/#3539 | אופציונלי; לא נעשה כי אין `--coverage` מקומי |

**‏מה שאצל ספיר (לא CC):**

| מה | איפה |
| -- | -- |
| Railway: סיבוב סודות + tokens חדשים ל-GitHub + redeploy | MEH-2291 (צ'קליסט מלא בכרטיס). ספיר כתבה «סובבתי» ב-10:50; ה-redeploy עצמו ממתין ל-builds ל-Hobby. **שימי לב:** הקונטיינר הישן רץ עם המפתחות הישנים — אם ה-Resend הישן בוטל, מיילים לא יוצאים עד ה-redeploy |
| סוקר ה-CI שותק מאז 21/10 (`Claude execution failed`, אפס תגובות `claude[bot]` על #3516–#3539) | MEH-2295 — כנראה `CLAUDE_CODE_OAUTH_TOKEN` פג; לא אומת (לוגים חסומים ל-sandbox) |
| תגים `v1.1.0` (`5980abd7`) · `v1.1.1` (`94feb78e`) | מהמחשב שלך (ראו הסעיף מ-10:17) |
| PR-ים נעולים #3524 · #3525 · #3528 | ללא שינוי |
| MEH-2168 — הפיכת ה-probe ב-`e2e.yml` לשער חוסם | הכרעה, לא ידיים — ה-diff המלא בכרטיס |

**‏מתוזמן:** בדיקה ב-13:15 (trigger `trig_014GWGM59omTfZhRCrFzXZnm`, נוחת בסשן **הזה**): אם `/api/health` מראה sha חדש — מחזירה את `direct_outreach` לטופס ומשחררת; אחרת שולחת לספיר הודעה רק אם Hobby חזר.

## 2026-10-22 10:17 — hotfix v1.1.1: `direct_outreach` מוסתר ב-frontend; Railway = אירוע אבטחה, ה-Deploy job נכשל עד שיהיו tokens חדשים

**‏שורה אחת:** ‏`main` = `94feb78e` (#3531, merge commit) מעל hotfix #3530 (`30b4926b`, squash ל-staging). האפשרות «מהמקור פנו אליי ישירות» **מוסתרת ב-frontend בלבד** (`RegisterProducerClient.jsx`, שורה אחת להחזרה) כי ה-backend ב-production עדיין `8e69ff1e`. **הסיבה התעדכנה:** Railway 21–22/10 = security incident — builds מושהים ל-Hobby + **כל ה-API tokens בוטלו 04:17 UTC** → `railway redeploy` ב-`Deploy` נכשל ל-main ול-staging גם ב-re-run. פירוט ב-[docs/CHANGELOG.md](./docs/CHANGELOG.md) → «22/10 (09:10–10:17)».

**‏מה שסשן חדש חייב לדעת, לפי דחיפות:**

| מה | מצב | הצעד הבא |
| -- | -- | -- |
| **production backend** | `/api/health.version.git_sha` = `8e69ff1e`; ה-job `Deploy` אדום ל-main ול-staging (re-runs של `39673964501` / `39680276996` נפלו שוב 09:0x) | **ספיר:** Railway → Account → Tokens → ליצור tokens חדשים → לעדכן `RAILWAY_PRODUCTION_TOKEN` + `RAILWAY_STAGING_TOKEN` ב-GitHub Secrets → re-run של `Deploy`. **או** Railway dashboard → Deploy Latest Commit, ברגע ש-builds ל-Hobby חוזרים |
| **rotation של secrets** | Railway's disclosure ממליץ rotation — [blog.railway.com/p/security-disclosure-wednesday-october-21st](https://blog.railway.com/p/security-disclosure-wednesday-october-21st) | **ספיר בלבד:** Postgres creds · `ANTHROPIC_API_KEY` · `RESEND_API_KEY` · Cloudinary · `JWT_SECRET_KEY`. לא מתוך CC |
| **`direct_outreach` מוסתר** | `RegisterProducerClient.jsx` → `REFERRAL_SOURCE_KEYS` בלי `"direct_outreach"`; he/en/constants.py שלמים | אחרי ש-`/api/health` מראה sha אחרי `5980abd7`: להחזיר `"direct_outreach"` לרשימה (שורה אחת, הקומנט בקוד מסמן איפה). בדיקה מתוזמנת 13:15 אמורה לעשות זאת לבד — לוודא |
| **תגים** | `v1.1.0` (`5980abd7`) · `v1.1.1` (`94feb78e`) — לא נדחפו (sandbox לא יכול) | ספיר: `git tag -a v1.1.0 5980abd7 -m "release: v1.1.0" && git push origin v1.1.0` ואותו דבר ל-`v1.1.1` על `94feb78e` |
| **PR-ים נעולים (`do-not-merge`)** | #3524 · #3525 · #3528 | סקירת ספיר אחרי ההשקה (ללא שינוי מ-00:40) |

**‏לקח שמתקן את הלקח של אמש:** «Invalid RAILWAY_TOKEN» היה אתמול סימפטום של API שלא עונה; **היום הוא נכון מילולית** — Railway ביטלו את כל ה-tokens. שני המקרים נראים זהים בלוג של ה-CLI; מה שמבדיל ביניהם הוא status.railway.com + ה-disclosure, לא הלוג. הכלל נשאר: סטטוס לפני rotation — והיום הסטטוס אמר rotation.

## 2026-10-22 00:40 — release v1.1.0 יצא, Railway בתקלה עולמית, שלוש פצצות-זמן ושלושה PR-ים נעולים

**‏שורה אחת:** ‏`main` = `5980abd7` (#3521, merge commit). Vercel חי; **ה-backend לא** — Railway Major Outage (builds paused), לא token. Search Console מאומת + sitemap הוגש. MEH-2192 · MEH-2288 · MEH-2290 Done. פירוט ב-[docs/CHANGELOG.md](./docs/CHANGELOG.md) → «22/10».

**‏מה שסשן חדש חייב לדעת, לפי דחיפות:**

| מה | מצב | הצעד הבא |
| -- | -- | -- |
| **production backend** | `/api/health.version.git_sha` = `8e69ff1e` (07/09) למרות release | **לבדוק `/api/health`.** אם עדיין ישן: status.railway.com; כשהם חוזרים, Railway בונה `main` לבד. אם ה-outage נגמר והבנייה לא קרתה → Railway dashboard → Redeploy (ספיר). **עד אז: הרשמה עם «מהמקור פנו אליי ישירות» → 422.** בדיקות מתוזמנות: 01:05, 90 דק', 09:00 (הסתרה הפיכה ב-frontend אם צריך, אלא אם ספיר אמרה «אל תסתירי») |
| **תג `v1.1.0`** | לא נדחף (sandbox) | ספיר: `git tag -a v1.1.0 5980abd7 -m "release: v1.1.0" && git push origin v1.1.0` |
| **PR-ים נעולים (`do-not-merge`)** | #3524 שעות (אחרי 2 תיקוני סקירה) · #3525 lat/lng (סקירה בתהליך בעת הכתיבה) · #3528 top_product_name | סקירת ספיר אחרי ההשקה; #3524/#3525 מתנגשים על חתימת `upsert_primary_branch_location` — השני rebase. **לא מחליפים drop:** chunks 7-10 ב-MEH-2288 נשארים RED |
| **MEH-2272 / MEH-2064 (chunks 1, 6)** | לא התחילו | דורשים regen של `openapi.json`/Zod — סשן CC מקומי עם orval |
| **GSC** | מאומת בחשבון sapir000s; sitemap «לא ניתן היה לאחזר» = ראשוני | לבדוק בעוד יום שהסטטוס התעדכן |
| **פצצות-זמן** | 3 פורקו (special_hours #3526, kashrut fixtures #3527, LEGACY #3519/#3523) | אופק הבא: `lib/holidays.js` 11/06/2027 |

**‏שני לקחים שהלילה הזה הוסיף, לכלל:**
1. **תאריך קשיח בריפו הוא פצצת-זמן אלא אם יש לו שעון קפוא או guard.** שלוש מחלקות שונות פוצצו באותו ערב (סמן LEGACY, literal בטסט backend מול `israel_today`, literal בטסט frontend מול `new Date()`), כולן בלי שינוי קוד. ה-idioms קיימים (`monkeypatch israel_today`, `vi.setSystemTime`, sentinel 2099) — מה שחסר הוא בדיקה בזמן הכתיבה. מועמד ל-guard: grep של `20[2-9][0-9]-[01][0-9]-[0-3][0-9]` ב-tests שלא ליד freeze.
2. **«Invalid RAILWAY_TOKEN» ≠ token פג.** ה-CLI מדפיס את זה גם כשה-API של Railway לא זמין. לפני rotation — status.railway.com. (טעות שנעשתה ותוקנה באותו לילה; הרשומה המקורית ב-CHANGELOG מתוקנת.)

**‏איך הלילה עבד (לפרוטוקול):** session claude.ai אחד (לא CC), עם Linear/Chrome/GitHub-REST; סוכני רקע לסקירה אדברסרית (3), Phase 0 (1), סריקת פצצות-זמן (1), והכנת PR-ים נעולים ב-worktrees (3). כל PR שמוזג: squash מאומת + flip-check ב-Linear (MEH-2286 נדרש סגירה ידנית — כיוון שני של כלל 29b).

## 2026-10-21 ערב — session claude.ai לפני ה-outreach של 22/10: #3516 + #3517 פתוחים, CI חסום על מכסה

**‏שורה אחת:** ‏שני PR-ים ירוקים-להלכה מחכים ל-CI שלא רץ — **כל job נופל ב-2 שניות עם אפס steps** (חתימת מכסת Actions, כלל 21). ספיר פותחת את המכסה → ‏`rerun` → מיזוג → release `staging → main`. פירוט ב-[docs/CHANGELOG.md](./docs/CHANGELOG.md) → «21/10».

**‏מה שסשן חדש צריך לדעת:**

| מה | מצב | הצעד הבא |
| -- | -- | -- |
| #3516 `24d8ab28` — MEH-2286 referral `direct_outreach` | פתוח, non-draft, CI לא רץ | אחרי המכסה: re-run, שני האגרגטורים ירוקים → מיזוג. UI: צילום 375 של ה-dropdown ב-staging (DoD §5) |
| #3517 `2aaec0db` — MEH-2287 templates → 5.5 | פתוח, docs-only | re-run → skip-green → מיזוג |
| release `staging → main` | staging לפני main ב-13 קומיטים (כולם docs/CI/tests מאז 07/09) + שני אלה | ספיר כותבת «שחררי»; ה-15 «קומיטים» שב-main ולא ב-staging הם **רק merge commits של רילזים קודמים — אפס קבצים**, לא drift |
| MEH-1495 Google Cloud trial | הדדליין עבר, לא אומת | ספיר: Billing לפני האישור הראשון של בית עסק |
| MEH-2192 שארית | `description` ≠ CANONICAL_SENTENCE, טסט מקבע | הכרעת ספיר (B3). לא נגעתי |
| production | `/api/producers` → `[]`, readiness `ready`, migrations `0396917da2ea` | — |

**‏מה שנמדד ואין צורך לפתוח עליו כרטיס:** אינדוקס גוגל תקין (דף הבית #1 על «מהמקור»); nudge ל-draft קיים (MEH-2111); אירועים מהדשבורד קיימים.

**‏הבא (NEXT):** ‏(1) ספיר: מכסת Actions · (2) מיזוג #3516 + #3517 · (3) release · (4) אחרי האישור הראשון של בית עסק: עמוד העסק + שורת הדירוג (1495) + ה-sitemap מתחיל לפלוט עמודי עסק.
