# מהמקור — Single Source of Truth
> עדכון: אפריל 2026 | קרא תמיד בתחילת כל שיחה

## פרויקט
- **שם:** מהמקור (MEHAMEKOR) | mehamekor.co.il
- **מה זה:** דירקטורי ישראלי של יצרני אוכל בריא + מוצרי טיפוח טבעיים
- **מטאפורה:** "Google Maps של אוכל בריא בישראל"
- **אינסטגרם:** https://www.instagram.com/mehamekor

## Stack
| שכבה | טכנולוגיה |
|------|-----------|
| Frontend | Next.js + Tailwind CSS |
| Backend | FastAPI + Python |
| DB | PostgreSQL + PostGIS |
| תמונות | Cloudinary |
| מפה | Leaflet.js |
| Hosting | Vercel (frontend) + Railway (backend+DB) |
| התראות | Twilio WhatsApp API |
| Auth | JWT + Google OAuth + Apple OAuth |
| Mobile | PWA |

## צבעים (עדכון אפריל 2026)
```
primary:       #2e6853   ירוק כהה — כפתורים, לוגו
primary-dark:  #2E4A2E   hero overlays, footer
secondary:     #4cb08b   הדגשות
background:    #F5F0E8   קרם חם (לא לבן!)
text:          #1C1A17   שחור חם (לא pure black)
accent:        #8B6914   זהב — מחירים, הדגשות
light:         #EAF3DE   badges ירוק בהיר
border:        #e8e0d0   גבולות
```

## פונטים (Google Fonts)
- **Frank Ruhl Libre** — כותרות עברית (h1, h2, h3) — class: `font-headline`
- **Cormorant Garamond** — טקסט אנגלי בלבד — class: `font-english`
- **DM Sans** — גוף טקסט (עברית + אנגלית) — class: `font-body`

## עמודים
| URL | תיאור |
|-----|--------|
| / | Hero + Social Proof Bar + Category Grid + גריד עסקים + עסקים חדשים + Parallax Quote + איך זה עובד + מהמטבח של השכן + אירועים קרובים + CTA |
| /map | Leaflet + גריד מתעדכן + פוקוס דו-כיווני בלחיצה |
| /producer/:id | גלריה + פרטים + משלוחים + מועדפים |
| /producer/dashboard | דשבורד יצרן — זמינות היום, מועדפים, quick links |
| /producer/dashboard/events/new | טופס הוספת אירוע |
| /events | רשימת אירועים, מסננים (עיר/קטגוריה), מאוגרד לפי חודש |
| /events/:id | פרטי אירוע + הרשמה |
| /about | חזון + ערכים + Parallax Quote + סיפור מייסדת + טופס יצירת קשר |
| /terms | תנאי שימוש |
| /admin | אדמין — 7 דפים (ראה docs/ADMIN.md) |

## סוגי משתמשים
| role | שם בממשק | הרשמה |
|------|----------|--------|
| consumer | צרכן | חופשי |
| producer | בית עסק | טופס → אישור אדמין |
| home_producer | שכן מוכר | חופשי, ללא אישור |
| admin | אדמין | ידנית ב-DB |

## עקרונות עיצוב
- RTL עברית ברירת מחדל
- border-radius: 16px בכל מקום
- ללא גרדיאנטים כבדים, ללא צללים חזקים
- תחושת שוק איכרים — חם ואורגני, לא startup
- השראה: gardensweetfarm.com + foraged.com/categories

## Micro-copy קבוע
| מקום | טקסט |
|------|------|
| search | חפשי ירקות טריים, בשר grass-fed... |
| מועדפים ריקים | עדיין לא שמרת עסקים 🌿 |
| אין תוצאות | לא מצאנו עסקים באזור הזה — עדיין 🌱 |
| loading | טוענת עסקים טריים... |
| כפתור הרשמה | הוסף את העסק שלך |
| pending | פרופיל העסק שלך ממתין לאישור 🌿 |

## Endpoints ציבוריים (שיווק)
```
GET  /api/stats       → { producers_count, categories_count }  — Social Proof Bar
GET  /api/cities      → [string]                                 — CitySearch autocomplete
POST /api/newsletter  { email } → 201                            — Footer newsletter
POST /api/contact     { name, email, message } → 200             — /about contact form
```

## Endpoints אירועים
```
GET    /api/events?city=&category=&from_date=&to_date=   — רשימה מסוננת
GET    /api/events/upcoming?limit=3                      — preview בהבית
GET    /api/events/:id                                   — פרטי אירוע
POST   /api/events                                       — יצירה (producer בלבד)
PUT    /api/events/:id                                   — עדכון (הבעלים בלבד)
DELETE /api/events/:id                                   — מחיקה (הבעלים/admin)
```

## Endpoints יצרן (producer-only)
```
GET  /api/producers/me             — פרופיל העסק שלי
PUT  /api/producers/me             — עדכון
POST /api/producers/me/availability — toggle is_available_today
GET  /api/producers/me/dashboard    — סיכום דשבורד
```

## קבצי תיעוד — קרא לפי הצורך
```
docs/DESIGN.md   — עיצוב מפורט: hero, category grid, כרטיסיות, footer
docs/DATA.md     — DB schema + כל ה-API endpoints
docs/ADMIN.md    — ממשק אדמין המלא + בדיקות אוטומטיות
docs/ROADMAP.md  — v1 checklist, v2 פיצ'רים, v3 רעיונות
```

## כלי עיצוב
```bash
npx skills add pbakaus/impeccable
# לאחר שינויים: /audit → /polish homepage → /normalize
```

## לוג עדכונים
- **2026-04-08 · Task 6** — פיצ'ר אירועים:
  - טבלת DB חדשה: `events` (producer_id, title, event_date, event_time, location, category, price, max_participants, registration_url, is_active)
  - `backend/app/routers/events.py` — 6 endpoints: list, upcoming, detail, create, update, delete
  - 6 קטגוריות: סדנה, סיור, שוק, קטיף, טעימות, אחר
  - `frontend/app/events/page.js` — רשימה + מסנני city/category + אגירה לפי חודש
  - `frontend/app/events/[id]/page.js` — פרטי אירוע + breadcrumb + כפתור הרשמה חיצוני
  - `frontend/app/producer/dashboard/events/new/page.js` — טופס יצרן לפרסום אירוע
  - Homepage preview: `UpcomingEventsPreview` קורא ל-/events/upcoming?limit=3 ומציג רק אם יש אירועים
  - Footer: הוספתי קישור /events

- **2026-04-08 · Task 5** — שיפורי UX (היקף מצומצם):
  - `producers.is_available_today` עמודה חדשה (boolean)
  - `POST /producers/me/availability` — toggle זמינות יומית
  - `GET /producers/me/dashboard` — סיכום דשבורד ליצרן
  - `/producer/dashboard` — עמוד חדש: סטטוס זמינות hero + מטריקות מועדפים + quick links
  - ProducerCard: badge "זמין היום" על התמונה
  - home restructure: הוסף "עסקים חדשים" (4 כרטיסיות אחרונות), "אירועים קרובים" preview (משימה 6), CTA sticky
  - Sub-tasks 5a (חיפוש חכם), 5b (עמוד עסק extras), 5c (restructure — חלקי) — נרשמו לגיבוב עתידי ב-ROADMAP

- **2026-04-08 · Task 4** — מפה: פוקוס על עסק בלחיצה (דו-כיווני):
  - MapComponent: `registerApi` callback prop חושף `focusProducer(id)` — מטיס את המפה ופותח popup
  - מעבר מ-`forwardRef` כי `next/dynamic` לא מעביר refs אמין
  - map page: לחיצה על כרטיסייה → גלילה למפה + flyTo + highlight; לחיצה על marker → גלילה לכרטיסייה + highlight
  - ProducerCard: prop חדש `active` (ring-2) + `onClick`

- **2026-04-08 · Task 3** — Google + Apple OAuth:
  - כבר ממומש במלואו — verified קיים ב-backend (`/auth/google`, `/auth/apple`) ובcomponents (`GoogleAuthButton`, `AppleAuthButton`)
  - Wired ב-`app/login/page.js`

- **2026-04-08 · Task 2** — רשימת ערים לחיפוש:
  - `frontend/data/cities.js` — 50 ערים סטטיות
  - `frontend/components/CitySearch.jsx` — dropdown, keyboard nav (Arrow/Enter/Escape), RTL, ניקוי X
  - `GET /api/cities` — union של producer.city + delivery_areas.city, ממוין
  - Wired: map page filter משתמש ב-CitySearch

- **2026-04-08 · Task 1** — עיצוב בוצע מחדש בדיוק לפי DESIGN.md:
  - font classes: `headline` / `body` / `english` (ב-tailwind.config.js)
  - Hero: טקסט ב-bottom 25%, כותרת clamp(42-80px), search pill border-radius 50px
  - Gradient overlay חדש (dark bottom, fade up)
  - Category Grid: emoji 40px, heading 22px, overlay rgba(46,104,83,0.65), hover scale 1.06
  - ProducerCard: image 200px, badges pill (bg-light/text-primary), CTA border-radius 8px, SVG icons 44×44 touch targets, `text-accent` token
  - ParallaxQuote component (משומש בהבית ובאודות)
  - הוספתי useFadeIn hook + `.fade-in-init` ב-globals.css
  - Footer: navigation כולל /events, label ל-newsletter, focus ring
  - /about: הוספתי parallax quote בין story ל-values grid
  - Contact form: labels אמיתיים, focus-visible ring, border-radius 8px
  - site-muted: #5c584f token חדש (מתקן בעיות contrast)

## איך לעדכן מסמך זה
כתבי: `עדכן CLAUDE.md: [תיאור ההחלטה]`
