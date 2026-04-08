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

## Terminology — "יצרן" הוסר מ-UI
- ב-**UI טקסטים בעברית**: תמיד "בית עסק / בתי עסק" או "בעלת עסק" (נקבה) — לא "יצרן"/"יצרנים"/"יצרנית".
- ב-**DB/API/variable names** (producer, producers, /producers endpoints, ProducerCard קומפוננטה): **נשאר כמו שהוא** — אל תיגעי בשמות המשתנים, נתיבי ה-API, או שמות הטבלאות.
- כלל אצבע: שנה רק את מה שמשתמש רואה בדפדפן. קוד ו-schema נשארים.

## Micro-copy קבוע (מגדר נקבה בלבד)
| מקום | טקסט |
|------|------|
| search | חפשי ירקות טריים, בשר grass-fed... |
| hero subtitle | בתי עסק מקומיים, מגדלים קטנים ושכנות שמבשלות בבית |
| מועדפים ריקים | עדיין לא שמרת עסקים 🌿 |
| אין תוצאות | לא מצאנו עסקים באזור הזה — עדיין 🌱 |
| loading | טוענת עסקים טריים... |
| loading producer detail | טוענת... |
| error fallback | משהו השתבש, נסי שוב |
| CTA ראשי — הוסף עסק | הוסיפי את העסק שלך 🌿 |
| CTA הרשמה | הצטרפי לקהילה |
| CTA מפה | גלי עסקים קרובים |
| CTA "show more" | עוד בתי עסק |
| back button | ← חזרה |
| submit form | שלחי |
| pending | פרופיל העסק שלך ממתין לאישור 🌿 |

## Endpoints ציבוריים (שיווק)
```
GET  /api/stats       → { producers_count, categories_count }  — Social Proof Bar
GET  /api/cities      → [string]                                 — CitySearch autocomplete
POST /api/newsletter  { email } → 201                            — Footer newsletter
POST /api/contact     { name, email, message } → 200             — /about contact form
```

## Moderation — מהמטבח של השכן
מערכת Hybrid: AI → Badge → Admin. כל יצירת home-product עוברת דרך Claude.
- **תלויות:** `anthropic==0.39.0` (ב-requirements.txt), `ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL` ב-settings. אם ה-key חסר — fail open, הכל מתקבל כ-APPROVED + לוג.
- **DB columns (home_products):** `moderation_status` (APPROVED|FLAGGED|REJECTED), `moderation_reason`, `moderation_suggestion`. עם migration ב-`_migrate_columns`.
- **Service:** `backend/app/services/home_product_moderation.py::validate_home_product()` — fail-open: כל חריגה (parse error, rate limit, network) חוזרת כ-APPROVED.
- **Endpoints:**
  - `POST /home-products/validate` → { status, reason, suggestion } (בלי auth, בלי DB write) — ה-frontend קורא בזמן הקלדה עם debounce 1.5s
  - `POST /home-products` (create) — קורא לוולידציה שוב server-side (defense-in-depth), REJECTED זורק 400 עם `detail.error = "listing_rejected"`
  - `GET /admin/home-products/flagged` — רשימת הקף של מה שסומן
  - `POST /admin/home-products/:id/approve` — מסיר את ה-FLAGGED
  - `POST /admin/home-products/:id/remove` { reason } — is_active=false + שומר סיבה
- **UI:**
  - `components/HomeProductForm.jsx` — הטופס החדש עם debounce ו-feedback: צהוב ל-FLAGGED, אדום ל-REJECTED (חוסם submit). אם ה-API נופל — fail open בצד הלקוח.
  - `HomeProductCard.jsx` — badge "🔍 בבדיקה" צהוב עבור moderation_status=FLAGGED
  - `/admin/reports` — עכשיו 3 טאבים: דיווחים / בבדיקה / מוסתרים אוטומטית
- **חוקי עבודה:** אם בית העסק מפורסם עם FLAGGED, הוא ORATE עולה לקהל עם תגית ומופיע ב-admin queue. אם REJECTED, הוא לא נכנס ל-DB בכלל.

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

## Workflow rules (חוקי עבודה)
שלושה נאכפים ע"י hooks ב-`.claude/settings.json` (PreToolUse). הרביעי לא אוטומטי — זכרי אותו.

1. **עדכן CLAUDE.md לפני כל `git commit`.** hook מזכיר (non-blocking) לפני קריאות `Bash: git commit ...`. אם עדכנת — תתעלמי מהתזכורת ותתקדמי.
2. **קראי DESIGN.md לפני שינויי UI.** hook מזכיר לפני `Edit|Write|NotebookEdit` על קבצים ב-`frontend/app/`, `frontend/components/`, או `*.css`. הקובץ בשורש הריפו, לא ב-`docs/`.
3. **קראי DATA.md לפני שינויי backend.** hook מזכיר לפני `Edit|Write|NotebookEdit` על קבצים ב-`backend/`. הקובץ בשורש הריפו, לא ב-`docs/`.
4. **`/clear` במעבר בין משימות.** **לא אוטומטי** — hook לא יכול לזהות "מעבר בין משימות" (זה סמנטי). כשאת מתחילה משהו חדש שלא קשור למשימה הקודמת — הריצי `/clear` ידנית כדי לנקות קונטקסט.

## אבטחה — כללים קריטיים (SECURITY.md)
> אחרי הסקירה ב-2026-04-08 תוקנו 5 פרצות real. אל תחזרי לאחר מכן.

1. **JWT_SECRET_KEY חייב להיות מוגדר ב-env**. ה-default של `"change-me-in-production"` הוסר; בדאב נוצר secret אקראי בכל boot (טוקנים לא מחזיקים אחרי restart — זה הכוונה). ב-`ENV=production` האפליקציה מסרבת להפעיל בלי `JWT_SECRET_KEY` או `SECRET_KEY`. גירעון הטוקנים: **24 שעות** (היה 7 ימים).
2. **Rate limiting** דרך `slowapi` (`app/rate_limit.py` — `limiter` משותף). הוחל על: login (5/min), register + register/producer (3/hour), google + apple auth (10/min), POST /home-products (10/hour), POST /home-products/validate (30/hour), POST /newsletter (5/hour), POST /contact (5/hour), POST /reviews (20/day). **כל endpoint מוגן חייב לקבל `request: Request`** כפרמטר ראשון.
3. **SQL** — תמיד SQLAlchemy ORM. הפעם היחידה שאפשר `text()` היא ב-`_migrate_columns` עם מחרוזות הארדקודדות (לא user input).
4. **API responses** — תמיד `response_model=` עם Pydantic schema. אף פעם לא לחזור עם SQLAlchemy model ישיר.
5. **IDOR** — לפני כל `UPDATE`/`DELETE` של משאב שייך-למשתמש, בדקי `resource.user_id == current_user.id` (או `admin` override). כולם כרגע בדוקים. אל תשברי את זה.
6. **העלאת קבצים (`/upload/image`):** סניפינג magic-bytes לזיהוי פורמט (JPG/PNG/WebP/GIF בלבד), מגבלת גודל **5MB**, `uuid.uuid4().hex` כ-Cloudinary `public_id` (לא filename המשתמש), `resource_type="image"` כשכבת הגנה שנייה.
7. **CORS** — `settings.cors_origins_list()` מה-env var `CORS_ORIGINS`. ברירת המחדל הם dev origins בלבד; production חייב להגדיר. **לא `["*"]`**.
8. **Security headers** — middleware ב-`main.py` מוסיף לכל response: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`. ב-`next.config.js` הוסף גם HSTS + CSP בכפה של Next responses.
9. **Passwords** — bcrypt בלבד דרך passlib (כבר מקובע ב-requirements.txt, לא לשנות).
10. **Secrets** — `.env` ב-`.gitignore` (כבר). אף פעם לא להדפיס passwords/tokens ל-log. הלוגים של התחברות משתמשים ב-email prefix בלבד.

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
- **2026-04-08 · Security** — סקירה + תיקון כל ה-🔴 קריטי + 🟠 חשוב מ-SECURITY.md:
  - **Step 1 Review** מצא 4 פרצות אמיתיות: JWT default secret, אפס rate limiting, file upload לא מאומת, CORS open. **SQL injection + data exposure + IDOR היו כבר תקינים** (ORM everywhere, response_models, ownership checks) — דיווחתי ✅.
  - **Fix #1 JWT**: `config.py` נכתב מחדש. default secret הוסר. ב-dev נוצר secret אקראי לכל תהליך + אזהרה ללוג. ב-`ENV=production` נכשל מיידית אם אין `JWT_SECRET_KEY`. גירעון קיצר מ-7 ימים ל-24 שעות.
  - **Fix #2 Rate limiting**: `slowapi==0.1.9` ב-requirements.txt. `app/rate_limit.py` חדש עם `limiter` משותף. הוחל על 9 endpoints: login 5/min, register 3/hour, google/apple 10/min, create home-product 10/hour, validate home-product 30/hour, newsletter 5/hour, contact 5/hour, create review 20/day. Exception handler של 429 + SlowAPIMiddleware נוספו ב-`main.py`.
  - **Fix #6 File upload**: `upload.py` נכתב מחדש. סניפינג magic-bytes (JPG/PNG/WebP/GIF), 5MB limit, `uuid.uuid4().hex` כ-public_id (לא filename), `resource_type="image"` בכפה של Cloudinary. fallback מקומי (לא placehold.co) כשאין Cloudinary.
  - **Fix #7 CORS**: `settings.cors_origins` חדש (נקרא מ-`CORS_ORIGINS` env var, ברירת מחדל localhost בלבד). `allow_methods` מוגבל ל-GET/POST/PUT/DELETE/OPTIONS, `allow_headers` ל-Authorization/Content-Type/X-Requested-With.
  - **Fix #8 Security headers**: backend middleware מוסיף 4 headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy) לכל response. `next.config.js` מוסיף את אותם headers + HSTS + CSP מקיף (img-src כולל res.cloudinary.com/unsplash/openstreetmap tiles, script-src כולל Google/Apple OAuth, connect-src להתחברויות).
  - **Step 3 Re-verification** ב-TestClient live:
    - Fix #1: secret_key=64 תווים אקראיים, expiry=1440 ✅
    - Fix #2: 6th call ל-/auth/login → 429 ✅
    - Fix #6: spoofed JPEG נדחה (400), oversized נדחה (400), valid PNG מתקבל (200) ✅
    - Fix #7: cors_origins_list() = ['http://localhost:3000', 'http://localhost:8000'] (אין `*`) ✅
    - Fix #8: כל 4 ה-headers מופיעים על GET /categories ✅
  - **30/30 pytest עדיין עוברים** אחרי כל השינויים.
  - **עדיין פתוח (כל ה-🟡 בינוני מ-SECURITY.md)**: bleach לsanitization של textarea input, admin IP whitelist (אופציונלי), logging של email prefix בלבד במקום full — לא בסקופ של "🔴 + 🟠 בלבד". נרשמים לעתיד.

- **2026-04-08 · Fixes V2 #6** — Cookie banner:
  - `components/CookieBanner.jsx` חדש — floating dialog בפינה הימנית-תחתונה עם 2 כפתורים: "אני מסכימה ✓" (mode=all) ו-"רק הכרחיים" (mode=essential)
  - SSR-safe — לא רנדר בשרת, רק אחרי hydration + בדיקת localStorage, אז משתמשים חוזרים לא רואים flash
  - `localStorage.cookies_accepted` = "all" / "essential" — אם מוגדר, ה-banner לא מופיע
  - `role="dialog"` + `aria-labelledby` + `aria-describedby` + focus-visible rings
  - קישור ל-`/terms#privacy` (anchor שכבר מוגדר ב-footer)
  - מעל ה-BottomNav במובייל (`bottom-20`) כדי לא להסתתר מאחוריו
  - הוטמע ב-`app/layout.js` → מוצג בכל עמוד

- **2026-04-08 · Fixes V2 #5** — דף login מעודכן:
  - OAuth (Google + Apple) עלו למעלה, לפני אימייל/סיסמה, עם "— או —" divider
  - `GoogleAuthButton` ניקוי — הוצאתי את ה-divider שהיה בתוכו (coupling layout עם data), כי הדף כבר מטפל בזה
  - `AppleAuthButton` — הוסרה `mt-3` הקבועה, הוסף `focus-visible:ring`, radius 16→8
  - הדף בודק `NEXT_PUBLIC_GOOGLE_CLIENT_ID`/`NEXT_PUBLIC_APPLE_CLIENT_ID` ואם שניהם לא מוגדרים משמיט את הסקציה + ה-divider, כדי שלא יישאר divider ריק
  - כותרת: "התחברות" → "כניסה לחשבון" (עקבי עם COPY_FIXES)
  - סיסמה: שדות עם focus-visible ring, קישור "הצטרפי →" במקום "הירשם", error ל-role="alert"
  - **מה לא שונה:** ההטמעה של Google GSI הקיימת (עובדת), ה-POST /auth/google + /auth/apple. לא עברנו ל-@react-oauth/google כמו בספק — זה thrash מיותר, ההטמעה הנוכחית טובה.

- **2026-04-08 · Fixes V2 #4** — ולידציה של פרטים בהרשמה:
  - `lib/validators.js` חדש — `validateIsraeliPhone` (050-058 / 072-079), `normalizeIsraeliPhone` (→ E.164), `passwordRules` (3 חוקים: 8 תווים / A-Z / 0-9), `passwordValid`, `validateEmail`
  - `components/PasswordStrength.jsx` — checklist חי שמופיע מתחת לשדה סיסמה ומתמלא ✓ כשכל חוק מתקיים. מוסתר כשהשדה ריק
  - `/register` (צרכן): email/password/phone נבדקים client-side לפני submit. feedback bell של "✓ מספר תקין" / "❌ מספר טלפון לא תקין — נסי שוב" מתחת לשדה. PasswordStrength מוצג מתחת לסיסמה
  - `/register/producer` (Step 1): email + password נבדקים לפני המעבר ל-Step 2. PasswordStrength מוצג. (Step 2): phone נבדק לפני המעבר ל-Step 3
  - הצד השרת עדיין מקבל את הוולידציה המקורית של EmailStr, אז זה רק הגנה נוספת ו-UX

- **2026-04-08 · Fixes V2 #3** — ביקורות ודירוגים על בתי עסק:
  - `ProducerReview` model חדש — unique(producer_id, user_id), stars 1-5, title+body אופציונליים
  - `producers.avg_rating` (FLOAT) + `reviews_count` (INT) — מתעדכן ע"י `_recompute_producer_rating` בכל write
  - Migration entries ב-`_migrate_columns`
  - `backend/app/routers/reviews.py` חדש — GET /reviews?producer_id=X, POST /reviews (upsert), DELETE /reviews/:id (owner/admin)
  - `ProducerListOut` schema חושף `avg_rating` + `reviews_count`
  - `components/ProducerReviews.jsx` — רשימה + טופס כתיבה (pre-fills אם כבר יש ביקורת), משתמש ב-StarSelector הקיים, toast ב-save
  - `ProducerDetail` — trust badges חדשים ליד השם ("✅ עסק מאומת" + "⭐ X.X (N)"), קטע ביקורות בתחתית
  - `ProducerCard` — שורת דירוג קצרה מתחת לעיר/קטגוריה כשיש ביקורות
  - סביב "producer reviews" vs. "home_product_ratings" — הם שתי מערכות נפרדות: product ratings עובדות דרך טוקני WhatsApp וזה ל-home products בלבד. הביקורות החדשות הן public ו-UI-based ועבור producers.
  - Smoke-tested end-to-end: empty list → create → avg=5 → upsert → list stays at 1 → avg=4

- **2026-04-08 · Fixes V2 #2** — שדות מורחבים במוצרי בית:
  - `HomeProduct` model: 11 עמודות חדשות — `category`, `prep_date`, `expiry_date`, `storage_type`, `allergens`, `kosher`, `is_organic`, `unit`, `delivery_method`, `location_notes`, `images` (ARRAY)
  - Migration entries ב-`_migrate_columns`
  - Schemas עודכנו: `HomeProductCreate`/`Update`/`Out` חושפים הכל
  - `create_home_product` שומר הכל + מגדיר `photo` אוטומטית מה-`images[0]` כ-cover
  - `HomeProductForm.jsx` נכתב מחדש עם 6 fieldsets: פרטי המוצר, מידע חשוב לקונה (dates+storage+allergens+kosher+organic), כמות ומחיר, תמונות (עד 4 עם drag-remove), מיקום (CitySearch), איסוף/מסירה
  - ולידציה client-side: לפחות תמונה אחת, תאריכי prep+expiry חובה
  - `HomeProductCard` מראה trust badges (organic/kosher/storage/category), "הוכן עד" dates, שורת אלרגנים עם tooltip אם ארוך, מחיר עם unit או "🎁 במתנה" אם 0

- **2026-04-08 · Fixes V2 #1** — CitySearch בכל שדות העיר:
  - `data/cities.js`: הורחב מ-50 ל-~100 ערים + שכונות עיקריות של ת"א/ירושלים/חיפה
  - `CitySearch` הוטמע ב-`/register` (צרכן), ב-`/register/producer` — גם city וגם delivery_areas, ב-`HomeProductForm` (יוטמע גם במלואו ב-Fix 2)
  - קודם CitySearch היה רק ב-`/map` + `/events` + new-event form

- **2026-04-08 · Moderation** — מערכת מודרציה למהמטבח של השכן:
  - `backend/requirements.txt`: הוסף `anthropic==0.39.0`
  - `backend/app/config.py`: `anthropic_api_key`, `anthropic_model` (ברירת מחדל `claude-opus-4-6`)
  - `HomeProduct` model: הוספתי 3 עמודות (moderation_status/reason/suggestion) + migration
  - `HomeProductOut` schema: חשוף את 3 השדות ב-API
  - **service חדש:** `backend/app/services/home_product_moderation.py::validate_home_product()` — fail open אם אין API key או אם הקריאה נכשלת
  - `POST /home-products/validate` endpoint — בלי auth, בלי DB write (לטופס בזמן הקלדה)
  - `POST /home-products` — קורא לוולידציה server-side; REJECTED → HTTP 400 עם `detail.error=listing_rejected`
  - `GET /admin/home-products/flagged` + `POST /admin/home-products/:id/approve` + `POST /admin/home-products/:id/remove {reason}`
  - **HomeProductForm component חדש** (הוצאתי מ-page.js) — debounce 1.5s, request-sequence guard למניעת תגובות מיושנות, feedback צהוב/אדום, ה-Submit נחסם רק ב-REJECTED
  - `HomeProductCard`: "🔍 בבדיקה" badge צהוב על FLAGGED (מחליף את ה-"דירוג נמוך" badge בשעה שיש moderation flag)
  - `/admin/reports`: 3 טאבים — דיווחי משתמשים / מוצרים ביתיים בבדיקה / מוסתרים אוטומטית; counter ליד כל טאב
  - **Fail-open design**: אם משהו נפל (API key חסר, rate limit, parse error) החוויה לא נחסמת — מתקבל כ-APPROVED + לוג. עדיף לפעמים לפרסם מוצר גרוע מאשר לשבור לכולם.

- **2026-04-08 · Copy Fix** — שיפורי ניסוח + ברידינג נשי:
  - **Terminology:** "יצרן/יצרנים/יצרנית" → "בית עסק/בתי עסק/בעלת עסק" בכל הטקסטים הגלויים. DB/API/variable names לא נוגעים (producers, /producers, ProducerCard).
  - **Founder story (/about):** bio חדש — ספיר, 21, תוכניתנית בצבא, לומדת רפואה תזונתית אצל ד״ר גיל יוסף שחר. 4 פסקאות במקום 3.
  - **"הסיפור שלנו" (/about):** נכתב מחדש — 3 פסקאות יותר קצרות עם "bשר grass-fed", "קבוצות ווטסאפ, עמודי אינסטגרם, פליירים בסופר", "פשוט, נגיש ואמיתי".
  - **Footer:** "יצרנים" → "בתי עסק". "משפטי" → "שקיפות ואמון" עם ניסוח אנושי ("תנאי השימוש שלנו", "מדיניות פרטיות", "משהו לא בסדר? דווחי לנו").
  - **Hero subtitle:** "מוצרים מאומתים מיצרנים ישראליים" → "בתי עסק מקומיים, מגדלים קטנים ושכנות שמבשלות בבית".
  - **CTAs:** "הוסף את העסק שלך" → "הוסיפי את העסק שלך 🌿" ב-Header, about CTA, homepage CTA. "מצאי עסקים קרובים" → "גלי עסקים קרובים". "הצג עוד" → "עוד בתי עסק". "→ חזרה לתוצאות" → "← חזרה" (תיקון כיוון חץ RTL).
  - **Micro-copy table בCLAUDE.md** הורחב: loading, error fallback, form submit, back button — כולם במגדר נקבה.
  - **/register:** כותרת "הרשמה" → "הצטרפי לקהילה". כפתור → "הצטרפי". "התחבר" → "כניסה לחשבון" בלינק בתחתית.
  - **ProducerDetail loading + not-found:** "טוען..." → "טוענת עסקים טריים...". "בית עסק לא נמצא" → "לא מצאנו את בית העסק הזה — עדיין 🌱".
  - Error fallbacks ב-Footer/FavoriteButton/about-contact-form: "שגיאה — נסי שוב" → "משהו השתבש, נסי שוב". Error messages ב-admin/internal נשארו כמו שהם (הם ב-catch blocks עם context).
  - **מה לא שונה:** שמות משתנים/קומפוננטות (ProducerCard, producer, producers), API paths (/producers), DB columns, admin-facing strings (backoffice).

- **2026-04-08 · UX Fix 6** — framer-motion (fade + slide only):
  - הוסף `framer-motion@^11.11.0` ל-`package.json` → דורש `docker-compose build --no-cache frontend` כדי להתקין
  - `components/FadeInSection.jsx` — wrapper דק ל-`whileInView` fade+slide, easing `[0.25, 0.46, 0.45, 0.94]` (ease-out-quart), תומך ב-prefers-reduced-motion דרך framer-motion
  - **Homepage hero:** `motion.h1` + `motion.p` + `motion.form` — fade-in מלמטה על mount עם delays 0/0.2/0.4
  - **Category Grid:** `motion.button` לכל כרטיסייה, stagger 0.08s
  - **Producer grid:** `motion.div` wrapper, stagger 0.08s (modulo 4 כדי שלא יעצור את הגלילה)
  - **How it works:** `FadeInSection` על הכותרת + 3 שלבים עם stagger 0.12s
  - **שום 3D rotation, שום bounce, שום perspective** — רק fade+slide כמו במפרט

- **2026-04-08 · UX Fix 5** — שיפורי UX רוחביים:
  - **Toast system:** `lib/toast.js` — module-level pub/sub store; `components/Toaster.jsx` — fixed-position renderer; mounted ב-`layout.js`. שימוש: `import { showToast } from "@/lib/toast"; showToast("נשמר למועדפים ❤️")`.
  - **Breadcrumb component:** `components/Breadcrumb.jsx` — RTL-safe, משתמשת ב-`aria-current="page"` על הפריט האחרון. הוטמעה ב-/about, /map, /favorites, /events, /events/:id, /producer/:id.
  - **Skeleton loader:** `components/Skeleton.jsx` — shimmer animation עם `prefers-reduced-motion` fallback. החלפה של "טוענת..." ב-`SkeletonProducerGrid` ב-home + favorites.
  - **Back button** ב-`/producer/:id`: `router.back()` ליד ה-breadcrumb.
  - **ShareButton** מעבר ל-toast המשותף (היה לו div משלו).
  - **FavoriteButton** משתמש ב-toast — "נשמר למועדפים ❤️" / "הוסר מהמועדפים". הוספתי `aria-pressed` + `aria-label`.
  - **Empty states משופרים:** /favorites ו-/map עם עיגול-אייקון, כותרת headline, CTA ברור. /favorites קורא "גלי עסקים", /map קורא "מכירה מישהי? הזמיני אותה".

- **2026-04-08 · UX Fix 4** — Footer sitemap (4 עמודות ניווט):
  - `Footer.jsx`: rebuild ל-grid של 12 עמודות — brand (3) + 4 nav (6) + newsletter (3)
  - 4 עמודות ניווט: **לגלות** / **קהילה** / **יצרנים** / **משפטי**
  - הקישורים מ-UX_FIXES.md Fix 4 — כולל anchors ל-`/#producers-grid`, `/#home-kitchen`, `/terms#privacy`, `/about#contact`
  - copy `text-light/60` → `text-light/70` (נגישות טובה יותר)

- **2026-04-08 · UX Fix 3** — עמוד /about:
  - breadcrumb בראש: "בית › אודות"
  - CTA תחתון: "מוכנה להצטרף?" עם 2 כפתורים (הוסף את העסק שלך / מצאי עסקים קרובים)
  - radius 16px → 8px בכפתורי ה-CTA (עקבי עם הגדרות ה-invariants)
  - `font-serif` → `font-headline`, `font-sans` → `font-body` (canonical)

- **2026-04-08 · UX Fix 2** — ניווט ראשי כולל אירועים:
  - `Header.jsx` desktop + mobile: הוסף `אירועים 📅` בין מפה לאודות, שיניתי "דף בית" ל-"גלה" (עקבי עם bottom nav)
  - `BottomNav.jsx`: 4 טאבים חדשים — 🏠 גלה / 🗺️ מפה / 📅 אירועים / ❤️ מועדפים (החלפתי את "פרסם" ו"הודעות")
  - החלפתי `text-text-secondary` → `text-site-muted` (canonical token)

- **2026-04-08 · UX Fix 1** — "הצג במפה" → פוקוס ישיר:
  - `ProducerDetail.jsx`: הכפתור עבר מ-`<Link href=/map?lat&lng>` ל-`<button>` שמגדיר `sessionStorage.focusProducer` ואז `router.push("/map")`
  - `map/page.js`: useEffect שני שקורא מ-sessionStorage אחרי שה-producers טעונים → `setActiveProducerId` + `mapApiRef.current.focusProducer(id)` (מטיס + popup + highlight)
  - מנקה את sessionStorage מיד אחרי הקריאה כדי שלא יתפוס לטעינות הבאות

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
