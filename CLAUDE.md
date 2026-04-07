# מהמקור — מסמך חי (Single Source of Truth)
> עדכון אחרון: אפריל 2026
> מסמך זה נקרא אוטומטית בכל שיחת Claude Code — אל תמחק אותו

---

## 1. חזון ושם

**שם:** מהמקור (MEHAMEKOR)
**סלוגן:** ישר מהמקור אליך
**דומיין:** mehamekor.co.il (טרם נרכש — לאחר בדיקות)
**תיאור:** פלטפורמה ישראלית שמחברת בין יצרני אוכל בריא ומוצרי טיפוח טבעיים לבין צרכנים — דירקטורי חי עם מפה אינטראקטיבית.
**מטאפורה:** "Google Maps של אוכל בריא בישראל"
**ייחוד:** אין מתחרה קיים בישראל

---

## 2. עיצוב ולוגו

**השראה:** chai-bria.co.il
**סגנון:** חם ואורגני — תחושת שוק איכרים, לא startup טכנולוגי

### פלטת צבעים (מהלוגו)
```
primary:    #2e6853  — ירוק כהה (כפתורים, navbar, לוגו)
secondary:  #4cb08b  — ירוק בינוני (הדגשות)
background: #eaf4ee  — רקע בהיר ירקרק
accent:     #c9e2d3  — אקסנט עדין
white:      #ffffff  — לבן נקי לכרטיסיות
text:       #1c1c1c  — טקסט ראשי
text-muted: #6b6b6b  — טקסט משני
border:     #e8e0d0  — גבולות
```

### עקרונות עיצוב
- מינימליסטי ונקי — הרבה מרווח לבן
- פינות מעוגלות: border-radius 12px
- ללא גרדיאנטים, ללא צללים כבדים
- RTL עברית כברירת מחדל
- Hero גדול בדף הבית עם תמונת אוכל אמיתי

### לוגו
- סל קניות עם לחם וגזר (קו outline)
- טקסט: MEHA (סריף עדין) + MEKOR (בולד)
- צבע: #2e6853 על רקע לבן (לאתר)
- גרסה שנייה: על רקע #eaf4ee (לאינסטגרם/מצגות)
- favicon: רק הסל ללא טקסט

### כלי עיצוב — Impeccable
```bash
npx skills add pbakaus/impeccable
```
פקודות לשימוש: /audit, /polish, /critique, /normalize, /animate

---

## 3. מבנה עמודים

| עמוד | URL | תיאור |
|------|-----|--------|
| דף בית | / | Hero + גריד עסקים + מהמטבח של השכן |
| מפה | /map | Leaflet + סינון |
| עסק | /producer/:id | פרטים מלאים + משלוחים |
| חזון | /about | סיפור + ערכים + קריטריונים |
| מתכונים | /recipes | גרסה 2 |
| תנאי שימוש | /terms | חובה לפני השקה |
| אדמין | /admin | רק role=admin |

### דף הבית — מבנה
1. Hero גדול + כותרת + שורת חיפוש
2. שורת קטגוריות (scroll אופקי)
3. 3 מסננים: קטגוריה / עיר / יש משלוחים
4. גריד עסקים — 8 ראשונים + כפתור "הצג עוד"
5. סקציית "מהמטבח של השכן" מתחת לגריד

### כרטיסיית עסק
- תמונה גדולה בחלק העליון
- שם עסק בולד וגדול
- עיר + קטגוריה
- אייקוני קשר: ווטסאפ, טלפון, אינסטגרם
- כפתור "מידע נוסף"
- תגית "מאומת" / "ביתי"

### עמוד עסק /producer/:id
- גלריה תמונות (carousel)
- שם + תגית מאומת אם is_verified=true
- תיאור מלא
- תגיות קטגוריות
- כפתורי קשר: טלפון / ווטסאפ / אינסטגרם / אתר
- טבלת משלוחים: עיר | יום | מינימום הזמנה
- רשימת מוצרים (אם קיים)
- לב לשמירת מועדפים (למחוברים בלבד)

### מפה /map
- מפה Leaflet + גריד עסקים מתחת
- כשמזיזים המפה → הגריד מתעדכן
- 3 מסננים: קטגוריה / עיר משלוח / מאומת

### דף חזון /about
- Hero: "אוכל אמיתי, ישר מהמקור אליך"
- סיפור: למה מהמקור נוצר
- 4 ערכי כרטיסיות: 🌿 ללא מעובד | 🥩 חומרי גלם מזוהים | 🏡 ייצור קטן | 🌱 טרי ואמיתי
- קריטריוני הכניסה
- CTA: "הוסף את העסק שלך" + "מצא עסקים קרובים"

---

## 4. קטגוריות

### קטגוריה א — בשר, עוף ודגים
🥩 בשר בקר (כולל grass-fed) | 🐔 עוף חופש | 🐟 דגים טריים

### קטגוריה ב — ירקות, פירות ומשקים
🥬 ירקות אורגניים | 🍓 פירות | 🥤 מיצים ומשקאות טבעיים

### קטגוריה ג — כל השאר
🥛 חלב וגבינות | 🍞 לחמים ואפייה | 🫒 שמנים ודבש | 🥒 מותססים וכבושים | 🫙 מוצרים מוכנים | 🌿 צמחי מרפא | 🧴 סבונים וטיפוח | 🕯️ נרות וארומה

---

## 5. סוגי משתמשים

| סוג | role | הרשמה | יכולות |
|-----|------|--------|---------|
| צרכן | consumer | חופשי | חיפוש, מועדפים, דירוג |
| בית עסק | producer | טופס → אישור אדמין | ניהול פרופיל, מוצרים, משלוחים |
| שכן מוכר | home_producer | חופשי — ללא אישור | פרסום מוצרים ביתיים |
| אדמין | admin | ידנית ב-DB | אישור/דחייה, ניהול מלא |

### שינויי שמות בממשק
- "יצרני מזון" → "בתי עסק"
- "יצרן" → "בית עסק"
- כפתור הרשמה: "הוסף את העסק שלך"
- "home_producer" → "שכן מוכר"

---

## 6. מהמטבח של השכן

סקציה נפרדת בדף הבית — מתחת לגריד העסקים המאומתים

### פרטי מוצר ביתי
- כותרת (למשל "כרוב כבוש ביתי")
- תמונה
- כמות זמינה
- מחיר (או "במתנה" / "בהחלפה")
- שכונה/עיר (לא כתובת מדויקת)
- תוקף עד (תאריך)

### קשר בין קונה למוכר
- WhatsApp redirect בלבד — כפתור פותח ווטסאפ עם מספר המוכר
- אין צ'אט in-app
- הם מסכמים על מחיר ומשלוח לבד

### מערכת דירוג (כמו Airbnb)
- 24 שעות אחרי לחיצת ווטסאפ → הודעה אוטומטית לקונה דרך Twilio
- הודעה: "היי! קנית מ[שם]? איך היה? דרגי כאן 👇 [לינק]"
- דף דירוג: 1-5 כוכבים + תגובה עד 100 תווים
- תצוגה: "⭐ 4.8 (12 דירוגים)" + 3 תגובות אחרונות
- מתחת 3 כוכבים → תגית אזהרה צהובה
- 3 ביקורות שליליות → הסתרה אוטומטית + התראה לאדמין

### disclaimer חובה
"האחריות על המוצר היא של המוכר בלבד"

---

## 7. DB Schema

```sql
-- עסקים
producers (
  id uuid PK,
  name, description, city,
  lat float, lng float,
  phone, instagram, website,
  status: pending|approved|rejected,
  images text[],
  is_verified bool,
  created_at
)

-- משתמשים
users (
  id uuid PK,
  email unique, name, password_hash,
  city,
  role: consumer|producer|admin,
  producer_id FK nullable,
  created_at
)

-- קטגוריות
categories (id, name, emoji)
producer_categories (producer_id FK, category_id FK)

-- מוצרים
products (id, producer_id FK, name, description, price_range)

-- משלוחים
delivery_areas (
  id, producer_id FK,
  city text,
  min_order int,
  delivery_day text
)

-- מועדפים
favorites (
  user_id FK, producer_id FK,
  PRIMARY KEY (user_id, producer_id),
  created_at
)

-- מוצרים ביתיים
home_listings (
  id uuid PK,
  user_id FK,
  title, description, photo_url,
  quantity, price, neighborhood,
  available_until date,
  is_active bool,
  created_at
)

-- דירוגים
ratings (
  id uuid PK,
  from_user_id FK,
  to_user_id FK,
  listing_id FK,
  stars int (1-5),
  comment text (max 100),
  created_at
)

-- מתכונים (גרסה 2)
recipes (
  id, title, description,
  steps json,
  category_id FK,
  submitted_by FK,
  status: pending|approved|rejected,
  created_at
)

recipe_ingredients (
  id, recipe_id FK,
  ingredient_name,
  producer_id FK nullable,
  notes
)
```

---

## 8. API Endpoints

```
# עסקים
GET  /producers?lat=&lng=&radius_km=&category=&delivery_city=&verified=
GET  /producers/:id
POST /producers
GET  /categories

# אימות
POST /auth/register          — צרכן רגיל
POST /auth/register/producer — טופס מלא (multi-step)
POST /auth/login             — מחזיר JWT
POST /auth/apple             — Sign in with Apple
DELETE /users/me             — מחיקת חשבון (Apple App Store חובה)

# מועדפים
GET    /users/me/favorites
POST   /users/me/favorites/:id
DELETE /users/me/favorites/:id

# ניהול עסק
GET  /producers/me
PUT  /producers/me
POST /producers/me/images

# אדמין (role=admin בלבד)
GET  /admin/producers/pending
POST /admin/producers/:id/approve
POST /admin/producers/:id/reject

# מהמטבח של השכן
GET  /home-listings?city=&category=
POST /home-listings
GET  /home-listings/:id
DELETE /home-listings/:id

# דירוגים
POST /ratings
GET  /ratings/listing/:id

# מתכונים (גרסה 2)
GET  /recipes?category=
GET  /recipes/:id
POST /recipes
```

---

## 9. טכנולוגיה

| שכבה | טכנולוגיה | הערות |
|------|-----------|-------|
| Frontend | Next.js + Tailwind CSS | מיגרציה הדרגתית מ-React |
| Backend | FastAPI + Python | נשאר |
| Database | PostgreSQL + PostGIS | שאילתות מרחק |
| תמונות | Cloudinary | אופטימיזציה + CDN |
| מפה | Leaflet.js | חינמי |
| Hosting | Vercel (frontend) + Railway (backend+DB) | |
| התראות | Twilio WhatsApp API | לאדמין + דירוגים |
| אימות | JWT + Google OAuth + Apple OAuth | אימייל+סיסמה + גוגל + אפל |
| Mobile | PWA | התקנה + push notifications |
| שפה | עברית RTL בלבד | EN → גרסה 2 |

### מיגרציה לNext.js
- הדרגתי — לא rewrite מלא
- יש 11 routes קיימים — לשמור
- להתחיל מעמודי עסקים — הכי חשוב לSEO

---

## 10. SEO

- כל עמוד עסק = SSR עם meta tags ייחודיים
- title: "[שם עסק] - [עיר] | מהמקור"
- description: תיאור העסק
- sitemap.xml אוטומטי עם כל העסקים
- schema.org לעסקים מקומיים

---

## 11. התראות למנהלת

**כשיצרן נרשם:**
```
POST /auth/register/producer →
  WhatsApp לטלפון האדמין (Twilio):
  "עסק חדש מבקש אישור: [שם] - [עיר] - [קטגוריה]
   לאישור: mehamekor.co.il/admin"
  + מייל לאדמין
```

**כשיש דיווח על עסק:**
- 3 דיווחים → התראה אוטומטית לאדמין

**אימות תקופתי:**
- מייל אוטומטי כל 3 חודשים: "האם פרטיך עדיין נכונים?"
- 6 חודשים ללא תגובה → status = inactive

---

## 12. Freemium

| תוכנית | מחיר | תמונות | מוצרים | סטטיסטיקות |
|--------|------|--------|---------|-------------|
| חינם | ₪0 | עד 3 | לא | לא |
| פרמיום | TBD | ללא הגבלה | כן | כן |

---

## 12.5 Apple App Store — דרישות חובה (עדכון אפריל 2026)

### מחיקת חשבון
- כפתור "מחק חשבון" בהגדרות המשתמש
- `DELETE /users/me` — מוחק: נתוני משתמש, מועדפים, מוצרים ביתיים, דירוגים
- דיאלוג אישור לפני מחיקה
- מייל אישור לאחר מחיקה
- עמידה בדרישות Apple App Store Guidelines 5.1.1(v)

### Sign in with Apple
- כפתור "המשך עם Apple" (שחור, טקסט לבן) — מתחת לכפתור Google
- `POST /auth/apple` — מקבל identity token מ-Apple, מאמת, יוצר/מחבר משתמש
- חובה אם מציעים Sign in with Google (App Store Guidelines 4.8)
- שמירת `apple_id` בטבלת users

---

## 13. בעיות ידועות ופתרונות

### קריטי — בטיחות מזון
- **בעיה:** קונה מ"מהמטבח של השכן" ומורעל
- **פתרון:** הצהרה בהרשמה + disclaimer על כל מוצר + תנאי שימוש

### קריטי — עסקים מתחזים
- **בעיה:** עסק מצהיר "טבעי" אבל משתמש בתוספים
- **פתרון:** שאלון מפורט בהרשמה + כפתור דיווח + 3 דיווחים = בדיקה

### בינוני — עסקים לא מעדכנים
- **פתרון:** מייל כל 3 חודשים, 6 חודשים = inactive

### בינוני — ספאם בצ'אט
- **פתרון:** כפתור דיווח, 3 דיווחים = חסימה

---

## 14. תנאי שימוש (טיוטה לדף /terms)

1. **מהות השירות** — מהמקור מחברת בין יצרנים לצרכנים. אינה מוכרת מוצרים.
2. **אחריות מוצרים** — האחריות על כל מוצר היא של המוכר בלבד.
3. **מהמטבח של השכן** — מוצרים ביתיים באחריות המוכר. הקונה רוכש על אחריותו.
4. **עסקים מאומתים** — תגית "מאומת" = בדיקה ראשונית. לא ערובה לכל רכישה.
5. **דיווח** — כפתור דיווח בכל עמוד, טיפול תוך 48 שעות.
6. **פרטיות** — מידע לצרכי הפלטפורמה בלבד. אין מכירה לצדדים שלישיים.

---

## 15. גרסה 1 — MVP (לשחרר עכשיו)

### נכנס ב-v1
- [x] דף בית: Hero + גריד + מהמטבח של השכן
- [x] מפה Leaflet
- [x] עמוד עסק מלא
- [x] הרשמת צרכן + Google OAuth
- [x] הרשמת בית עסק (multi-step, ממתין לאישור)
- [x] אדמין + התראות ווטסאפ
- [x] מועדפים
- [x] PWA
- [x] תנאי שימוש /terms
- [x] Freemium (3 תמונות חינם)
- [x] מערכת דירוג דרך ווטסאפ
- [x] דף חזון /about
- [x] SEO עם Next.js
- [x] Sign in with Apple (חובה ל-App Store)
- [x] מחיקת חשבון DELETE /users/me (חובה ל-App Store)
- [x] **URL מותאם אישית לעסק** — `mehamekor.co.il/[slug]` + כפתור שיתוף ✓
- [x] **Top product + מחיר התחלתי** בכרטיסיית עסק ובפופאפ של המפה ✓
- [x] **סקציית "איך זה עובד?"** בדף הבית (3 שלבים: מצא / צור קשר / קנה) ✓
- [x] **Bottom Navigation למובייל** — 4 טאבים: גלה / פרסם / מועדפים / הודעות ✓

### נדחה ל-v2
- [ ] מתכונים
- [ ] EN/עב toggle (אם לא קיים כבר)
- [ ] ביקורות לעסקים מאומתים
- [ ] בוט Claude

---

## 16. גרסה 2

- [ ] ביקורות ודירוגים על עסקים מאומתים
- [ ] עסקים ש"אחרים שמרו"
- [ ] בוט Claude לשאלות תזונה
- [ ] מתכונים (הגשה ממשתמשים → אישור אדמין)
- [ ] EN/עב toggle עם i18next
- [ ] אפליקציה נייטיבית React Native
- [ ] ניוזלטר שבועי
- [ ] מאמתים מתנדבים מהקהילה
- [ ] השוואת מחירים (גישה ידנית קודם, אוטומטית אחר כך)
- [ ] Freemium עם סליקת אשראי
- [ ] API פתוח לעסקים

### v2 — בהשראת פלטפורמות גלובליות (Farmish/Foraged) — אפריל 2026

- [ ] **CSA — מנוי קופסת ירקות שבועית** — בית עסק יכול להציע מנוי קבוע (שבועי/דו-שבועי), קונה משלם מראש ומקבל קופסה כל שבוע. מודל הכנסה חוזרת ליצרן, ביטחון אספקה לקונה.
- [ ] **לוח אירועים בחווה** — Farm Events Calendar: סיורי חווה, ימי פתוחים, סדנאות, קטיף עצמי. כל בית עסק יוצר אירועים, צרכנים נרשמים דרך הפלטפורמה. עמוד `/events` עם פילטר אזור/תאריך.
- [ ] **עוקבים לבית עסק** — Producer Followers: צרכן יכול לעקוב אחרי בית עסק ולקבל עדכונים (התראת PWA / מייל) כשיש מוצר חדש או אירוע. בונה קהילה סביב כל בית עסק. טבלה `producer_followers (user_id, producer_id, created_at)`.
- [ ] **שגרירי קהילה** — Community Ambassadors: משתמשים פעילים שעוזרים לאמת בתי עסק חדשים באזורם, מקבלים תג ייחודי, גישה לדאשבורד מאמתים, ועדיפות בהמלצות. role חדש: `ambassador`.
- [ ] **קודי קופון לבתי עסק** — Coupon Codes: בית עסק יכול ליצור קודי הנחה (% או ₪), הצרכן רואה אותם בעמוד העסק, לחיצה מעתיקה את הקוד ופותחת ווטסאפ. טבלה `coupons (id, producer_id, code, discount_type, discount_value, valid_until, max_uses)`.

---

## 17. גרסה 3+ (רעיונות עתידיים)

- שוק שבועי וירטואלי — "יום שוק" עם מבצעים
- קהילות לפי אזור
- תיבת ירקות שבועית — מנוי קבוע
- שיתוף עם מסעדות ושפים
- הרחבה לחו"ל

---

## 18. תוכנית בדיקות לפני דומיין

### לפני שקונים דומיין — חובה לעבור:
- [ ] שלב 0: Docker + localhost עובד
- [ ] שלב 1: דף הבית — עיצוב + מסננים
- [ ] שלב 2: עמוד עסק
- [ ] שלב 3: הרשמה + Google OAuth
- [ ] שלב 4: הרשמת בית עסק + התראות
- [ ] שלב 5: פאנל אדמין
- [ ] שלב 6: מהמטבח של השכן + דירוג
- [ ] שלב 7: מועדפים
- [ ] שלב 8: מפה
- [ ] שלב 9: תנאי שימוש
- [ ] שלב 10: Freemium
- [ ] שלב 11: ביצועים + אבטחה + מובייל
- [ ] שלב 12: SEO
- [ ] שלב 13: 5+ אנשים ניסו + 3 יצרנים ניסו להירשם

---

## 19. סקריפטים שימושיים

### scraper מחירים (גרסה 2)
```
scripts/price_scraper.py
- סורק מחירים מאתרי יצרנים
- שומר ל /data/prices.json
- מוצרים: בשר בקר/קג, ביצים/תריסר, חלב/ליטר, לחם/כיכר
- מריץ ידנית בהתחלה
```

---

## 20. איך לעדכן מסמך זה

כשיש החלטה חדשה, כתבי:
```
עדכן CLAUDE.md: [תיאור ההחלטה]
```
Claude Code יוסיף לסעיף הרלוונטי עם תאריך.

---

## 21. ממשק אדמין מלא (אפריל 2026)

הממשק חי תחת `/admin` עם sidebar קבוע (`frontend/app/admin/layout.js`) ומורכב מ-7 דפים:

| דף | URL | תפקיד |
|----|-----|--------|
| לוח מחוונים | `/admin` | 4 stat cards, גרף 6 חודשים, מפה מיני, פעילות אחרונה, התראות |
| בתי עסק | `/admin/producers` | טבלה + חיפוש + ייבוא/ייצוא Excel + אישור מהיר |
| משתמשים | `/admin/users` | חיפוש, שינוי תפקיד, חסימה, מועדפים |
| תוכן | `/admin/content` | קטגוריות CRUD, מוצרים ביתיים מוסתרים, עורך about/terms |
| דיווחים | `/admin/reports` | דיווחים ממוינים לפי דחיפות + פעולות |
| אנליטיקס | `/admin/analytics` | גרף קו דו-סדרתי, קטגוריות, ערים, top producers, heat map |
| הגדרות | `/admin/settings` | אימייל/ווטסאפ אדמין, freemium, בדיקת twilio/cloudinary |

### Backend
- `backend/app/routers/admin_extra.py` — endpoints חדשים: `/admin/users`, `/admin/categories`, `/admin/pages/{slug}`, `/admin/analytics`, `/admin/settings`, `/admin/dashboard`
- מודלים חדשים: `AdminSetting (key, value)`, `StaticPage (slug, title, body)`, שדה `users.is_blocked`
- Login דוחה משתמש חסום עם 403

### בדיקות אוטומטיות
- `tests/test_api.py` — 24 בדיקות pytest המכסות auth, producers, מסננים, admin guard ו-admin flows
- `tests/test_e2e.spec.ts` — Playwright spec לדפי public + admin guard
- `tests/conftest.py` — fixture עם DB מבודד (`mehamakor_test`) + factories
- `tests/README.md` — איך להריץ
- הרצה: `pytest tests/test_api.py` (24/24 passing) ו-`npx playwright test`
