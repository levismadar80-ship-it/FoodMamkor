# מהמקור — משימות נוכחיות
> קרא CLAUDE.md ו-docs/DESIGN.md לפני שמתחיל

---

## כלל חובה לכל משימה
בסוף כל שינוי — עדכן את CLAUDE.md בסעיף הרלוונטי עם תאריך.
אם אין סעיף מתאים — הוסף סעיף חדש.

---

## משימה 1 — עיצוב (חשוב: קרא בעיון)

קרא את docs/DESIGN.md במלואו לפני שנוגע בקוד.

הבעיה: העיצוב הקודם לא יושם נכון. הפעם יש לבצע **בדיוק** לפי המפרט.

### צעד א — התקן פונטים
ב-`app/layout.js` הוסף:
```html
<link href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;700;900&family=Cormorant+Garamond:wght@400;600&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
```

ב-`tailwind.config.js` הוסף:
```js
fontFamily: {
  headline: ['Frank Ruhl Libre', 'serif'],
  english:  ['Cormorant Garamond', 'serif'],
  body:     ['DM Sans', 'sans-serif'],
}
```

### צעד ב — עדכן צבעים ב-tailwind.config.js
```js
colors: {
  primary:        '#2e6853',
  'primary-dark': '#2E4A2E',
  secondary:      '#4cb08b',
  background:     '#F5F0E8',
  'site-text':    '#1C1A17',
  accent:         '#8B6914',
  light:          '#EAF3DE',
  border:         '#e8e0d0',
}
```

עדכן `globals.css`:
```css
body { background-color: #F5F0E8; color: #1C1A17; font-family: 'DM Sans', sans-serif; }
h1, h2, h3 { font-family: 'Frank Ruhl Libre', serif; }
```

### צעד ג — Hero Section
החלף את ה-Hero הקיים לחלוטין:
```
- גובה: 100vh
- תמונת רקע עם parallax:
  url: https://images.unsplash.com/photo-1542838132-92c53300491e?w=1600
  background-attachment: fixed
  background-size: cover
  background-position: center

- gradient overlay:
  background: linear-gradient(to top, rgba(46,74,46,0.85) 0%, rgba(46,74,46,0.3) 60%, transparent 100%)

- טקסט מרוכז (position: absolute, bottom 30%):
  כותרת: "אוכל אמיתי, ישר מהמקור אליך"
  class: font-headline text-white, font-size: clamp(40px, 6vw, 72px)

  כתובית: "מוצרים מאומתים מיצרנים ישראליים"
  class: font-body text-[#EAF3DE], font-size: 18px, letter-spacing: 0.1em, text-transform: uppercase

- search bar מתחת לטקסט:
  רקע לבן, border-radius: 50px, padding: 12px 20px
  placeholder: "חפשי ירקות טריים, בשר grass-fed..."
  width: min(600px, 90%)

- חץ scroll (animate-bounce) בתחתית
```

### צעד ד — Social Proof Bar
הוסף מיד אחרי ה-Hero:
```jsx
// קרא מ-GET /api/stats
<div style={{background: '#2e6853', color: 'white', padding: '16px', textAlign: 'center'}}>
  <span className="font-body text-lg">
    {stats.producers_count} יצרנים מאומתים · {stats.categories_count} קטגוריות · מכל רחבי הארץ
  </span>
</div>
```

### צעד ה — Category Grid
החלף את שורת הקטגוריות ב-grid מלא:

```jsx
const categories = [
  { name: 'בשר, עוף ודגים', emoji: '🥩', photo: 'photo-1607623814075-e51df1bdc82f' },
  { name: 'ירקות, פירות ומשקים', emoji: '🥬', photo: 'photo-1540420773420-3366772f4999' },
  { name: 'חלב וגבינות', emoji: '🥛', photo: 'photo-1486297678162-eb2a19b0a432' },
  { name: 'לחמים ואפייה', emoji: '🍞', photo: 'photo-1509440159596-0249088772ff' },
  { name: 'שמנים ודבש', emoji: '🫒', photo: 'photo-1474979266404-7eaacbcd87c5' },
  { name: 'טיפוח וסבונים', emoji: '🧴', photo: 'photo-1608248597279-f99d160bfcbc' },
]

// כל כרטיסייה:
// - גובה: 280px, border-radius: 16px
// - תמונה: https://images.unsplash.com/[photo]?w=600&fit=crop
// - overlay: rgba(46,104,83,0.65)
// - hover: overlay → 0.45, transform: scale(1.03), transition: 0.3s
// - טקסט לבן מרוכז, font-family: Frank Ruhl Libre, 22px
// grid: 3 עמודות desktop, 2 tablet, 1 mobile
```

### צעד ו — כרטיסיות עסק
עדכן את ProducerCard:
```
רקע: #F5F0E8
border: 1px solid #e8e0d0
border-radius: 16px
תמונה: height 200px, object-fit: cover, border-radius: 16px 16px 0 0
שם עסק: font-headline, 18px, #1C1A17, font-weight: 700
עיר + קטגוריה: font-body, 13px, #6b6b6b
מחיר: font-body, #8B6914, font-weight: 600
badges: background #EAF3DE, color #2e6853, border-radius: 20px, padding: 2px 8px
כפתור "מידע נוסף": border: 1px solid #2e6853, color: #2e6853, border-radius: 8px
```

### צעד ז — Footer
```
רקע: #2E4A2E | טקסט: #EAF3DE

הוסף אינסטגרם:
<a href="https://www.instagram.com/mehamekor" target="_blank">
  <InstagramIcon /> @mehamekor
</a>

הוסף ניוזלטר:
כותרת: "הישארי מעודכנת"
<input type="email" placeholder="האימייל שלך" />
<button>הצטרפי</button>
→ POST /api/newsletter { email }
→ success: "נרשמת! 🌱"

Backend: הוסף טבלה newsletter_subscribers(id, email, created_at)
         הוסף POST /api/newsletter endpoint
```

### צעד ח — אחרי הכל, הרץ:
```bash
/audit
/polish homepage
/normalize
```

---

## משימה 2 — רשימת ערים לחיפוש

### Frontend
בכל input של "עיר" באתר — הוסף autocomplete עם הרשימה:

```js
// frontend/data/cities.js
export const ISRAEL_CITIES = [
  'ירושלים', 'תל אביב-יפו', 'חיפה', 'ראשון לציון', 'פתח תקווה',
  'אשדוד', 'נתניה', 'באר שבע', 'בני ברק', 'רמת גן',
  'אשקלון', 'רחובות', 'בת ים', 'בית שמש', 'כפר סבא',
  'הרצליה', 'חולון', 'לוד', 'חדרה', 'מודיעין-מכבים-רעות',
  'רמלה', 'נצרת', 'עפולה', 'נהריה', 'טבריה',
  'צפת', 'דימונה', 'אילת', 'קריית גת', 'אום אל-פחם',
  'אופקים', 'יבנה', 'קריית אתא', 'קריית ביאליק', 'קריית מוצקין',
  'קריית ים', 'רהט', 'הוד השרון', 'כפר יונה', 'נס ציונה',
  'קריית שמונה', 'ערד', 'מגדל העמק', 'שדרות', 'טירת כרמל',
  'יקנעם עילית', 'זכרון יעקב', 'עתלית', 'נשר', 'קריית טבעון',
]
```

קומפוננטת CitySearch:
```jsx
// מציגה dropdown עם סינון בזמן אמת
// מינימום 2 תווים לפני שמציג
// כולל כפתור X לנקוי
// RTL, border: #e8e0d0, border-radius: 8px
```

### Backend
הוסף endpoint:
```
GET /api/cities → מחזיר רשימה ייחודית של ערים מה-DB (producers + delivery_areas)
```

---

## משימה 3 — כניסה עם Google + Apple

### Google OAuth
```
ספרייה: next-auth או @react-oauth/google

כפתור:
<button style={{border: '1px solid #e8e0d0', borderRadius: 8, padding: '10px 20px', background: 'white'}}>
  <GoogleIcon /> המשך עם Google
</button>

Flow:
1. לחיצה → Google popup
2. Google מחזיר token
3. POST /auth/google { token } → backend מאמת → מחזיר JWT
4. שמור JWT ב-localStorage
```

### Apple OAuth (חובה ל-App Store)
```
ספרייה: apple-signin-auth

כפתור (חובה לפי Apple guidelines — שחור):
<button style={{background: 'black', color: 'white', borderRadius: 8, padding: '10px 20px'}}>
   המשך עם Apple
</button>

Flow:
1. לחיצה → Apple popup
2. Apple מחזיר identity_token
3. POST /auth/apple { identity_token } → backend מאמת → JWT
4. שמור apple_id בטבלת users
```

### דף Login — סדר הכפתורים
```
[ המשך עם Google  ]   ← לבן עם border
[ המשך עם Apple   ]   ← שחור
─────── או ───────
[ אימייל + סיסמה  ]
```

### Backend endpoints
```python
# POST /auth/google
# מקבל: { token: string }
# מאמת עם Google API
# אם משתמש קיים → מחזיר JWT
# אם חדש → יוצר user עם role=consumer → מחזיר JWT

# POST /auth/apple  
# מקבל: { identity_token: string }
# מאמת עם Apple API
# שומר apple_id בטבלת users
# אם חדש → יוצר user → JWT
```

---

## משימה 4 — מפה: פוקוס על עסק בלחיצה

כשמשתמש לוחץ על כרטיסיית עסק בגריד — המפה מתמקדת בו:

```js
// בקומפוננטת ProducerCard — הוסף onClick:
const handleCardClick = (producer) => {
  // 1. גלול למפה (smooth scroll)
  mapRef.current.scrollIntoView({ behavior: 'smooth' })
  
  // 2. מרכז המפה על העסק עם zoom
  map.flyTo([producer.lat, producer.lng], 14, { duration: 1.2 })
  
  // 3. פתח את ה-popup של הסימן
  markers[producer.id].openPopup()
  
  // 4. הדגש את הכרטיסייה
  setActiveProducer(producer.id)
}

// בכרטיסייה — הוסף ring כשפעיל:
className={`producer-card ${activeProducer === producer.id ? 'ring-2 ring-primary' : ''}`}
```

גם הפוך — לחיצה על סימן במפה → גלול לכרטיסייה המתאימה בגריד + הדגש אותה.

---

## משימה 5 — שיפורי UX (בהשראת Foraged + Farmish)

### א. חיפוש חכם
```
searchbar גלובלי בראש הדף:
  - מחפש בו-זמנית: שם עסק + קטגוריה + מוצר + עיר
  - מציג תוצאות מיידיות בזמן הקלדה (debounce 300ms)
  - 3 עמודות בתוצאות: עסקים | קטגוריות | ערים

מסנן מתקדם (Filters panel):
  - קטגוריה (multi-select checkboxes)
  - עיר משלוח (autocomplete — ראה משימה 2)
  - badges: אורגני / גראס-פד / כשר / ביתי
  - יש משלוח: כן/לא toggle
  - מיון: רלוונטיות | חדש | דירוג | מרחק
```

### ב. עמוד עסק — שיפורים בהשראת Foraged
```
הוסף לעמוד /producer/:id:

1. "מוצרים זמינים עכשיו" — סקציה נפרדת עם תגית "זמין היום"
2. "שעות זמינות" — טבלה פשוטה: יום | שעות | הערות
3. "מכאן הגיעו הלקוחות" — מפה מיני קטנה עם עיגולים של ערי המשלוח
4. "עסקים דומים" — 3 כרטיסיות בתחתית הדף (אותה קטגוריה)
5. כפתור "שתף" — copy link + WhatsApp share
6. breadcrumb: בית > [קטגוריה] > [שם עסק]
```

### ג. דף הבית — מבנה מחדש (בהשראת Foraged)
```
סדר חדש:
1. Hero (100vh)
2. Social Proof Bar
3. Category Grid — 6 קטגוריות, תמונות מלאות
4. "עסקים חדשים" — 4 כרטיסיות אחרונות שנוספו
5. "איך זה עובד" — 3 צעדים (כבר קיים)
6. "מהמטבח של השכן" — עם disclaimer
7. אירועים קרובים — preview 3 אירועים (ראה משימה 6)
8. CTA — "הוסף את העסק שלך"
```

### ד. כרטיסיית עסק — "זמין עכשיו"
```
הוסף שדה is_available_today (boolean) לטבלת producers
אם true → תגית ירוקה "זמין היום" על הכרטיסייה
העסק יכול לעדכן מתוך הפרופיל שלו בקלות
```

### ה. פרופיל עסק — dashboard פשוט
```
/producer/dashboard (רק ל-role=producer):
  - כמה פעמים נלחץ ה-WhatsApp שלי השבוע
  - כמה שמרו אותי למועדפים
  - כפתור "עדכן זמינות היום"
  - כפתור "הוסף אירוע"
```

---

## משימה 6 — אירועים בחוות (/events) — v1

### למה זה חשוב
Farmish ו-Foraged לא עשו את זה טוב. זו הזדמנות ייחודית למהמקור — לחבר קהילה פיזית, לא רק דיגיטלית.

### מבנה הפיצ'ר

**טבלת DB:**
```sql
events (
  id uuid PK,
  producer_id FK,
  title text,
  description text,
  event_date date,
  event_time time,
  location text,        -- כתובת מדויקת או "בחווה שלנו"
  city text,
  lat float, lng float,
  image_url text,
  category: סדנה|סיור|שוק|קטיף|טעימות|אחר,
  price int default 0,  -- 0 = חינם
  max_participants int nullable,
  registration_url text nullable,  -- לינק חיצוני להרשמה (Eventbrite וכו')
  is_active bool default true,
  created_at
)
```

**API endpoints:**
```
GET  /events?city=&category=&from_date=&to_date=   — עמוד /events
GET  /events/upcoming?limit=3                       — preview בדף הבית
GET  /events/:id
POST /events          — רק role=producer
PUT  /events/:id      — רק הבעלים
DELETE /events/:id
```

**עמוד /events:**
```
layout:
  Header: "אירועים בחוות ואצל יצרנים"
  Sub: "סדנאות, סיורים, ימים פתוחים וטעימות — ישר מהמקור"

  מסננים:
    עיר (autocomplete)
    קטגוריה: סדנה | סיור | שוק | קטיף | טעימות
    תאריך: הסבוע | החודש | בחר תאריך

  2 תצוגות (toggle):
    גריד — כרטיסיות אירועים
    לוח שנה — calendar view (חודשי)

כרטיסיית אירוע:
  תמונה עליונה (או תמונת העסק כ-fallback)
  תאריך ושעה — בולט, #2e6853
  שם האירוע — Frank Ruhl Libre
  שם העסק + עיר
  קטגוריה badge
  מחיר — חינם / ₪[מחיר]
  כפתור: "פרטים והרשמה"
```

**Preview בדף הבית (אחרי "מהמטבח של השכן"):**
```jsx
<section>
  <h2>אירועים קרובים 📅</h2>
  // 3 כרטיסיות הכי קרובות
  <a href="/events">לכל האירועים ←</a>
</section>
```

**ממשק יצרן — הוספת אירוע:**
```
טופס פשוט ב /producer/dashboard:
  כותרת | תיאור | תאריך + שעה | עיר | קטגוריה | מחיר | מקסימום משתתפים | לינק הרשמה
  תמונה (Cloudinary)
  כפתור "פרסם אירוע"
```

---

## בסוף כל המשימות

עדכן CLAUDE.md עם:
```
- אושר: ניוזלטר (newsletter_subscribers), POST /api/newsletter
- אושר: Social Proof Bar, GET /api/stats  
- אושר: רשימת ערים (cities.js), GET /api/cities
- אושר: Google OAuth, Apple OAuth
- עדכון עיצוב: Hero parallax, Category Grid, ProducerCard, Footer
- תאריך: [תאריך היום]
```
