# מהמקור — Single Source of Truth
> עדכון: אפריל 2026 | קרא תמיד בתחילת כל שיחה

## פרויקט
- **שם:** מהמקור (MEHAMEKOR) | mehamekor.co.il
- **דומיין פרודקשן:** mehamakor.online (Vercel NS)
- **מה זה:** דירקטורי ישראלי של יצרני אוכל בריא + מוצרי טיפוח טבעיים
- **מטאפורה:** "Google Maps של אוכל בריא בישראל"
- **אינסטגרם:** https://www.instagram.com/mehamekor

## Stack
| שכבה | טכנולוגיה |
|------|-----------|
| Frontend | Next.js + Tailwind CSS |
| Backend | FastAPI + Python |
| DB | PostgreSQL (Railway default — **ללא PostGIS**) |
| חישובי מרחק | Haversine ב-SQL על lat/lng (ראה `backend/app/routers/producers.py`) |
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
| /about | חזון + ערכים + סיפור מייסדת + טופס יצירת קשר |
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

## קבצי תיעוד — קרא לפי הצורך
```
docs/DESIGN.md   — עיצוב מפורט: hero, category grid, כרטיסיות, footer
docs/DATA.md     — DB schema + כל ה-API endpoints
docs/ADMIN.md    — ממשק אדמין המלא + בדיקות אוטומטיות
docs/ROADMAP.md  — v1 checklist, v2 פיצ'רים, v3 רעיונות
DEPLOYMENT.md    — פריסה מלאה ל-Vercel + Railway (step-by-step)
```

## פריסה (Production)
- **Frontend:** Vercel — **Root Directory = `frontend`** (UI setting, לא ניתן להגדיר ב-vercel.json). הקונפיג היחיד ב-`frontend/vercel.json` — framework+headers בלבד, ללא override של Install/Build Command (Vercel מזהה Next.js אוטומטית).
- **Backend:** Railway — **Root Directory ריק** (מ-repo root), Builder: Dockerfile. ה-`Dockerfile` ו-`railway.json` יושבים ב-repo root ומשתמשים ב-`COPY backend/...`
- **Backend URL:** `https://foodmamkor-production.up.railway.app`
- **DB:** Railway PostgreSQL רגיל — **ללא PostGIS**, ללא תוספים ידניים
- **חישובי מרחק:** נוסחת Haversine ישירות ב-SQL (`/producers?lat=&lng=&radius_km=`). מחזיר גם `distance_km` בכל תוצאה.
- **Env vars:** `backend/.env.example` + `frontend/.env.example`
- **חובה:** `BACKEND_URL` ב-Vercel חייב להיות זהה ל-`NEXT_PUBLIC_API_URL` (נצרב ב-build time)
- **Healthcheck:** `/health` (לא `/`) — עצמאי מ-DB, תמיד מחזיר 200 כל עוד uvicorn רץ
- **Google OAuth:** Client ID `591935721343-jjrco2vpmok72to1fm8rq1ss0i2s0cj7.apps.googleusercontent.com` — יש להוסיף `https://mehamakor.online` ל-Authorized Origins
- **Admin seed:** `ADMIN_EMAIL` + `ADMIN_PASSWORD` env vars (seed_data.py). אחרי ה-boot הראשון, לשנות סיסמה ב-/admin ולמחוק `ADMIN_PASSWORD` מ-Railway.

## כלי עיצוב
```bash
npx skills add pbakaus/impeccable
# לאחר שינויים: /audit → /polish homepage → /normalize
```

## איך לעדכן מסמך זה
כתבי: `עדכן CLAUDE.md: [תיאור ההחלטה]`
