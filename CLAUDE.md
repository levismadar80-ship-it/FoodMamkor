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
- **Frank Ruhl Libre** — כותרות עברית (h1, h2, h3)
- **Cormorant Garamond** — טקסט אנגלי בלבד
- **DM Sans** — גוף טקסט (עברית + אנגלית)

## עמודים
| URL | תיאור |
|-----|--------|
| / | Hero + Social Proof Bar + Category Grid + גריד עסקים + מהמטבח של השכן |
| /map | Leaflet + גריד מתעדכן + 3 מסננים |
| /producer/:id | גלריה + פרטים + משלוחים + מועדפים |
| /events | אירועים וחוויות — סינון לפי סוג/קטגוריה/עיר |
| /events/new | טופס הגשה (אירוע/חוויה/סדנה) → pending → מודרציית אדמין |
| /events/:id | פרטי אירוע + מקומות פנויים + WhatsApp למארגן |
| /about | חזון + ערכים + סיפור מייסדת + טופס יצירת קשר |
| /terms | תנאי שימוש |
| /admin | אדמין — 8 דפים (כולל /admin/events) |

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

## Events & Experiences (v1, אפריל 2026)
- **שני סוגים:** `event` (יצרן — סיורים, ימי שוק) + `experience` (כל אחד — סדנאות, סיורי אוכל)
- **host_type:** `producer` | `community` (נקבע אוטו׳ מתפקיד המשתמש)
- **location_type:** `producer_farm` | `home` | `public`
- **status flow:** `pending` → admin → `approved` / `rejected` / `changes_requested`
- **Moderation:** Claude Haiku pre-flags spam/off-topic + מציע שיפורים. נופל חן אם API key חסר.
- **התראות מייל:** לאדמין בהגשה, להוסט באישור / דחייה / שינויים נדרשים
- **קבצים עיקריים:**
  - `backend/app/models/models.py` — `Event`
  - `backend/app/routers/events.py` — CRUD + הגשה
  - `backend/app/routers/admin_events.py` — מודרציה
  - `backend/app/services/event_moderation.py` — Claude pre-moderation
  - `backend/app/services/event_notifications.py` — מיילים
  - `frontend/app/events/page.js` + `new/` + `[id]/`
  - `frontend/app/admin/events/page.js`
  - `frontend/components/EventCard.jsx`
- **ENV:** `ANTHROPIC_API_KEY` (אופציונלי — אם חסר, המודרציה מוחזרת כ-not_checked)

## קבצי תיעוד — קרא לפי הצורך
```
docs/DESIGN.md          — עיצוב מפורט: hero, category grid, כרטיסיות, footer
docs/DATA.md            — DB schema + כל ה-API endpoints
docs/ADMIN.md           — ממשק אדמין המלא + בדיקות אוטומטיות
docs/ROADMAP.md         — v1 checklist, v2 פיצ'רים, v3 רעיונות
docs/MANUAL_TESTING.md  — רשימת בדיקות ידניות לפני שחרור (mobile/RTL/SMTP/OAuth)
```

## בדיקות
- **Backend:** `TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mehamakor_test python -m pytest tests/ -v`
  - 59 בדיקות (24 API core + 29 events + 6 rating dispatch)
- **E2E:** `npx playwright test` מתוך `tests/test_e2e.spec.ts`
- **Manual:** לפני כל release, עברי על `docs/MANUAL_TESTING.md`

## כלי עיצוב
```bash
npx skills add pbakaus/impeccable
# לאחר שינויים: /audit → /polish homepage → /normalize
```

## איך לעדכן מסמך זה
כתבי: `עדכן CLAUDE.md: [תיאור ההחלטה]`
