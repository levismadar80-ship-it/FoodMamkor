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
| / | Hero + Social Proof Bar + Category Grid + Founder quote + גריד עסקים + עסקים חדשים + Parallax Quote + איך זה עובד + **preview** מהמטבח של השכן (3) + אירועים קרובים + CTA |
| /map | Leaflet + גריד מתעדכן + פוקוס דו-כיווני בלחיצה |
| /neighbor | **מהמטבח של השכן** — dark hero + CitySearch filter + grid של HomeProductCards + floating CTA |
| /producer/:id | גלריה + פרטים + sticky contact sidebar + ביקורות |
| /producer/dashboard | דשבורד יצרן — זמינות היום, מועדפים, quick links |
| /producer/dashboard/events/new | טופס הוספת אירוע |
| /events | רשימת אירועים, מסננים (עיר/קטגוריה), מאוגרד לפי חודש |
| /events/:id | פרטי אירוע + הרשמה |
| /about | חזון + ערכים + Parallax Quote + סיפור מייסדת + טופס יצירת קשר |
| /terms | תנאי שימוש |
| /admin | אדמין — 7 דפים (ראה ADMIN.md) |

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
- **שאלת חובה לכל שינוי עיצובי** (מ-LAUNCH_CHECKLIST): "האם זה מרגיש כמו שוק מקומי או כמו tech startup?" — אם startup, פשטי.

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

## Endpoints follow (consumer → producer)
```
POST   /api/producers/:id/follow           — עקבי אחרי עסק (idempotent)
DELETE /api/producers/:id/follow           — הפסיקי לעקוב
GET    /api/producers/:id/follow-status    — האם אני כבר עוקבת?
GET    /api/users/me/following             — רשימת העסקים שאני עוקבת אחריהם
```
Notifications themselves (push/Twilio) לא חוברו עדיין — זה foundation data-only.

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

### הגדרת `.env` — פעם ראשונה
קבצי ה-secrets עוברים דרך `.env` בשורש הריפו (אותה ספרייה כמו `docker-compose.yml`). Docker Compose קורא אותו אוטומטית, וה-`docker-compose.yml` מעביר את המשתנים לקונטיינר ה-backend. ה-`.env` ב-.gitignore.

```bash
# 1. העתיקי את התבנית
cp .env.example .env   # (Windows PowerShell: Copy-Item .env.example .env)

# 2. עריכי את .env בעורך ומלאי ערכים (בעיקר JWT_SECRET_KEY + ENV)
```

**PowerShell (Windows)** — אם את רוצה שורת פקודה במקום עריכה ידנית:
```powershell
# 1. צרי JWT secret
$jwt = python -c "import secrets; print(secrets.token_hex(32))"
# 2. כתבי .env
@"
ENV=development
JWT_SECRET_KEY=$jwt
CORS_ORIGINS=http://localhost:3000
"@ | Out-File -FilePath .env -Encoding utf8
```

**bash/zsh (Linux/Mac):**
```bash
cat > .env <<EOF
ENV=development
JWT_SECRET_KEY=$(python -c "import secrets; print(secrets.token_hex(32))")
CORS_ORIGINS=http://localhost:3000
EOF
```

לפרודקשן: שני `ENV=production` וערך מלא של `CORS_ORIGINS` עם הדומיין הציבורי שלך. ראי `.env.example` לכל המשתנים הזמינים.

### הרצת הסביבה
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
- **2026-04-08 · Additional fixes + emoji → Phosphor icons:**
  - **Fix 2 — /about parallax quote:** שונה מ-"כשאתה יודע מאיפה האוכל שלך — הכל טועם אחרת" ל-**"כי מה שאוכלים — חשוב. ומאיפה קונים — חשוב יותר"**.
  - **Fix 4 — /map search bar overflow:** הוספתי `min-w-0` ל-container של `CitySearch` (שני מקומות: root + flex row) + ל-`<input>` עצמו, וכרטוף את הסוגר ב-`/map` ב-`<div className="w-full md:w-72">` חיצוני עם `overflow-visible` ברמת ה-filters row. סיבה: בלי `min-w-0` flex children לא מתכווצים מתחת לרוחב התוכן שלהם, והקלט היה מגלש החוצה ב-viewports צרים.
  - **Fixes 1, 3, 5, 6 — verified already done:** /about story כבר נכתב מחדש עם הגרסה העשירה ב-FEEDBACK_FIXES (זוהה דרך 2 matches על "בשר מחקלאים" + "משקאות חקלאיים"); "גריד הקטגוריות" כבר הוסר ב-Fix 4b ("גלי בתי עסק קרובים אלייך — ירקות טריים, גבינות מהחווה, לחם מחמצת"); Google Places לא קיים בקוד כלל (CitySearch עם רשימת ערים סטטית); ProducerFollower model + 4 endpoints + FollowButton כבר קיימים מהסשן הקודם. **Push notifications נשארים פתוחים** — דורש חיבור Twilio/FCM transport.
  - **Emoji → Phosphor icons (cross-platform consistency):**
    - **Homepage Category Grid:** `CATEGORY_CARDS` שינה מ-`emoji: "🥩"` ל-`Icon: Cow` (וכו' — `Cow`, `Plant`, `Drop`, `Bread`, `Jar`, `Sparkle`). Render משתמש ב-`<Icon size={44} weight="duotone" color="white" />` במקום `<span>{card.emoji}</span>`.
    - **ProducerCard badges:** ✅ → `<Seal size={14} weight="fill" />`; 🌿 אורגני → `<Leaf size={14} weight="duotone" />`; 🐄 גראס פד → `<Cow size={14} weight="duotone" />`. תוקן גם ה-fallback של תמונה חסרה: 🌿 5xl → `<Leaf size={56} weight="duotone" />`.
    - **BottomNav:** `Calendar` → `CalendarBlank` (שאר ה-4 tabs כבר השתמשו ב-Phosphor מ-WORLD_CLASS_V2: `House`, `MapTrifold`, `CookingPot`, `Heart`).
    - **/neighbor hero title:** "מהמטבח של השכן 🏠" → כותרת עם `<House size={44} weight="duotone" color="#EAF3DE" />` כ-inline-flex אחרי הטקסט.
    - **Homepage home-kitchen preview title:** "🏠 מהמטבח של השכן" → `<House size={32} weight="duotone" className="text-primary" />` ואז הטקסט.
    - **/about values (4 cards):** 🌿🥩🏡🌱 → `Leaf`/`Cow`/`House`/`Plant` בגודל 32 duotone לבן על chip עגול 14×14 עם רקע `chip` הייחודי לכל כרטיס (primary ירוק / אדום בשר / primary ירוק / סגול). ה-chip מופיע מעל הכותרת במקום האמוג'י הגדול.
    - **/about founder placeholder:** 🌿 7xl בתוך העיגול → `<Leaf size={120} weight="duotone" className="text-primary" />`.
    - **404 page:** 🌿 7xl → `<Leaf size={80} weight="duotone" color="#2e6853" />`. Added `"use client"` כי הקומפוננטה הופכת לקליינטית כדי להשתמש ב-Phosphor (בניגוד ל-`@phosphor-icons/react/dist/ssr` שלא וודאתי שקיים). 🌱 הוסר מהטקסט.
    - **נשמרו כמו שהם:** אמוג'ים ב-toast notifications ("נרשמת! 🌱", "נשמר למועדפים ❤️" וכו') — הם קצרי-חיים; אמוג'ים בהודעות WhatsApp — הן נצרכות ב-WhatsApp שתומך באמוג'ים ילידית; CTA copy "הוסיפי את העסק שלך 🌿" — זה brand copy שלא היה במיפוי המפורש של המשימה.
  - **30/30 pytest עוברים** — שינויים frontend-only, backend לא נוגע.

- **2026-04-08 · FEEDBACK_FIXES** — feedback round + new follow feature:
  - **Fix 1 (neighbor stays in homepage)** — אומת ✓ כבר קיים: הומ מציג preview של 3 כרטיסיות + "ראי עוד →" ל-`/neighbor`, ו-`/neighbor` הוא דף מלא. לא נמחק כלום.
  - **Fix 2 (Login redesign)** — `app/login/page.js` סידר מחדש: כעת ה-card נפתח עם 🌿 circle + "כניסה למהמקור" + "ברוכה הבאה 🌱". **email קודם**, ואז "או" divider, ואז Google + Apple מתחת (הפוך מהסידור הקודם). ולידציית client-side של email דרך `validateEmail` מ-`lib/validators.js` עם אזהרה inline "כתובת האימייל אינה תקינה". Backend הרי כבר משתמש ב-`EmailStr` — זה רק layer נוסף.
  - **Fix 3 (Parallax quote)** — הספק ביקש להחליף את המשפט "grass-fed" במשפט "כשאתה יודע...". בפועל **ה-ParallaxQuote הדיבידר כבר היה עם "כשאתה יודע..."** מסשנים קודמים. המשפט "grass-fed" היה בכרטיסיית המייסדת שהוספתי ב-LAUNCH_CHECKLIST. החלפתי את כרטיסיית המייסדת ל-**"אוכל אמיתי, מאנשים אמיתיים, ממש ליד הבית"** (אלטרנטיבה מהספק) כדי לא לשכפל את ה-ParallaxQuote.
  - **Fix 4a (/about breadcrumb הוסר)** — הוסר לגמרי. נשאר תגובה בקוד: "breadcrumbs belong on producer/map pages, not on brand pages".
  - **Fix 4b (HowItWorks step 01 text)** — הספק טען שזה ב-`/about` אבל זה היה בהומ. שיניתי מ-"חפשי בתי עסק קרובים דרך המפה, גריד הקטגוריות או שורת החיפוש" (מכני מדי) ל-**"גלי בתי עסק קרובים אלייך — ירקות טריים, גבינות מהחווה, לחם מחמצת"** (יותר קונקרטי וחם).
  - **Fix 4c ("הסיפור שלנו" — טקסט חדש)** — `/about/AboutClient.jsx`: הרחבתי מ-3 פסקאות קצרות ל-5 פסקאות עשירות עם "בשר מחקלאים, גבינות אמיתיות, לחם מחמצת... משקאות חקלאיים וירקות שגדלו באדמה ישראלית", הפסקה על המסע ("לרוץ אחרי מודעה בפייסבוק לפני שתפוג... לעקוב אחרי עמוד אינסטגרם של מישהי מהכפר"), והדגשה ב-`font-semibold` על "מהמקור שמה הכל במקום אחד". leading-loose עבור נשימה טובה.
  - **Fix 5 (/about CTA 2 buttons)** — אומת ✓ כבר קיים מ-LAUNCH_CHECKLIST: "הוסיפי את העסק שלך 🌿" (primary) + "גלי עסקים קרובים" (outline).
  - **Fix 6 (/about colors + founder placeholder)** — כרטיסי ה-values קיבלו 4 צבעי רקע שונים: `#EAF3DE` (🌿 ללא מעובד), `#FFF3E0` (🥩 חומרי גלם), `#E8F5E9` (🏡 ייצור קטן), `#F3E5F5` (🌱 טרי). Founder placeholder: מ-square (`rounded-[16px]`) ל-**עיגול** (`rounded-full`), `border-4 border-primary/10`, shadow חם יותר, גודל 280/360 במקום 320/400. `font-serif` legacy הוחלף ל-`font-headline` canonical.
  - **Fix 7 (Google Places IL restriction)** — **לא רלוונטי**: אין שום אינטגרציה עם Google Places באתר. משתמשים ב-`CitySearch` סטטי (100+ ערים ישראליות מ-`data/cities.js`) + backend `/cities` endpoint. אין איך "זכ" יחזיר "מחאפצת ריף דמשק" אצלנו.
  - **New feature: producer_followers** —
    - `ProducerFollower` model: `user_id`, `producer_id`, `notify_new_products`, `notify_back_in_stock`, `UniqueConstraint(user_id, producer_id)`. Table נוצר אוטומטית ע"י `Base.metadata.create_all()` — לא צריך migration.
    - 4 endpoints ב-`producers.py`:
      - `POST /producers/:id/follow` — idempotent (מחזיר "Already following" אם כבר עוקב)
      - `DELETE /producers/:id/follow` — no-op אם לא עוקב
      - `GET /producers/:id/follow-status` — `{following: bool}` לאתחול ה-button
      - `GET /users/me/following` — רשימת העסקים שהמשתמשת עוקבת
    - `components/FollowButton.jsx` חדש — Phosphor `Bell`/`BellSlash`, "עקבי אחרי עסק זה" / "עוקבת", toast "מעכשיו תקבלי עדכונים על מוצרים חדשים 🔔" ב-follow. `aria-pressed`. מחזיר `null` אם המשתמשת לא מחוברת.
    - הוטמע ב-`ProducerDetail` sticky sidebar מעל שורת Favorites + Share.
    - **Notifications עצמן לא חוברו** — אין Twilio/FCM integration. זה foundation data-only; בהמשך אפשר להוסיף trigger על יצירת מוצר חדש → שליחה לעוקבים.
  - **Small polish items:**
    - `WhatsAppButton`: הוספתי `firedRef` + `pending` state — לחיצה ראשונה יורה `onClick` ומשביתה את הכפתור ל-2 שניות (`opacity-70 pointer-events-none`). "WhatsApp" → "נפתח..." בזמן הפקיעה. מונע double-click logging. ה-anchor עדיין נפתח ב-target=_blank רגיל. החלפתי את ה-SVG הארוך ב-`WhatsappLogo` מ-Phosphor. צבע הועבר ל-`#25D366` ברנד רשמי.
    - `HomeProductCard`: `h-full flex flex-col` על root + `flex flex-col flex-1` על ה-content + `mt-auto` על ה-WhatsApp button — כדי שכל הכרטיסיות בגריד יהיו באותו גובה והכפתור תמיד בתחתית, בלי קשר לכמה metadata יש.
  - **מה לא נעשה (נרשם לסשן הבא):**
    - **Push notifications infra** (Twilio/FCM) — ה-foundation מוכן אבל ה-transport עדיין לא.
    - **תמונת ספיר אמיתית** — עדיין `🌿` emoji; צריך קובץ תמונה.
    - **Parallax background image ל-"הסיפור שלנו"** — הספק הציע Unsplash shuk image, אבל הסיפור כרגע על cream background נקי וזה עובד טוב. הוספת parallax image תסיח מהטקסט העשיר. דילגתי.
    - **Custom favicon** — קובץ `/public/favicon.ico` כבר קיים מהתחלת הפרויקט.
  - **30/30 pytest עוברים** + live smoke test של ה-follow flow עבר (status → follow → status → idempotent → list → unfollow → status).

- **2026-04-08 · MAP_IMPROVEMENTS (all 10)** — refactor כבד של דף המפה:
  - **#10 Bug fix (first)** — ה-hover tooltip/screen reader יכלו להציג "Marker" (ה-default alt של Leaflet) שנקטע ל-"arker" בדפדפנים מסוימים. תיקון משולש: (a) כל marker עכשיו עם `alt: p.name || "עסק"` + `title: p.name` מפורשים, (b) מחליף את ה-default `L.icon` ב-`L.divIcon` מותאם (המטקסט של Leaflet לא רלוונטי יותר), (c) `bindTooltip(p.name)` שגורם ל-hover להראות את השם האמיתי. בונוס: null-guards בכל מקום (`typeof p.lat !== "number"`, `if (!p.id) return`) כך שהצגת producers חסרי קואורדינטות לא מפילה שום דבר.
  - **#4 Clustering** — `leaflet.markercluster@^1.5.3` נוסף ל-`package.json`. בחרתי ב-vanilla plugin (לא `react-leaflet-cluster`) כי MapComponent משתמש ב-Leaflet raw ולא ב-`react-leaflet`. `L.markerClusterGroup({ maxClusterRadius: 60, chunkedLoading: true })` עוטף את כל ה-markers. Cluster icon מותאם — עיגול ירוק עם count בלבן + border לבן ו-shadow.
  - **#5 Category-colored markers** — `CATEGORY_STYLES` map עם 6 זוגות color+emoji (בשר אדום, ירקות ירוק, חלב כחול, לחם זהב, שמן כתום, טיפוח סגול). `createCategoryMarker(producer, {active, hovered})` מחזיר `L.divIcon` עם teardrop shape (`border-radius: 50% 50% 50% 0 + rotate -45`), גדלים דינמיים (32/38/44px ל-default/hovered/active), transition עדין.
  - **#6 Improved popup** — `buildPopupHtml(producer)` מחזיר HTML עשיר עם תמונה (120px גובה, fallback אם חסר), שם ב-Frank Ruhl Libre, עיר + קטגוריה, ⭐ rating line אם יש ביקורות, שני כפתורים (פרטים מלאים ירוק + 💬 WhatsApp ירוק בהיר עם `?text=היי! מצאתי אותך במהמקור`).
  - **#3 Hover sync** — state משותף `hoveredProducerId` ב-MapClient. כרטיסיה → מפה: `onMouseEnter` קורא ל-`mapApiRef.current.setHoveredProducer(id)` החדש שמשנה את ה-marker icon. מפה → כרטיסיה: `onProducerHover` callback חדש ב-MapComponent שמופעל מ-`marker.on("mouseover"/"mouseout")`. הכרטיסייה מקבלת `ring-2 ring-primary` כשיש hover.
  - **#1 "חפשי באזור זה"** — state `mapMoved` ב-MapClient מתעדכן מ-`onMapMove` callback. כפתור לבן צף ב-`top-4 left-1/2` עם Phosphor `MagnifyingGlass` icon + "חפשי באזור זה". לוחץ → refetch + reset `mapMoved` ל-false.
  - **#2 "קרוב אלי" polish** — כבר היה ב-`MapComponent`, הזזתי למטה-שמאל (`bottom-6 left-4`), נתתי לו border + shadow + `flyTo` עם animation (היה `setView`).
  - **#7 Mobile bottom sheet** — כש-marker נלחץ במובייל, `selectedProducer` נקבע ומוצג כ-dialog צף `fixed bottom-16 inset-x-3` (מעל ה-BottomNav) עם `animate-[slide-up_0.25s_ease-out]`, `role="dialog"`, כפתור X לסגור. מכיל `<ProducerCard>` מלא. רק `md:hidden`.
  - **#8 Category legend = filter** — widget קבוע ב-`bottom-4 right-4` (פינה תחתית-ימין של המפה, מתחת לפקדי Leaflet). 6 שורות, כל אחת clickable, `opacity-40` כשה-category לא פעיל, `aria-pressed`. כשקיים filter אקטיבי — מוצג כפתור "הצגי הכל" ל-reset. state `activeCategoryNames` (`null` = "all enabled", array = explicit inclusion list).
  - **#9 Empty state overlay** — card לבן צף במרכז המפה (`top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2`) כאשר `visibleProducers.length === 0 && allProducers.length > 0`. 🌱 + "אין עסקים באזור זה עדיין" + "מכירה מישהי שתוכל להצטרף?" + כפתור "הוסיפי עסק +" → `/register/producer`. לא מוצג כש-`mapMoved` (שלא יתחרה עם ה-"חפשי באזור זה" button).
  - **Globals.css** — הוספתי 4 כללים: `.mehamekor-marker-wrap` (שקוף — ה-divIcon שלנו מעצב את עצמו), `.mehamekor-tooltip` (שחור חם #1C1A17 על רקע קרם #F5F0E8), `.mehamekor-cluster`, ו-keyframe `slide-up` ל-mobile bottom sheet.
  - **30/30 pytest עדיין עוברים** — זה שינוי frontend-only.
  - **Rebuild required:** `leaflet.markercluster` dep חדש דורש `docker-compose build --no-cache frontend`.

- **2026-04-08 · /neighbor dedicated page** — מהמטבח של השכן עבר מסקציה בהומ לדף נפרד:
  - **`app/neighbor/page.js`** (server wrapper עם metadata: title "מהמטבח של השכן", og:type website) + **`app/neighbor/NeighborClient.jsx`** — dark-green hero (`bg-primary-dark`) עם כותרת "מהמטבח של השכן 🏠" + subtitle, breadcrumb, CitySearch filter, Section-level disclaimer, HomeProductForm togglable, grid 3/2/1 של `HomeProductCard`, floating "פרסמי מוצר" CTA (mobile — `fixed bottom-24 left-1/2`, מעל ה-BottomNav ב-5 tabs, עם Phosphor `Plus`/`X` icons), SkeletonProducerGrid ב-loading, empty-state עם 🍲 circle + CTA.
  - **`HomeProductCard` נשאר כמו שהוא** — הוא כבר תואם לספק: badge "ביתי 🏠", טייטל+שכונה בלבד (כתובת מדויקת לא נחשפת כי `street`/`zip_code` ב-FIXES_V2 #7c לא ב-HomeProductOut), trust badges (אורגני/כשר/אחסון/קטגוריה), prep/expiry dates, alergens, מחיר+יחידה או "🎁 במתנה" ל-0, סטארים, כפתור WhatsApp, ו-"🔍 בבדיקה" badge על moderation_status=FLAGGED. לא דרוש שינוי.
  - **Homepage — trimmed the section:** הסרתי את ה-city filter, ה-HomeProductForm, ה-disclaimer, וה-grid המלא. נשארו: כותרת + `ראי עוד →` link ל-`/neighbor` + preview של **עד 3 cards** מ-`homeProducts.slice(0, 3)`. אם אין מוצרים, מוצגת שורת "אין עדיין..." עם קישור ל-`/neighbor` להצטרפות. ה-id="home-kitchen" נשמר כי footer מקשר אליו. State ופונקציות מתות נוקו: `showHomeForm`, `homeKitchenCity`, `handleHomeProductCreated`, וה-imports של `HomeProductForm` ו-`CitySearch`.
  - **Header nav:** "מהשכן 🏠" נוסף ל-desktop nav (בין "אירועים" ל-"אודות") וגם למobile menu. Footer column "קהילה" כבר היה עם `/#home-kitchen` link — נשאר (זה לא-הכרחי אבל עדיין עובד, ועכשיו גם יש קישור ישיר ל-`/neighbor` דרך ה-Header).
  - **BottomNav:** גדל מ-4 ל-**5 tabs** (`grid-cols-5`). הסדר: 🏠 גלה · 🗺️ מפה · 📅 אירועים · 🍲 מהשכן · ❤️ מועדפים. האייקון החדש `CookingPot` מ-Phosphor. טקסט הלייבלים קטן מ-`text-xs` ל-`text-[11px]` כדי שיכנס ב-20% width לכל tab.
  - **מה לא שונה:** ה-navbar mobile menu של ה-header עדיין כולל את כל 5 הקישורים (לא רק 4) — ב-mobile יש יתירות עם ה-BottomNav, אבל זה בסדר: ה-menu טוב גם למשתמשים בדפדפנים עם JS לא-חלקי או שמעדיפים hamburger. ה-HomeProductForm עצמו לא שונה — רק מקום הצגתו עבר לדף ה-/neighbor.

- **2026-04-08 · LAUNCH_CHECKLIST week 4 — Pre-launch verification:**
  - **Backend pytest:** ✓ 30/30 עוברים אחרי כל השינויים של הסשן הזה (design fixes + week 1-3).
  - **Frontend syntax sweep:** ✓ כל 13 הקבצים שנגעו בהם ב-weeks 1-3 (כולל 3 ה-server wrappers החדשים ל-`/about`/`/events`/`/map` + `error.js` + `not-found.js`) עם balanced braces/parens.
  - **Live smoke test של welcome email flow:**
    - `POST /auth/register` עם משתמש חדש → 200, access_token תקין
    - לוג מראה `[EMAIL] Would send welcome email to xxx@test.co.il (role=consumer)` — fallback הוטמע כמתוכנן (SMTP לא מוגדר בסנדבוקס)
    - `GET /auth/me` עם ה-token החדש → 200 עם role=consumer ו-email תקין
    - ✓ Fire-and-forget עובד — רישום לא נחסם על ידי שליחת מייל כושלת
  - **Security review re-verification:** ✓ כל הפיצ'רים של week 1-3 לא מפרים את ה-security invariants:
    - Welcome email משתמש ב-`email.split('@')[0]***` ללוגים (email prefix בלבד per security policy)
    - Error page במצב production לא מראה את ה-error message (רק ב-dev)
    - Server wrappers ל-client pages לא חושפים server code ל-browser
    - Sitemap משתמש ב-`SITE_URL` env var (לא hardcoded domain)
  - **Manual items — out of scope for this pass (content/human work):**
    - **5 אנשים שאינם מכירים את האתר ניסו להשתמש בו** — user testing, לא code.
    - **בדיקה על iPhone 13, Samsung Galaxy, iPad, Chrome, Safari, Firefox** — cross-device QA דורש מכשירים אמיתיים.
    - **בדיקה על 3G (האם נטען תוך 3 שניות?)** — דורש Lighthouse run על פריסה אמיתית + Chrome DevTools throttling.
    - **3 יצרנים ניסו להירשם בעצמם בלי עזרה** — user testing.
    - **Lighthouse score > 85** — דורש פריסה + Lighthouse CI או ידני בדפדפן.
    - **Backup אוטומטי של DB** — DevOps task (pg_dump cron או Railway backup).
    - **Monitoring (Sentry)** — דורש חשבון Sentry + DSN בקוד + ב-env (frontend ו-backend).
    - **HTTPS + .env.production הגדרות** — DevOps + הוספת secrets ל-production env.
  - **ROADMAP.md 13 steps:** לא בדקתי את כל 13 פריטי ה-ROADMAP בנפרד — הרוב כבר בוצעו בסשנים קודמים. מומלץ לעבור עליו כצ׳ק-ליסט ידני לפני דומיין.

- **2026-04-08 · LAUNCH_CHECKLIST week 3 — UX polish:**
  - **Welcome email:** `_send_welcome_email(email, name, role)` הוסף ל-`auth.py` בעקבות התבנית של `_send_deletion_email` הקיים. נקרא מ-`register` וגם מ-`register_producer`. יש שני body variants:
    - **Consumer:** "ברוכה הבאה! גלי בתי עסק..." + 3 quick links
    - **Producer:** "העסק שלך ממתין לאישור אדמין" + הסבר על הקריטריונים + link ל-dashboard
    - Fire-and-forget: חריגות SMTP נרשמות כ-`[EMAIL] Welcome email failed:` אבל לא חוסמות את ה-registration response. בלי SMTP_USER מוגדר — מדפיס `[EMAIL] Would send...` במקום לשלוח.
    - לוג מציג רק email prefix (`user***`) פר security policy.
  - **Global error page:** `app/error.js` חדש — Next.js App Router error boundary. 🌱 + "משהו השתבש" + כפתור "נסי שוב" (קורא ל-`reset()`) + כפתור "חזרה לדף הבית". ב-development מציג את ה-error message ב-`<pre>` קטן. client component (דרוש מ-Next).
  - **404 page:** אומת ✓ (נוסף ב-ALL_PAGES_DESIGN pass).
  - **Cookies banner:** אומת ✓ (נוסף ב-FIXES_V2 #6).
  - **A11y keyboard nav:** אומת במסלול החשוב — כל `<input>` כבר יש לו `<label htmlFor>`, כל `<button>` ו-`<Link>` עם `focus-visible:ring-2`, כל icon-only link עם `aria-label`, decorative SVGs מסומנים `aria-hidden`. ה-SECURITY audit pass כיסה את זה במפורש.
  - **מה לא בוצע:**
    - **כפתור נגישות צף** (font size toggle / high contrast) — זה widget ייעודי שלרוב מגיע דרך ספרייה חיצונית (userway, accessibe וכו'). יוסף בנפרד עם החלטה על הספק.
    - **Contrast ratio automated check** — `text-site-muted` (#5c584f על #F5F0E8) מגיע ל-~5.5:1 שזה AA, תיעדתי ב-`חוקים שאסור לשבור → Accessibility`.

- **2026-04-08 · LAUNCH_CHECKLIST week 2 — Trust signals:**
  - **Seed data:** 5 producers קיימים ב-`seed_data.py` (כל אחד עם תמונות, קטגוריות, מוצרים, ומשלוחים). ה-checklist רוצה לפחות 8 אבל זה **עבודת תוכן**, לא הנדסה — הוספת 3 producers מזויפים נוספים לא מחזקת את האמון, אלא מחלישה אותו. מוריש למשימת content של הצוות.
  - **Social Proof Bar:** אומת ✓ — מציג `{producers_count} בתי עסק מאומתים · {categories_count} קטגוריות · מכל רחבי הארץ` עם מספרים **מודגשים** (`font-semibold tabular-nums`), מקבל נתונים מ-`GET /api/stats`.
  - **WhatsApp CTA על כל עמוד עסק:** אומת ✓ ותיקון קטן:
    - `ProducerDetail` sticky sidebar — משתמש ב-`?text=היי! מצאתי אותך במהמקור — {producer.name}` (מ-WORLD_CLASS_V2).
    - `WhatsAppButton` — משתמש ב-`?text=היי, ראיתי את "{productTitle}" במהמקור`.
    - `ProducerCard` — **היה חסר ה-?text** — תוקן עכשיו, גם הוא עובר ב-`היי! מצאתי אותך במהמקור — {producer.name}`.
    - כל קישור WhatsApp באתר ממיר `0501234567 → 972501234567` לפורמט E.164.
  - **Founder story + photo ב-/about:** ה-founder section על /about נמצא עם ניסוח חדש (מ-COPY_FIXES). התמונה עדיין placeholder עם emoji 🌿 — **צריך קובץ תמונה אמיתית של ספיר** (content task, לא engineering).
  - **First real review:** ה-UI של reviews עובד (FIXES_V2 #3), אבל שתילת ביקורת מזויפת לא מחזקת אמון. **ביקורת אמיתית אפילו מבן משפחה** היא המלצה content, לא code.

- **2026-04-08 · LAUNCH_CHECKLIST week 1 — Performance + SEO:**
  - **sitemap.xml:** `app/sitemap.js` שוחזר. היה מכסה רק 4 עמודים סטטיים + producers by-id. עכשיו מכסה: `/`, `/map`, `/events`, `/about`, `/register/producer`, `/register`, `/login`, `/terms` + producers (עם slug URLs כשזמין) + event detail pages. משתמש ב-`SITE_URL` env var (ברירת מחדל `https://mehamakor.co.il`). הוסף `changeFrequency` לכל entry.
  - **robots.txt:** אומת ✓ (`User-agent: *` + Allow: / + Sitemap הוכרז).
  - **Root metadata:** `app/layout.js` שוחזר עם metadata עשיר — `metadataBase`, `title.template`, `keywords`, `openGraph` (type/locale/siteName/images), `twitter` (summary_large_image), `robots: {index: true, follow: true}`, `alternates.canonical`. ה-template מאפשר לדפים להוסיף title קצר והוא יורש את "| מהמקור" אוטומטית.
  - **Page-level metadata wrappers:** יצרתי server-component wrappers ל-`/about`, `/events`, `/map` — העמודים המקוריים עברו ל-`*Client.jsx`, וה-`page.js` החדש רק מייצא metadata + מרנדר את ה-client. זה דרוש כי client components לא יכולים לייצא metadata ב-Next App Router. שאר הדפים הקליינט (favorites, register, login) יורשים את layout metadata שזה מספיק עבור דפים נמוך-traffic.
  - **Producer detail:** אומת ✓ — כבר היה `generateMetadata` + JSON-LD `@type: LocalBusiness`.
  - **schema.org:** אומת ✓ — מופיע ב-`producer/[id]/page.js` עם address/geo/telephone/url/image.
  - **Images:** תמונות הקטגוריות בדף הבית משתמשות ב-inline `background-image` (bypass ל-next/image), מה שאומר שהן לא מקבלות lazy loading אוטומטי. ProducerCard + HomeProductCard כן משתמשים ב-`<Image>` עם lazy loading ברירת מחדל.

- **2026-04-08 · LAUNCH_CHECKLIST design fixes (4)** — תיקונים קצרים של דברים שהוגזמו:
  - **Fix 1 (Login warm):** אומת — ה-login page כבר על `#F5F0E8` עם כרטיס לבן, לא dark. הכיוון הזה נשמר במכוון כשדילגתי על "authkit dark mode" מ-WORLD_CLASS_V2 (מנוגד לברנד).
  - **Fix 2 (HowItWorks 3 cards):** אומת — הקטע הקיים משתמש ב-`FadeInSection` stagger עם 3 שלבים (01/02/03), לא sticky-scroll 300vh. נשמר מכוון.
  - **Fix 3 (Organic noise texture):** הוספתי ל-`globals.css` background-image של SVG noise inline ב-3% opacity. Zero HTTP requests, zero deps. מוסיף תחושת נייר עדינה בלי לפגוע בקריאות.
  - **Fix 4 (Founder quote card):** הוספתי `FadeInSection` על דף הבית בין ה-Category Grid ל-Producers Grid — כרטיס לבן עם 🌿 circle + ציטוט בפרנק-רוהל `"מצאתי בשר grass-fed ליד הבית רק אחרי שעתיים בקבוצות ווטסאפ. בניתי את מהמקור כדי שלך זה ייקח 30 שניות."` — הכל wrapped ב-`<Link href="/about">` עם `focus-visible:ring` + hover shadow.

- **2026-04-08 · Fixes V2 #7** — סינון עיר במהמטבח של השכן + שדות כתובת פרטיים:
  - **(a) City filter בהומ-קיטשן:** `page.js` נוסף state `homeKitchenCity` + `CitySearch` בראש סקציית "מהמטבח של השכן". שינוי העיר יורה `loadHomeProducts()` שקורא `GET /home-products?city=X` (ה-backend כבר תמך בזה קודם — לא דרש שינוי schema/router). הוספתי גם `id="home-kitchen"` לאנchor של ה-footer שכבר מקשר ל-`/#home-kitchen` + `scroll-mt-24` לscroll offset מתחת ל-navbar הדביק.
  - **(c) Street + zip_code פרטיים:** הוספתי שתי עמודות ל-`HomeProduct`: `street VARCHAR(200)` + `zip_code VARCHAR(20)`. Migration entries ב-`_migrate_columns`. ה-`HomeProductCreate`/`Update` schemas מקבלים אותן, אבל **`HomeProductOut` לא חושף אותן** — זה מכוון לשמירת פרטיות המוכר, כמו שה-FIXES_V2 spec אומר "אל תציגי כתובת מדויקת בכרטיסייה הציבורית". ה-router שומר אותן ב-`create_home_product`. ב-`HomeProductForm` הוספתי fieldset קטן לרחוב+מיקוד עם הערה `🔒 הכתובת המדויקת נשמרת לשימוש פנימי בלבד. ללקוחות מוצגים רק עיר ושכונה.`
  - **מה לא בוצע מ-Fix 7 (b) Google Places:** דורש API key, עוד dependency, ועלות חודשית. בנוסף ה-spec עצמו אומר שהכתובת המדויקת לא צריכה להיות ציבורית — אז רוב הערך של Google Places (geocoding מדויק) הולך לאיבוד. עדיף CitySearch הפשוט שכבר יש + שדות street/zip פרטיים.

- **2026-04-08 · ALL_PAGES_DESIGN** — עיצוב מלא לכל העמודים:
  - **`/producer/:id`** נכתב מחדש — layout של 2 עמודות (main-content + sticky contact sidebar 320px). ה-sidebar נשאר נעוץ בזמן scroll דרך description/delivery/reviews. במובייל: עמודה אחת, sidebar עולה למעלה לפני התוכן (`order-first`). הכפתורים: WhatsApp בצבע ה-brand הרשמי `#25D366`, טלפון/אינסטגרם/אתר עם אייקוני Phosphor (`Phone`, `InstagramLogo`, `Globe`), "הצג במפה" משתמש ב-`MapTrifold`. כפתורי favorite+share בשורה אחת. הכל קישורי tel/wa/ins פונקציונליים.
  - **`app/not-found.js`** חדש — דף 404 עם 🌿, כותרת "404" ב-Frank Ruhl Libre, הודעה "הדף לא נמצא — אבל יש לנו הרבה בתי עסק טובים 🌱", שני כפתורים (חזרה לבית / גלי עסקים במפה). Next.js מרנדר את זה אוטומטית לכל route לא קיים.
  - **`/terms`** נכתב מחדש — במקום `div` אחד עם section divs, עכשיו 6 sections נפרדות בכרטיסיות לבנות על הרקע הקרם. כל סקציה עם `id=` לקישורי anchor (למשל `/terms#privacy` שהfooter כבר מקשר אליו). כותרת sticky הוסרה כדי להיות עקבי עם שאר העמודים.
  - **`/admin` layout** — sidebar כהה-ירוק (`bg-primary-dark`) 240px בצד ימין (RTL), אייקוני Phosphor (`Gauge`, `Storefront`, `Users`, `Note`, `Warning`, `ChartLineUp`, `GearSix`) במקום emojis. הפעיל מסומן ב-`bg-primary` עם `weight="fill"`, השאר `text-light/70` עם `weight="duotone"`. תוכן על `bg-background` עם `mr-60` (RTL offset). המובייל: nav אופקי scrollable מעל התוכן. הסיידבר הוא ה**היחיד מקום באתר** שהוא dark — זה מכוון, מסמן "backoffice".
  - **מה לא בוצע מ-ALL_PAGES_DESIGN בכוונה:**
    - **`/map` sidebar layout rewrite** — הדף הנוכחי עובד טוב, ל-rewrite יש סיכון לשבור את deep-link-from-producer (Fix 1) ואת ה-bidirectional map focus. דחיתי.
    - **`/register/business` multi-step rewrite** — הדף הקיים כבר עובד עם 3 שלבים + validation. rewrite מלא עם `AnimatePresence` הוא cosmetic שלא מצדיק את הסיכון לשבור את זרימת ההרשמה.
    - **Producer page gallery grid** (2fr/1fr layout) — ה-`ImageGallery` הקיים עובד ויש לו תמיכה ב-fullscreen/swipe. נשמר.
    - **`/events` filter pills rewrite** — הדף הנוכחי כבר יש לו filter pills דרך `CitySearch` + `CATEGORIES` array.

- **2026-04-08 · WORLD_CLASS_V2** — שיפורי navbar + smooth scroll + אייקונים:
  - `package.json`: `@phosphor-icons/react@^2.1.7` + `lenis@^1.1.13` (דורש `docker-compose build --no-cache frontend` כדי להתקין)
  - `components/SmoothScrollProvider.jsx` חדש — Lenis עם duration 1.2 + exponential easing. **מכבד `prefers-reduced-motion`** — אם המשתמש ביקש פחות תנועה, לא טוען Lenis בכלל (ברירת מחדל של הדפדפן).
  - `Header.jsx` — scroll-blur effect: מתחיל עם bg-background solid, עובר ל-`bg-background/85 backdrop-blur-md` אחרי scroll > 60px. תנועות חלקות של 300ms. החלפת ה-SVG hamburger ב-`List`/`X` מ-Phosphor.
  - `BottomNav.jsx` — 4 אייקוני emoji הוחלפו ב-Phosphor: `House`, `MapTrifold`, `Calendar`, `Heart`. תג `weight="fill"` כשפעיל, `duotone` כברירת מחדל.
  - `Footer.jsx` — שביל SVG של Instagram (50+ lines) הוחלף ב-`InstagramLogo` מ-Phosphor.
  - `app/layout.js` — `SmoothScrollProvider` עוטף את כל ה-AuthProvider children (בצד הלקוח).
  - **מה לא בוצע מ-WORLD_CLASS_V2 בכוונה:**
    - **Dark-mode login** (`#0f0f0f` authkit style) — מנוגד לכיוון הברנד ב-CLAUDE.md ("תחושת שוק איכרים — חם ואורגני, לא startup") ולמפרט העיצוב המקורי שאמר "לא dark mode". דילגתי.
    - **Sticky HowItWorks 300vh** — גימיק שמוסיף 2 מסכים של scroll לדף הבית בלי תוכן נוסף. הקטע הקיים עם `FadeInSection` stagger עובד מצוין.
    - **Mass icon replacement** — Header/BottomNav/Footer עודכנו, אבל שאר ה-emojis בדף הבית (category emojis, "🌿", "🧴" וכו') נשארו כי הם תוכן, לא UI chrome.

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

## Production infra (הוסף אפריל 2026 — FINAL_AUDIT)
- **SEO/OG:** `app/layout.js` — metadata כולל openGraph/twitter, favicon, apple-touch-icon, og-image (`/public/og-image.jpg`, 1200×630). עמודי עסק מוסיפים metadata דינמי ב-`app/[slug]/page.js`.
- **Analytics:** Microsoft Clarity נטען מ-`app/layout.js` כש-`NEXT_PUBLIC_CLARITY_PROJECT_ID` מוגדר.
- **Error monitoring:** Sentry (`@sentry/nextjs`) — קבצי `sentry.{client,server,edge}.config.js` + wrap ב-`next.config.js`. מופעל רק אם `NEXT_PUBLIC_SENTRY_DSN` מוגדר.
- **תמונות Cloudinary:** כל תמונה עוברת דרך `lib/cloudinary.js` (`optimizeCloudinary`) שמזריקה `f_auto,q_auto` → WebP/AVIF אוטומטי.
- **ImageWithFallback:** `components/ImageWithFallback.jsx` עוטף `next/image` עם fallback ירוק חם + אופטימיזציית Cloudinary. משומש ב-`ImageGallery` וכרטיסיות נוספות לפי הצורך.
- **Skeletons:** `ProducerCardSkeleton` + `HomeProductCardSkeleton` + `.skeleton-shimmer`/`.skeleton-bar` ב-`globals.css`. דף הבית מציג shimmer עד שהנתונים מגיעים.
- **WhatsApp share:** `components/WhatsAppShareButton.jsx` בכל דף עסק — ה-viral loop (`wa.me/?text=...`).
- **Section spacing:** class `.section-y` ב-`globals.css` (80px דסקטופ / 48px מובייל) זמין לכל דף שמעוניין להחיל מרווחים עקביים.
- **Print CSS:** ב-`globals.css` — מסתיר header/footer/nav בהדפסה.

### ENV חדשים
```
NEXT_PUBLIC_CLARITY_PROJECT_ID=xxxxxxxxxx
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
SENTRY_DSN=...          # server
SENTRY_ORG=mehamekor
SENTRY_PROJECT=mehamekor-frontend
```

## Premium design details (הוסף אפריל 2026 — PREMIUM_DESIGN)
השראה: gardensweet.com, Graza, Simply Chocolate, Foraged.

- **אייקוני קטגוריות — hand-drawn SVG line-art:** `frontend/components/CategoryIcons.jsx` מחליף את Phosphor בגריד הקטגוריות של דף הבית. כל אייקון רכיב עצמאי עם `stroke`/`size` props (`MeatIcon`, `VegIcon`, `DairyIcon`, `BreadIcon`, `OilIcon`, `SoapIcon`), ו-`CATEGORY_ICONS` הוא lookup לפי מפתח (`meat`, `veg`, `dairy`, `bread`, `oil`, `care`). **אל תחזיר Phosphor לקטגוריות** — זה היה כוונתי לרענן את התחושה (אנושי, לא generic).
- **Ken Burns:** `.kenburns-right` / `.kenburns-left` ב-`globals.css` (20s/25s ease-in-out infinite alternate, `scale 1→1.08` + translate קטן). הוחל על: hero בדף הבית, `ParallaxQuote` (המפרסר `inset: -5%` מונע clipping), heroes של `/about`, `/neighbor`, `/events`. `prefers-reduced-motion: reduce` מכבה את האנימציה לגמרי.
- **Marquee strip:** בין גריד הקטגוריות לכרטיסי העסקים בדף הבית. `MARQUEE_ITEMS` מוגדר ב-`app/page.js`. הטראק מרונדר פעמיים עם `gap: 48px` ו-`translateX(-50%)` ללולאה חלקה. `:hover` משהה; `reduced-motion` עוצר.
- **AnimatedCounter:** `frontend/components/AnimatedCounter.jsx` סופר מ-0 ל-target כשהאלמנט נכנס ל-viewport (`IntersectionObserver threshold: 0.5`). Ease-out-cubic, 1500ms default. משומש ב-Social Proof Bar בדף הבית. `reduced-motion` → מציג את המספר הסופי מיד.
- **CustomCursor:** `frontend/components/CustomCursor.jsx` נטען ב-`app/layout.js`. נקודה ירוקה 12px עם `mix-blend-mode: multiply`, `z-index: 9999`. מתגדל ×3 על `a, button, [role="button"], input, textarea, select, label`. **Desktop-only** — מזהה `(hover: none)`, `ontouchstart`, `maxTouchPoints > 0`, `(max-width: 768px)`, ו-`prefers-reduced-motion`, ומכבה את עצמו על מובייל/tablet. הכיתה `custom-cursor-on` מוחלת על `<html>` רק כש-JS החליט להפעיל, וזה מה שמסתיר את הסמן הנייטיב — אם JS נכשל, הסמן הרגיל נשאר.
- **Unsplash images לפי PREMIUM_DESIGN:**
  - Hero דף הבית: `photo-1542838132-92c53300491e`
  - Parallax divider 1 (בין producers ל-how it works): `photo-1488459716781-31db52582fe9`
  - Parallax divider 2 (לפני events): `photo-1464226184884-fa280b87c399`
  - /about hero: `photo-1500937386664-56d1dfef3854`
  - /neighbor hero: `photo-1498579809087-ef1e558fd1da`
  - /events hero: `photo-1414235077428-338989a2e8c0`
  - `images.unsplash.com` כבר מאושר ב-`next.config.js` (`remotePatterns` + CSP `img-src`).

### גוצ'ה חשובה — `.parallax-bg` (legacy)
הכיתה עדיין קיימת ב-`globals.css` (`background-attachment: fixed`) אבל כבר לא בשימוש בשום קומפוננטה. `ParallaxQuote` עברה ל-Ken Burns. אפשר להשאיר את הכיתה כ-fallback או לנקות בעתיד — אין לה תוצאת runtime אם אף אחד לא מחיל אותה.

## Map — המשך שיפורים (אפריל 2026, second pass)
> המפרט `MAP_IMPROVEMENTS.md` מונה 10 שיפורים (1–9 + באג 10). כולם נפרסו ב-`claude/review-document-HlIVP` — ראי הלוג למעלה. ה-pass הזה הוסיף שני baגים שהתגלו בקריאה חוזרת (13, 14) ושני שיפורים קטנים (11, 12).

### באגים שתוקנו
- **#13 — ה-marker של "קרוב אלי" זלג בכל לחיצה.** `MapComponent.goToMyLocation()` קרא ל-`L.circleMarker().addTo(map)` על כל לחיצה בלי להסיר את הקודם, כך ש-DOM הלך ונצבר. התיקון: `myLocationMarkerRef` חדש שמשתף marker יחיד (`setLatLng()` על הקיים במקום יצירה מחדש), מנוקה ב-cleanup של ה-map useEffect. אל תחזירי את הגרסה הישנה.
- **#14 — "חפשי באזור זה" היה no-op.** `visibleProducers` סינן בלי הפסקה לפי `mapBounds` הלייב, אז בזמן שהכפתור הופיע הסינון כבר הופעל. הלחיצה רק קראה ל-`loadProducers()` (שמביא מחדש את כל העסקים מהשרת) בלי לשנות state. התיקון הוא pattern של Airbnb: הוספתי `committedBounds` שמתעדכן רק כשהמשתמש לוחץ את הכפתור, וה-`visibleProducers` memo מסנן נגדו במקום נגד `mapBounds`. תוצאה: פאן חופשי במפה בלי שהרשימה תזוז, ורק לחיצה מחייבת commit. שינוי עיר או הכפתור החדש "הצגי את כל הארץ ←" מנקים את `committedBounds`.

### שיפורים נוספים
- **#11 — `fitBounds` אוטומטי בטעינה ראשונה.** ה-default view היה `[31.5, 34.8]` zoom 8 — כל הארץ, כולל ים. עכשיו ברגע שה-producers הראשונים מגיעים, `MapComponent` קורא ל-`mapInstanceRef.current.fitBounds(...)` עם `padding: [40,40]`, `maxZoom: 12`. מתבצע **פעם אחת** דרך `hasFitBoundsRef` כך שסינונים מאוחרים לא טורקים את המבט של המשתמש אחורה.
- **#12 — layout של ה-drag handle ב-bottom sheet.** היה `<div className="flex items-start justify-between">` עם `mx-auto` על ה-handle (שלא עובד בתוך flex) וה-X button עם `absolute top-3 right-3` מוטמע באותו flex row (שלא עושה כלום עליו). עכשיו: ה-handle הוא בלוק עצמאי עם `mx-auto mb-3`, וה-X יצא מה-flex ל-`absolute top-3 left-3` ביחס ל-dialog עצמו (physical left ב-RTL = קצה קריאה). הוספתי גם `aria-modal="true"`.

### Programmatic-move guard (חדש)
ב-`MapComponent` יש עכשיו `programmaticMoveRef`. כל קריאה פנימית ל-`flyTo`/`fitBounds` (initial fit, `focusProducer`, `goToMyLocation`) מדליקה את הדגל, ומטפל ה-`moveend` מוותר על הקריאה ל-`onMapMove` כשהוא נדלק (ואז מכבה אותו). זה מונע ש-`mapMoved=true` יידלק מיד עם טעינה ראשונה ושה-banner "חפשי באזור זה" יקפוץ בלי סיבה. אם הוספת איפשהו `flyTo`/`fitBounds` חדש — **זכרי להדליק את הדגל לפני הקריאה**, אחרת הכפתור יחזור לקפוץ.

### `focusProducer` — פתיחת popup אחרי flyTo
לפני: `setTimeout(..., 1250)` שמנסה לתזמן את סיום ה-flyTo של 1.2s. אחרי: `mapInstanceRef.current.once("moveend", ...)` — מדויק יותר, בלי race conditions אם המשתמש מפריע לאנימציה.

## Design pipeline pass (אפריל 2026 — 17-skill sequence)
רצתי את כל הרשימה `/teach-impeccable → /ui-ux-pro-max → /audit → /arrange → /typeset → /clarify → /colorize → /animate → /delight → /adapt → /harden → /optimize → /normalize → /polish homepage → /polish map → /polish about → /critique`.

### מה נוצר ב-pass הזה
- **`.impeccable.md`** חדש בשורש — Design Context מתומצת (users/brand/aesthetic/principles/a11y). Canonical source of truth הוא עדיין CLAUDE.md; זה wrapper קצר יותר.
- **`frontend/lib/map-categories.js`** — `CATEGORY_STYLES`, `DEFAULT_CATEGORY_STYLE`, `CATEGORY_LEGEND`, `styleForProducer`. הוצא משם שהיה כפול ב-`MapComponent.jsx` וב-`MapClient.jsx`. שתי הקבצים עכשיו מייבאים ממקור אחד.

### תיקונים קונקרטיים
- **Arrange** — `section-y` הוחל על הומ (CATEGORY GRID, HOW IT WORKS, NEIGHBOR PREVIEW, UPCOMING EVENTS) ועל about (Story, Values, Criteria, Green values band, Founder, Contact form, Final CTA). הרו ו-CTA שלהם משאירים `py-20` בכוונה.
- **Typeset** — 6 שימושים של `font-serif`/`font-sans` ב-`AboutClient.jsx` הוחלפו ב-`font-headline`/`font-body` קנוניים.
- **Clarify** — `/rate/[token]` "טוען..." → "טוענת..."; alert ב-`/settings` ו-`/producer/dashboard` קיבלו הודעות ספציפיות ב-נקבה במקום "שגיאה ב-X. נסה שוב".
- **Colorize** — inline `#6b6b6b` ב-`ProducerCard` → `text-site-muted` token; inline `#EAF3DE` על ה-hero subtitle → `text-light` class.
- **Animate** — ה-`animate-bounce` של hero scroll arrow הוחלף ב-`.scroll-hint` keyframe ב-`globals.css` (ease-out-quart 2.4s, גלישה עדינה עם fade). `prefers-reduced-motion` מכבה.
- **Delight** — newsletter success message הורחב מ-"נרשמת! 🌱" ל-"ברוכה הבאה למהמקור 🌱 נפגשות בתיבה".
- **Adapt** — `ImageGallery` arrows מ-`w-10 h-10` (40px) ל-`w-11 h-11` (44px — WCAG touch target). הוסף `aria-label="תמונה קודמת/הבאה"`, indicator dots גדלו מ-`w-2` ל-`w-3` עם `aria-current="true"` על האקטיבי.
- **Optimize** — כל שבעת ה-URLs של Unsplash (hero + 2 parallax dividers + 3 page heroes + ParallaxQuote) קיבלו `&auto=format&q=80`. הוסף `<link rel="preconnect" href="https://images.unsplash.com">` ב-`layout.js` — משפר LCP בהומ כי ה-hero משתמש ב-CSS background-image (עוקף next/image).
- **Normalize** — `text-site-text/70` על `/about` (היחיד שנשאר) → `text-site-muted`. `CATEGORY_STYLES` הוצא מ-`MapComponent` ל-`lib/map-categories.js` (ראה לעיל).
- **Polish homepage** — founder quote card 🌿 emoji → `<Leaf weight="duotone">`; marquee קיבל `.marquee-edge-fade` class עם `mask-image: linear-gradient` לשיכוך קצוות (48px fade on each side); הפסים inline `color: "#EAF3DE"` על marquee spans → `text-light` class.
- **Polish map** — ה-`📍 קרוב אלי` button קיבל `<Crosshair weight="duotone">` icon במקום emoji; ה-empty state של grid קיבל `<MapTrifold>` במקום `🗺️` emoji.
- **Polish about** — ה-3 sections שנשארו עם `py-20` (Green values band, Founder story, Contact form) נורמלו ל-`section-y`. ה-hero נשאר `py-20 md:py-28` בכוונה.

### Anti-patterns שנמצאו וניקיו
- `animate-bounce` on hero scroll arrow — Gone, `.scroll-hint` with ease-out-quart.
- Inline hex colors `#6b6b6b`, `#EAF3DE` — Gone, replaced with `text-site-muted`, `text-light` tokens.
- Legacy `font-serif`/`font-sans` in AboutClient — Gone, canonical `font-headline`/`font-body`.
- Duplicate `CATEGORY_STYLES` between two files — Gone, one source in `lib/map-categories.js`.
- Emoji icons in UI chrome (📍 קרוב אלי, 🗺️ empty state, 🌿 founder card) — Gone, Phosphor `Crosshair`/`MapTrifold`/`Leaf`.
- `w-10 h-10` touch targets on ImageGallery — Gone, `w-11 h-11` = 44px.
- `text-site-text/70` on cream bg (fails WCAG AA ~3.8:1) — Gone, `text-site-muted` = 5.5:1.

### Anti-patterns שנשארו ב-critique (לפוש הבא — לא פוצים בפאס הזה)
- **Homepage is long** — 13 blocks. Critique suggested removing the "עסקים חדשים" standalone section and badging new cards inline. לא נעשה כי זה decision architecturale.
- **Social proof bar too subtle** — `py-4` strip after 100vh hero. Critique suggested `py-8` + divider + sub-label. לא נעשה כי זה שינוי עיצובי ולא נכנס בסקופ "run the skills".
- **Founder quote card on homepage competes with producers grid** — Critique suggested moving it or shrinking to one-liner. Architecture change; not in scope.
- **Header `backdrop-blur-md` on scroll** — Critique: the one glassmorphism tell on the site; blur is invisible on cream anyway. Simple fix (one-line edit in Header.jsx) but not touched this pass.
- **No client-side filter feedback on category click** — Critique suggested 200ms skeleton or active chip pulse. Deferred.

### Skipped skills (intentional)
- **`/ui-ux-pro-max review`** — ran the `--design-system` command against our tech stack. Output recommended red/gold palette + Noto Sans Hebrew. אנחנו לא מאמצים — הפלט הוא suggestion generator ל-NEW projects, והברנד שלנו לוק. השארתי את ההערות ב-`.impeccable.md`.
- **`/audit`** — לא תיקן כלום בעצמו (זה הכלל של הסקיל — document only, fix via other commands). הפלט שימש כמפת-דרכים לסקילים הבאים.
- **`/harden`** — ה"באג" של 2 h1s ב-`rate/[token]/page.js` התברר כ-false positive (שני h1s בבלוקים מותנים שלא מופיעים בו-זמנית). לא נגעתי ב-admin loading strings לפי הכלל של CLAUDE.md ("admin-facing strings נשארו כמו שהם").

## איך לעדכן מסמך זה
כתבי: `עדכן CLAUDE.md: [תיאור ההחלטה]`
