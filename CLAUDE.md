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
> ⚠️ כל הקבצים האלה ב-**שורש הריפו**, לא תחת `docs/`. אל תחפש `docs/` — היא לא קיימת.
```
DESIGN.md        — עיצוב מפורט: hero, category grid, כרטיסיות, footer, parallax
DATA.md          — DB schema + כל ה-API endpoints
ADMIN.md         — ממשק אדמין המלא + בדיקות אוטומטיות
ROADMAP.md       — v1 checklist, v2 פיצ'רים, v3 רעיונות
TASKS.md         — משימות פתוחות (לפעמים ב-branch אחר — ראה Git gotchas)
DESIGN_UPDATE.md — מפרט step-by-step של העדכון האחרון
```

## כלי עיצוב
```bash
npx skills add pbakaus/impeccable
# לאחר שינויים: /audit → /polish homepage → /normalize
```

## Dev workflow — הרצה מקומית
הסביבה רצה ב-`docker-compose`. **אין volume mount לקוד של ה-frontend** — ה-Dockerfile עושה `COPY . . && npm run build` בזמן בניית ה-image, ו-`next start` מגיש את ה-`.next/` הקומפל שכבר קיים. משמעות: **כל שינוי בקוד דורש rebuild של ה-image**, לא מספיק `docker-compose restart`.

```bash
# אחרי git pull או שינוי קוד:
docker-compose down
docker-compose build --no-cache frontend   # --no-cache חובה אחרי שינויים גדולים
docker-compose up
```

**אחרי rebuild — נקי את ה-Service Worker:** `next-pwa` רושם SW שממשיך להגיש דפים מ-cache אחרי rebuild. פתח DevTools → Application → Service Workers → Unregister + Storage → Clear site data. או פשוט חלון Incognito.

**Backend migrations:** עמודות חדשות על טבלאות קיימות **חייבות** להתווסף ל-`_migrate_columns()` ב-`backend/app/main.py`. טבלאות חדשות נוצרות אוטומטית ע"י `Base.metadata.create_all()`. אם הוספת עמודה למודל ושכחת את `_migrate_columns` — ה-DB הקיים לא ישתנה והשדה ייראה null בכל query.

## גוצ'יות ומלכודות — שוו עליכם זמן

### Next.js
- **`next/dynamic` לא מעביר refs אמין.** אל תנסה `forwardRef` דרך dynamic import — השתמש ב-callback prop (`registerApi`) כמו ב-`MapComponent.jsx`.
- **Leaflet חייב `{ ssr: false }`** כי הוא ניגש ל-`window` ב-import. תמיד לטעון דרך `dynamic(() => import("@/components/MapComponent"), { ssr: false })`.
- **`<Image>` דורש host ב-`remotePatterns`** ב-`next.config.js`. כרגע מותרים: `res.cloudinary.com`, `images.unsplash.com`. הוספת host = rebuild.
- **CSS `background-image` עוקף את הבדיקה** — לא צריך להכניס ל-`remotePatterns`. ככה ה-hero parallax והכרטיסיות של הקטגוריות עובדות.
- **`placehold.co` מחזיר `image/svg+xml`** — `<Image>` חוסם אלא אם `dangerouslyAllowSVG: true`. **אל תשתמש ב-placehold.co**. במקום זה, fallback מקומי עם div מעוצב (ראה `ProducerCard.jsx` ו-`HomeProductCard.jsx`).
- **`font-variant: small-caps` לא עובד על עברית.** small-caps חל רק על אותיות לטיניות. עבור כתוביות עבריות בסגנון uppercase — השתמש ב-`letter-spacing` ובחירת משקל, לא small-caps.

### Git / branches
- **TASKS.md ו-DESIGN.md מעודכן היו ב-commit נפרד בלא-branch שלי** (`66daa5a` ב-`claude/review-document-HlIVP`). כשמחפשים תוכן ש"אמור להיות שם" — `git fetch --all` ואז `git show <hash>:<path>`. לא להניח שהכל בbranch הנוכחי.

### עיצוב
- **אל תשתמש ב-opacity על טקסט** (`text-site-text/60`, `/70`, `/80`) על רקע `#F5F0E8` — זה נופל מתחת 4.5:1 של WCAG AA. **השתמש ב-`text-site-muted` (`#5c584f`)** שנותן ~5.5:1.
- **שתי מערכות tokens של טקסט קיימות במקביל:**
  - קנוני (חדש): `text-site-text`, `text-site-muted`
  - legacy (עדיין בקוד של admin/settings): `text-text-primary`, `text-text-secondary`
  - **תמיד עדיף לכתוב חדש, כשעורכים קובץ legacy — מגרים בהזדמנות**.
- **font classes קנוניים:** `font-headline` / `font-body` / `font-english`. ה-aliases `font-serif` / `font-sans` נשארו לתאימות אחורה — אל תכתוב אותם בקוד חדש.

## חוקים שאסור לשבור (Invariants)

### Accessibility
1. **כל `<input>` / `<textarea>` חייב `<label htmlFor>`**, גם אם הוא `sr-only`. placeholder לבד הוא WCAG fail.
2. **אל תכתוב `outline-none` בלי `focus-visible:ring-2`** מייד אחריו. זה חוסם keyboard users.
3. **Touch targets ≥ 44×44px** לכל דבר לחיץ במובייל. ב-`ProducerCard` זה נפתר ע"י עטיפת האייקונים ב-`w-11 h-11 flex items-center justify-center`.
4. **לינקים/כפתורים עם אייקון בלבד חייבים `aria-label`**. emoji זה לא שם נגיש — `aria-label="שלח הודעה בווטסאפ"` כן.
5. **SVG דקורטיבי → `aria-hidden="true"`**. SVG משמעותי → `role="img"` ו-`aria-label`.
6. **הודעות סטטוס (success/error) → `role="status" aria-live="polite"`**. אחרת screen readers לא מכריזים.

### Tokens / theming
7. **לא לכתוב inline hex ב-`style={{ ... }}`** כשיש token. אם צריך עם opacity — `bg-primary/60` או להגדיר token חדש.
8. **`border-radius: 16px`** הוא ברירת המחדל. 8px לכפתורים ושדות input. 50px ל-pill search. 20px ל-badges. אחרים — לא.

## Anti-patterns — אל תחזור על זה
זה מה ש-`/audit` תפס. **אל תיצור מחדש**:
- **גריד של N כרטיסיות זהות** (icon + heading + text × N). ה-category grid כבר חוטא בזה — אל תוסיף גרידים כאלה.
- **למרכז הכל** בעמוד. מרכוז שמור ל-Hero ול-CTA. שאר הסקציות — left-aligned (ב-RTL = right-aligned).
- **`animate-bounce`** — bounce easing תאריך. fade-up עם `ease-out` תמיד עדיף.
- **cards מקוננים** (card בתוך card בתוך section). שטח את ההיררכיה.
- **כל כפתור `bg-primary`.** כפתורי פעולה ראשיים = primary. כפתורים משניים = ghost/outlined. ניוזלטר = secondary.

## מצב חלקי / stubs ידועים
דברים שמומשו חלקית ומחכים לתשומת לב:
- **`whatsapp_clicks_week`** בדשבורד היצרן מוחזר כ-`0` קבוע. אין טבלת tracking ל-clicks על yבעל עסק (רק על home_products). צריך להוסיף טבלה `producer_whatsapp_clicks` לפני שהמספר באמת יזוז.
- **חיפוש חכם (Task 5a)** — כרגע ה-hero search מעביר את ה-query כ-`delivery_city`. זה hack. בפועל צריך חיפוש חוצה-שדות (שם עסק + קטגוריה + עיר + מוצר) עם debounce 300ms.
- **עמוד /producer/:id extras (Task 5b)** — "שעות זמינות", "מפה מיני", "עסקים דומים", כפתור שיתוף, breadcrumb — לא נבנו.
- **Calendar view ל-/events** — רק grid. אין toggle ל-calendar view חודשי.
- **תמונת המייסדת ב-/about** — placeholder עם אמוג'י 🌿 ב-div. TODO: תמונה אמיתית של ספיר.
- **`whatsapp_clicks_week`, smart search, producer page extras** — מופיעים גם ב-ROADMAP.md תחת "scoped later".

## מתכונים למשימות נפוצות

### הוספת קטגוריית אירוע חדשה
שלושה מקומות לעדכן (לא תשכח אף אחד):
1. `backend/app/routers/events.py` → `VALID_CATEGORIES` set
2. `frontend/app/events/page.js` → `CATEGORIES` array
3. `frontend/app/producer/dashboard/events/new/page.js` → `CATEGORIES` array

### הוספת עמודה לטבלה קיימת
1. הוסף ל-`backend/app/models/models.py`
2. **הוסף שורה ל-`_migrate_columns()` ב-`backend/app/main.py`** — אחרת DB קיים לא יקבל את השדה
3. הוסף ל-schema ב-`backend/app/schemas/schemas.py` (ListOut + DetailOut + Update)
4. rebuild של ה-backend container

### הוספת host תמונות חדש
1. `frontend/next.config.js` → `images.remotePatterns`
2. rebuild של ה-frontend container (`--no-cache`)

### בדיקה אם משהו כבר קיים לפני שבונים מחדש
Task 3 (Google/Apple OAuth) כבר היה בנוי ב-100%. בזבזתי כמה דקות עד שגיליתי. **תמיד `grep` לשם הקומפוננטה/endpoint לפני שמתחילים**:
```bash
grep -rn "GoogleAuth\|apple_auth" backend/ frontend/
```

## לוג עדכונים
- **2026-04-08 · Meta** — תיעוד מה שלמדנו בסשן הזה:
  - הוספתי סעיפי Dev workflow, Gotchas, Invariants, Anti-patterns, Stubs, מתכונים
  - תיקנתי את הפניות `docs/*` → שורש הריפו (הספרייה לא קיימת)
  - תיעדתי את מלכודת ה-Docker build ללא volume mount (בזבז זמן היום)
  - תיעדתי את הבעיה של `next/dynamic` + forwardRef (פתרון: `registerApi` callback)
  - תיעדתי את בעיית `placehold.co` (מחזיר SVG, חסום ע"י Next.js)
  - תיעדתי את בעיית opacity על טקסט (`text-site-text/60` נופל WCAG AA) + הפתרון `text-site-muted`
  - רשמתי stubs ידועים כדי שסשן הבא ידע מה לא אמיתי

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
