# עדכון עיצוב מהמקור — הוראות לביצוע

> קרא CLAUDE.md קודם להבנת הפרויקט המלא.
> מסמך זה מתאר עדכון עיצוב מקיף. בצע לפי הסדר.

---

## לפני שמתחיל

```bash
npx skills add pbakaus/impeccable
```

---

## שלב 1 — פונטים

הוסף ל-`app/layout.js` (או `_document.js`):

```html
<link href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;700;900&family=Cormorant+Garamond:wght@400;600&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
```

שימוש:
- `Frank Ruhl Libre` — כותרות עברית (h1, h2, h3)
- `Cormorant Garamond` — טקסט אנגלי בלבד
- `DM Sans` — גוף טקסט (עברית + אנגלית)

---

## שלב 2 — פלטת צבעים

עדכן `tailwind.config.js`:

```js
colors: {
  primary:      '#2e6853',  // ירוק כהה — כפתורים, לוגו
  'primary-dark': '#2E4A2E', // hero overlays, footer
  secondary:    '#4cb08b',  // ירוק בינוני — הדגשות
  background:   '#F5F0E8',  // קרם חם — לא לבן
  'site-text':  '#1C1A17',  // שחור חם — לא pure black
  accent:       '#8B6914',  // זהב חם — מחירים, הדגשות
  light:        '#EAF3DE',  // ירוק בהיר — badges
  border:       '#e8e0d0',  // גבול חם
}
```

עדכן גם את `globals.css` — `background-color` של `body` ל-`#F5F0E8`.

---

## שלב 3 — Hero Section (דף הבית)

החלף את ה-Hero הקיים:

```
- גובה: 100vh
- תמונת רקע (parallax): https://images.unsplash.com/photo-1542838132-92c53300491e?w=1600
- gradient overlay מלמטה (60%): #2E4A2E opacity 55%
- טקסט במרכז:
    כותרת: "אוכל אמיתי, ישר מהמקור אליך"
    פונט: Frank Ruhl Libre, 64px, לבן
    כתובית: "מוצרים מאומתים מיצרנים ישראליים"
    פונט: DM Sans small-caps, 18px, #EAF3DE
- שורת חיפוש מתחת לטקסט:
    רקע לבן, פינות מעוגלות, אייקון חיפוש
    placeholder: "חפשי ירקות טריים, בשר grass-fed..."
- חץ scroll למטה בתחתית
```

---

## שלב 4 — Social Proof Bar

הוסף בין ה-Hero לגריד הקטגוריות:

```
רקע: #2e6853
טקסט: לבן, DM Sans, מרוכז
תוכן (דינמי מה-DB):
"[X] יצרנים מאומתים  ·  [X] קטגוריות  ·  מכל רחבי הארץ"

Backend: GET /api/stats → { producers_count, categories_count }
```

---

## שלב 5 — Category Grid

החלף את שורת הקטגוריות הקיימת בגריד מלא (השראה: foraged.com/categories):

```
Layout: 3 עמודות desktop | 2 tablet | 1 mobile
כל כרטיסייה:
  - תמונת רקע מלאה (full bleed)
  - overlay: #2e6853 opacity 65%
  - hover: overlay → 45%, scale 1.03
  - טקסט לבן במרכז, Frank Ruhl Libre
  - border-radius: 16px
  - גובה: 280px
```

קטגוריות ותמונות:

| קטגוריה | תמונה |
|----------|--------|
| 🥩 בשר, עוף ודגים | https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=600 |
| 🥬 ירקות, פירות ומשקים | https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600 |
| 🥛 חלב וגבינות | https://images.unsplash.com/photo-1486297678162-eb2a19b0a432?w=600 |
| 🍞 לחמים ואפייה | https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600 |
| 🫒 שמנים ודבש | https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600 |
| 🧴 טיפוח וסבונים | https://images.unsplash.com/photo-1608248597279-f99d160bfcbc?w=600 |

---

## שלב 6 — כרטיסיות עסקים

עדכן את קומפוננטת ProducerCard:

```
רקע: #F5F0E8
border: 1px solid #e8e0d0
border-radius: 16px
תמונה: 55% עליון של הכרטיסייה, רוחב מלא
שם עסק: Frank Ruhl Libre, 18px, #1C1A17
עיר + קטגוריה: DM Sans, 13px, muted
תחתית כרטיסייה:
  - אייקוני קשר: WhatsApp | טלפון | אינסטגרם
  - badges: 🌿 אורגני | 🐄 גראס פד | ✅ מאומת | ✡️ כשר
  - מחיר: צד שמאל, #8B6914 (זהב)
  - כפתור "מידע נוסף": outlined, #2e6853
```

---

## שלב 7 — Micro-copy

החלף את כל הטקסטים הגנריים בכל האתר:

| מיקום | טקסט חדש |
|-------|----------|
| search placeholder | `חפשי ירקות טריים, בשר grass-fed...` |
| מועדפים ריקים | `עדיין לא שמרת עסקים 🌿` |
| אין תוצאות | `לא מצאנו עסקים באזור הזה — עדיין 🌱` |
| loading | `טוענת עסקים טריים...` |
| כפתור הרשמה | `הוסף את העסק שלך` |
| login prompt | `התחברי כדי לשמור מועדפים` |
| מפה ריקה | `אין עסקים באזור המפה הנוכחי` |
| ממתין לאישור | `פרופיל העסק שלך ממתין לאישור 🌿` |

---

## שלב 8 — Footer

עדכן את ה-Footer:

```
רקע: #2E4A2E
טקסט: #EAF3DE

הוסף אינסטגרם (footer בלבד — לא navbar):
  אייקון + "@mehamakor"
  קישור: https://www.instagram.com/mehamakor (new tab)

הוסף ניוזלטר:
  כותרת: "הישארי מעודכנת"
  שדה אימייל + כפתור "הצטרפי"
  POST /api/newsletter → שמירה בטבלה newsletter_subscribers
  הצלחה: "נרשמת! 🌱"
```

Backend — הוסף:
```python
# טבלה חדשה
newsletter_subscribers (id, email, created_at)

# endpoint
POST /api/newsletter  { email } → 201
```

---

## שלב 9 — עמוד /about (הוסף בסוף, אל תמחק תוכן קיים)

### סקציה A — 3 עמודות ערכים
```
רקע: #2e6853
3 עמודות עם SVG line-art לבן:

עמודה 1 — אייקון חממה
כותרת: "המשימה"
טקסט: "ליצור הזדמנויות כלכליות ליצרנים מקומיים
ולחבר קהילות עם היתרונות הבריאותיים,
הסביבתיים והכלכליים של אוכל מקומי."

עמודה 2 — אייקון עצים
כותרת: "קהילה"
טקסט: "כפלטפורמה מונעת ערכים, הקהילה היא
העדיפות הראשונה שלנו.
חיבור בין אנשים הוא המוקד של כל מה שאנחנו עושים."

עמודה 3 — אייקון כלי חווה
כותרת: "למה מהמקור"
טקסט: "מערכות המזון הגלובליות שבירות.
בניגוד לתאגידים גדולים, מקורות מזון מקומיים
יכולים להסתגל ולהתמיד.
אנחנו כאן כדי לחזק אותם."
```

### סקציה B — סיפור המייסדת
```
רקע: #F5F0E8
layout RTL: תמונה מימין | טקסט משמאל

תמונה: placeholder עגול 400x400px, border-radius 16px
(אוסיף תמונה אמיתית מאוחר יותר)

כותרת: "היי, אני ספיר."
פונט: Frank Ruhl Libre, 48px, #1C1A17

גוף טקסט (DM Sans, 18px, line-height 1.8):
"אמא, מחפשת אוכל אמיתי, ובעלת מהמקור.

כמו הרבה משפחות, התחלנו לחפש מקורות
מזון מקומיים ובריאים יותר. וגילינו שזה לוקח
המון צעדים — לשאול בקבוצות ווטסאפ, לגוגל,
לחפש באינסטגרם...

עם כל הטכנולוגיה שיש לנו, זה לא אמור להיות
כל כך מסובך למצוא יצרן טוב בקרבת הבית.
אז מהמקור נולד."
```

### סקציה C — טופס יצירת קשר
```
רקע: #F5F0E8
כותרת: "דברי איתנו" — Frank Ruhl Libre, 36px, מרוכז
תת-כותרת: "שאלות, רעיונות, או סתם שלום — נשמח לשמוע מכם"
DM Sans, 16px, muted, מרוכז

טופס (max-width 600px, מרוכז):
  - שם מלא (required)
  - אימייל (required)
  - איך נוכל לעזור? (textarea, 4 שורות)
  - כפתור "שלח" → POST /api/contact
  הצלחה: "תודה! נחזור אליך בקרוב 🌿"

עיצוב שדות: רקע לבן חם, border #e8e0d0, פינות מעוגלות
כפתור: #2e6853 filled, טקסט לבן
```

Backend — הוסף:
```python
POST /api/contact  { name, email, message } → שלח מייל לאדמין → 200
```

---

## שלב 10 — לאחר כל השינויים, הרץ:

```bash
/audit
/polish homepage
/polish producer-card
/polish about-page
/normalize
/critique
```

---

## שלב 11 — עדכן CLAUDE.md

הוסף לסעיף 2 (עיצוב):

```
### פלטת צבעים מעודכנת (אפריל 2026)
primary:        #2e6853
primary-dark:   #2E4A2E
secondary:      #4cb08b
background:     #F5F0E8
text:           #1C1A17
accent:         #8B6914
light:          #EAF3DE
border:         #e8e0d0

### פונטים
Frank Ruhl Libre  — כותרות עברית
Cormorant Garamond — טקסט אנגלי
DM Sans           — גוף טקסט

### השראת עיצוב
- gardensweetfarm.com (סריף, פרסונל, parallax)
- foraged.com/categories (category grid)

### אינסטגרם
https://www.instagram.com/mehamakor

### Endpoints חדשים
POST /api/newsletter → newsletter_subscribers
POST /api/contact    → מייל לאדמין
GET  /api/stats      → { producers_count, categories_count }
```
