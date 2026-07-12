# דוח פערי צמיחה — מהמקור (MEH-1144)

**תאריך:** 2026-07-12 · **סוג:** Discovery, READ-ONLY · **סיכון:** GREEN (docs-only)
**מטרה:** מיפוי מה הקוד כבר תומך ומה חסר עבור 5 עדשות צמיחה. **לא מימוש** — קלט לתעדוף טיקטים ע"י ספיר.

> כל טענה על קוד מגובה ב-`file:line`. פערים שלא אומתו מסומנים `UNVERIFIED`.
> העדשות: L1 משלימים · L2 איסוף · L3 גיוס · L4 המרה · L5 מוכנות מנוי.
> **11 פערים** (מתוך תקרת 15) — איכות > כמות.

---

## L1 — משלימים (זיווג בין בתי עסק)

### מה קיים
- **תשתית MEH-392 "similar_producers" = דמיון-קטגוריה בלבד, מחושב בצד לקוח.** אין endpoint ייעודי; הלוגיקה משתמשת מחדש ב-`GET /producers` עם פילטר קטגוריה + `exclude`:
  - `frontend/app/[locale]/producer/[id]/hooks/useProducerData.js:56-68` — לוקח את **הקטגוריה הראשונה בלבד** (`producer.categories[0].id`, שורה 59), קורא `/producers?category=…&exclude=…&limit=3` (שורה 62), ומציג רק אם `list.length >= 3` (שורה 65).
  - תמיכת backend = פרמטר יחיד: `backend/app/routers/producers.py:87-88` (`exclude: UUID`, הערה "used by similar-producers widget").
  - רינדור: `frontend/app/[locale]/producer/[id]/components/ProducerSections.jsx:324-337` (כותרת `similar.heading`, מגובה ≥3).
- **קטגוריות הן הפרימיטיב היחיד לקיבוץ.** מודל `Category` שטוח (`id/name/emoji`) — `backend/app/models/models.py:390-399`; טבלת קישור M2M `ProducerCategory` — `models.py:402-412`.

### מה חסר
- **"similar" מציג מתחרים, לא משלימים.** אותה קטגוריה = מאפייה↔מאפייה, ההיפך מ-משלימים (מאפייה↔ריבות). אין מושג cross-category או curated בכל המסלול.
- **אין שום יחס producer↔producer.** אישור: גרפ מלא ב-`models.py` — אין `producer_relations`/`complementary`/FK עצמי על `Producer` (המחלקה `models.py:43`). ה-`Table()` היחיד מעבר ל-categories הוא `producer_recipe_products` (`models.py:1172`, producer↔recipe לא producer↔producer).
- **אין מערכת תגיות (tags) כלל** — גרפ `tag`/`Tag` ב-`models.py` = 0 תוצאות.
- **הטקסונומיה שטוחה.** MEH-927 (`backend/alembic/versions/20260623_1945_c3f8a1d27e94_meh927_taxonomy_cats.py`) הוא איחוד רשימה שטוחה (19→18), **לא** היררכיה/תת-קטגוריות. אין `parent_id`, אין עץ לתלות עליו "משלימים".

### פער
**G1 — אין תשתית לזיווג ידני "משלימים" בין בתי עסק.** נדרש: טבלת join חדשה (או M2M עצמי) + endpoint + UI אדמין + סקשן צרכני. Effort **M**.

---

## L2 — איסוף (עמוד "יום איסוף" בסגנון REKO: מקום+שעה+רשימת עסקים)

### מה קיים (אבני בניין — כולן חד-עסקיות)
- **`Event`** — `backend/app/models/models.py:678-703`: יש `location` (שורה 691), `city`, `event_date`, `event_time`, `lat/lng`. הכי קרוב ל"מקום+שעה" — **אבל keyed על `producer_id` יחיד** (שורה 682). Endpoints: `backend/app/routers/events.py:59` (list), `:87` (upcoming), `:116` (create). עמוד: `frontend/app/[locale]/events/`.
- **`GroupBuy` (MEH-52)** — `models.py:1009-1038`: `city` (שורה 1030), `deadline`, מונה commit + מחיר קבוצתי. **חד-עסקי** (`producer_id`, שורה 1015). עמוד: `frontend/app/[locale]/group-buys/`.
- **`DeliveryArea`** — `models.py:465-478`: `city` + `delivery_day` + `min_order`, per-producer.
- **`FridayDeliveryStrip`** — `frontend/components/FridayDeliveryStrip.jsx:54-60`: מציג בתי עסק לפי `availability_state=available_today` + `delivery_city`. זו **אגרגציה של UI לפי זמינות**, לא ישות "נקודת איסוף" מתוזמנת.
- דגל `pickup_points` (bool) — `models.py:96`, נחשף ב-`producer_me.py:192`, מיובא ב-`producer_import.py:125`. דגל בוליאני בלבד, ללא מקום/שעה/רשימה.

### מה חסר
- **אין ישות רב-עסקית לנקודת איסוף / יום שוק.** כל ישות קיימת (`Event`, `GroupBuy`) קשורה ל-`producer_id` **יחיד**. REKO = מקום אחד + שעה אחת + **רשימת עסקים**. אין טבלה או תצוגה שמקבצת מספר בתי עסק לאותה נקודה+שעה.
- אין שיוך של `Event`/`GroupBuy` ל"אירוע-על" משותף (אין `market_id`/`pickup_event_id`).

### פערים
**G2 — אין ישות "יום איסוף" רב-עסקית (REKO).** נדרש: ישות חדשה (מקום+שעה) + יחס many-to-many לבתי עסק + עמוד. Effort **L**. *(חלופה קלה יותר: תצוגת-קיבוץ מעל `Event` לפי `location+event_date` — Effort M, אבל לא מכסה "רשימת עסקים באותה נקודה" ללא שינוי schema.)*
**G3 — `FridayDeliveryStrip` הוא אגרגציית-זמינות, לא איסוף מתוזמן.** מציג "מי מחלק היום" (`FridayDeliveryStrip.jsx:54`), אין מקום/שעת-איסוף מוגדרת. פער-מוצר קטן: אפשר להרחיב לרצועת "נקודות איסוף השבוע" אם G2 ייבנה. Effort **S** (מותנה ב-G2).

---

## L3 — גיוס (משפך `/register/producer`)

### מה קיים
- **אשף רב-שלבי** (לא טופס אחד ארוך) — `frontend/app/[locale]/register/producer/RegisterProducerClient.jsx`. enum שלבים: `:28` (`ACCOUNT / DETAILS / CATEGORY / STORY / CONFIRM`).
  - מסך 0 preflight (`:362-375`), מסך ACCOUNT (`:447-547`, מדולג למחוברים), DETAILS (`:550-642`), CATEGORY (`:644-809`), STORY (`:811-1015`), CONFIRM (`:1029-1096`).
  - **~9 שדות קלט** עד submit + 2-3 checkbox חובה (שם/אימייל/סיסמה/שם-עסק/טלפון/עיר/[כתובת]/[רישיון]/[טאגליין]/[תיאור]).
- **הפחתת חיכוך קיימת:** OAuth Google+Apple (`ProducerOAuthButtons.jsx`, mounted `:459`; backend `auth.py:791-810`); prefill מ-OutreachLead (`?prefill=` ב-`:69`, applied `:177-191`); שמירת draft ל-localStorage (`:193-198`).
- **Backend:** `POST /auth/register/producer` — `backend/app/routers/auth.py:364` (handler `:379`). סטטוס נוצר `status="pending_whatsapp"` (`auth.py:503,601`), משתמש `email_verified=False` (`:633`).
- **פרסום דורש `status=="approved"`** (`producer_listing.py:104,117,136`), שמתקבל רק ע"י אדמין ידני (`admin.py:485`) עם 2 גייטים: תמונה אחת לפחות (`admin.py:462-466`) + מספר רישיון לקטגוריות רלוונטיות (`:471-477`).

### מה חסר (הפער הגדול)
- **אפס מדידת משפך — נטישה לא ניתנת למדידה היום.**
  - `trackEvent` הוא stub ריק בפרודקשן — `frontend/lib/analytics.js:12` ("Production hook: wire to Plausible / PostHog in a future PR"; console-only בדב, `:8-10`).
  - **אפס קריאות `trackEvent` ב-`register/producer/`** — הקריאות היחידות הן בעמוד ה-listing (`ProducersClient.jsx:149,227,240,263,283`).
  - Clarity double-gated: `ClarityScript.jsx:6-33` נטען רק אם `cookieConsent==="all"` **וגם** `NEXT_PUBLIC_CLARITY_PROJECT_ID` מוגדר (אופציונלי). גם אז — session-replay, לא אירועי-שלב.
  - אין `gtag`/`dataLayer`/`posthog`/`mixpanel` בקוד. אין firing על מעבר-שלב (`setStep`), submit, או drop-off.
- **prefill ממלא רק name+phone** (`RegisterProducerClient.jsx:185-186`) למרות ש-`OutreachLead` מחזיק גם city/category/instagram/website (`models.py:361-367`).

### פערים
**G4 — אפס אינסטרומנטציה של משפך הגיוס; נטישה לא נמדדת.** נדרש: אירועי-שלב (preflight→ACCOUNT→…→submit) + חיווט `analytics.js:12` ל-sink אמיתי. **ערך גבוה** — מדידה חוסמת כל אופטימיזציה עתידית. Effort **S/M**.
**G5 — prefill מבזבז שדות זמינים ב-OutreachLead.** מרחיב `:185-186` ל-city/category/instagram/website. Effort **S**.
**G6 — מסלול-עד-חי ארוך (תמונה + אישור ידני) ללא מדידת נקודת-תקיעה.** תלוי ב-G4 למדידה; ללא G4 לא ידוע היכן יצרנים נתקעים בין submit ל-approved. Effort **S** (בהינתן G4).

---

## L4 — המרה (CTA וואטסאפ/קשר לכל surface + dead-ends)

### מה קיים
- **כל CTA-קשר הוא ערוץ בית-העסק עצמו** (לא גנרי) — `frontend/lib/contact-method.js:34-77` בונה `wa.me`/`tel:`/`mailto:`/IG/FB/order-form מהשדות של אותו עסק.
- **map** — CTA ישיר לכל כרטיס: `MapProducerCard.jsx:195-206` (+ קישור "פרופיל מלא" תמידי `:207-215`).
- **producer detail** — ריבוי CTA: sidebar (`ContactSidebar.jsx:53-62`), inline (`ActionRow.jsx:40-49`), sticky (`StickyContactBar.jsx:61-92`).
- `ReviewsSection.jsx:187-189` — נועל טופס ביקורת מאחורי קליק-וואטסאפ (trust surface קיים, רלוונטי כדוגמה).

### מה חסר / dead-ends
- **DEAD-END #1 (מאומת): עמוד מתכון ללא שום CTA-קשר.** `frontend/components/public/RecipeDetail.jsx` — גרפ `WhatsApp/wa.me/tel:/PrimaryContact/צור קשר` = 0 תוצאות. קורא יכול לקרוא מתכון וללא פעולת-קשר ישירה; רק breadcrumb/קישור-חזרה לעמוד היצרן (`RecipeDetail.jsx:49-51,191-196`). דליפת המרה ישירה.
- **DEAD-END #2 (מאומת): בית עסק ללא ערוץ-קשר → אפס affordance קשר.** `getPrimaryContactHref()` מחזיר `null` כשהשדה חסר (`contact-method.js:38-43,74-76`); `PrimaryContactButton.jsx:69-70` מחזיר `null` על href ריק. אם אין phone/website/email/IG/FB/order-form — כל בלוק הקשר קורס (Follow/Share/Report נשארים, קשר=0). `UNVERIFIED`: האם backend חוסם פרסום ללא שדה-קשר.
- **כרטיסי home + producers-list = ניווט בלבד.** אייקון-שיטה דקורטיבי בלבד (`ProducerCard.jsx:403-413`, `role="img"` לא קישור); אין CTA-קשר מהיר מהכרטיס. לא dead-end (יש ניווט לפרטים) אך פוטנציאל המרה מוחמץ.

### פערים
**G7 — עמוד מתכון = dead-end המרה (אין CTA-קשר).** להוסיף CTA וואטסאפ/פרופיל-יצרן ל-`RecipeDetail.jsx`. **ערך גבוה, Effort נמוך.** Effort **S**.
**G8 — בית עסק ללא ערוץ-קשר מרנדר אפס affordance קשר.** fallback CTA (למשל קישור-פרופיל/"עקבו") + `UNVERIFIED` על חסימת-פרסום. Effort **S/M**.
**G9 — כרטיסי home/producers-list ללא CTA-קשר מהיר.** action-חוזה בכרטיס (opt-in). Effort **S** (ערך נמוך יחסית — לבדוק מול DNA "מגזין לא מרקטפלייס" לפני מימוש).

---

## L5 — מוכנות מנוי (READ-ONLY ניתוח בלבד — שום migration/קוד)

### מה קיים (התשתית ברובה מונחת)
- **עמודת `plan` קיימת** (`free | premium`) — `backend/app/models/models.py:82`. נחשפת בדאשבורד יצרן: `producer_me.py:480`.
- **`/upgrade` — עמוד השוואת-תוכניות מלא קיים** אך production-gated: `frontend/app/[locale]/upgrade/UpgradeClient.jsx` (free vs premium, `price_pending`), חסום ב-`page.js:41` (`notFound()` בפרודקשן, MEH-1057) כי מודל המונטיזציה קפוא (MEH-617). המחיקה של 2 גייטים מחזירה את העמוד.
- **הגדרות אדמין קיימות:** `freemium_premium_price="0"`, `freemium_free_image_limit="3"` — `admin_extra.py:373-374`.

### מה יידרש (ניתוח בלבד)
- **`plan` דורמנטי — נאכף במקום יחיד:** תקרת 3 תמונות ב-`upload.py:86` (וגם שם MEH-1008 ניטרל את הקופי — "בלי הבטחת פרימיום"). אין gating פר-פיצ'ר מעבר לתמונות.
- **חסר לשכבת "דף פרימיום":** דגלי-תוכן פרימיום (מוצרים ללא הגבלה / סטטיסטיקות / הבלטה), חיווט תשלום/חיוב, והסרת ה-gate ב-`upgrade/page.js:41`. ה-schema (`plan` + `/upgrade` + מחיר-אדמין) מוכן ברובו; הפער הוא אכיפה + מונטיזציה, לא סכמה.

### פערים
**G10 — `plan` מונח אך דורמנטי; אין gating פר-פיצ'ר.** ניתוח בלבד — התשתית (`models.py:82`, `/upgrade`, `admin_extra.py:373`) מוכנה; חוסם = MEH-617 (מודל קפוא). Effort **ניתוח** (ללא קוד בטיקט זה).
**G11 — אין דגלי-תוכן פרימיום ברמת schema.** ניתוח בלבד — יידרש דגל(ים)/entitlements + חיווט חיוב כשהמודל ייפתח. Effort **ניתוח**.

---

## טבלת סיכום

| # | פער | Evidence (file:line) | ערך למשתמשת | Effort | טיוטת כותרת טיקט |
|---|---|---|---|---|---|
| G1 | אין זיווג "משלימים" בין עסקים; "similar" = מתחרים | `useProducerData.js:56-68`, `models.py:43,402-412` | גבוה — חשיפה צולבת מגדילה קשר | M | הוספת יחס "משלימים" ידני בין בתי עסק |
| G2 | אין ישות "יום איסוף" רב-עסקית (REKO) | `models.py:678-703,1009-1038` | גבוה — ערוץ גילוי חדש | L | ישות נקודת-איסוף רב-עסקית (REKO) |
| G3 | `FridayDeliveryStrip` = אגרגציית-זמינות, לא איסוף מתוזמן | `FridayDeliveryStrip.jsx:54-60` | בינוני | S (תלוי G2) | רצועת "נקודות איסוף השבוע" |
| G4 | אפס אינסטרומנטציה למשפך גיוס — נטישה לא נמדדת | `analytics.js:12`, `RegisterProducerClient.jsx` (0 events) | **גבוה מאוד** — מדידה חוסמת אופטימיזציה | S/M | אירועי-משפך לגיוס יצרנים |
| G5 | prefill ממלא רק name+phone | `RegisterProducerClient.jsx:185-186`, `models.py:361-367` | בינוני | S | הרחבת prefill מ-OutreachLead |
| G6 | מסלול-עד-חי ארוך ללא מדידת נקודת-תקיעה | `admin.py:462-485` | בינוני | S (תלוי G4) | מדידת drop-off submit→approved |
| G7 | עמוד מתכון = dead-end המרה | `public/RecipeDetail.jsx` (0 CTA) | **גבוה** — דליפת המרה ישירה | S | CTA קשר בעמוד מתכון |
| G8 | עסק ללא ערוץ-קשר → אפס affordance | `PrimaryContactButton.jsx:69-70`, `contact-method.js:38-43` | בינוני | S/M | fallback CTA לעסק ללא קשר |
| G9 | כרטיסי home/list ללא CTA-קשר מהיר | `ProducerCard.jsx:403-413` | נמוך (מול DNA מגזין) | S | action-חוזה בכרטיס עסק |
| G10 | `plan` דורמנטי; אין gating פר-פיצ'ר | `models.py:82`, `upload.py:86`, `upgrade/page.js:41` | ניתוח (חסום MEH-617) | ניתוח | — |
| G11 | אין דגלי-תוכן פרימיום ב-schema | `admin_extra.py:373-374` | ניתוח | ניתוח | — |

---

## Top-5 מדורגים לפי ערך/מאמץ

1. **G4 — אינסטרומנטציה למשפך גיוס** (ערך גבוה מאוד / Effort S-M). מדידה היא תנאי-קדם לכל שיפור המרה בגיוס; היום נטישת-שלב בלתי-נראית לחלוטין (`analytics.js:12` stub, אפס events באשף).
2. **G7 — CTA קשר בעמוד מתכון** (ערך גבוה / Effort S). דליפת המרה ישירה ומאומתת — קורא מתכון ללא שום דרך ליצור קשר (`public/RecipeDetail.jsx`). תיקון זול.
3. **G1 — זיווג "משלימים"** (ערך גבוה / Effort M). ה-"similar" הנוכחי מציג מתחרים; זיווג משלימים ידני יוצר ערוץ חשיפה-צולבת אמיתי בין בתי עסק.
4. **G8 — fallback CTA לעסק ללא ערוץ-קשר** (ערך בינוני / Effort S-M). סוגר dead-end המרה נוסף; יש לאמת אם backend חוסם פרסום ללא קשר (`UNVERIFIED`).
5. **G5 — הרחבת prefill** (ערך בינוני / Effort S). מקטין חיכוך גיוס במסלול outreach ע"י מילוי city/category/instagram/website שכבר קיימים ב-`OutreachLead`.

---

## Side-findings (לא בטווח — לתיעוד בלבד, לא תוקנו)

- **`FridayDeliveryStrip` namespace** — הערת קוד מתעדת באג עבר (`group_buys.friday_delivery` vs `producer.friday_delivery`, PR #1061) שכבר תוקן — `FridayDeliveryStrip.jsx:11-13`. לא פעולה.
- **`UNVERIFIED` — חסימת פרסום ללא ערוץ-קשר.** לא אומת אם ה-backend דורש שדה-קשר לפני `approved`; משפיע על היקף G8. לבדיקה בטיקט G8.
- מחוץ לטווח מפורש (לא נבדק): dashboard UX (MEH-999), producer-detail IA (MEH-1136), correctness (MEH-996/997).

_Closes MEH-1144_
