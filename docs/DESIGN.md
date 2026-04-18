# מהמקור — עיצוב מפורט
> קרא קובץ זה כשעובדים על עיצוב, UI, קומפוננטות

---

## השראת עיצוב

### gardensweet.com (ראשי)
האסתטיקה שרוצים לשכפל:
- תמונות טבע שממלאות את כל המסך (full-bleed)
- parallax scroll — התמונה זזה לאט יותר מהתוכן, יוצרת עומק
- פונטים סריפיים גדולים ואלגנטיים
- טקסט לבן על תמונות כהות — קריא ומרשים
- מרווח לבן נדיב בין סקציות — לא צפוף
- תחושה אישית וחמה — כמו מכתב מהחווה, לא קטלוג
- כפתורים פשוטים עם border בלבד (outlined) — לא filled
- אנימציות fade-in עדינות כשגוללים למטה

### foraged.com/categories (category grid)
- תמונה מלאה + overlay ירוק כהה + טקסט לבן מרוכז
- hover: overlay בהיר יותר + scale קל

---

## צבעים

```css
--primary:       #2e6853;   /* ירוק כהה — כפתורים, לוגו */
--primary-dark:  #2E4A2E;   /* hero overlays, footer */
--secondary:     #4cb08b;   /* ירוק בינוני — הדגשות */
--background:    #F5F0E8;   /* קרם חם — לא לבן! */
--text:          #1C1A17;   /* שחור חם — לא pure black */
--accent:        #8B6914;   /* זהב — מחירים, הדגשות */
--light:         #EAF3DE;   /* ירוק בהיר — badges */
--border:        #e8e0d0;   /* גבולות */
```

tailwind.config.js:
```js
colors: {
  // ——— Core brand ———
  primary:         '#2e6853',
  'primary-light': '#3a7d64',   // producer card hover, CTA hover
  'primary-dark':  '#2E4A2E',   // footer, hero overlay
  secondary:       '#4cb08b',
  'secondary-light':'#6dc4a3',  // secondary CTA hover
  background:      '#F5F0E8',
  'site-text':     '#1C1A17',
  'site-muted':    '#6B6B6B',   // secondary copy, placeholders
  accent:          '#8B6914',   // gold — prices, highlights
  'accent-warm':   '#E8823A',   // warm orange — "premium" badge
  'accent-warm-light':'#f0a060',
  light:           '#EAF3DE',
  border:          '#e8e0d0',
  // ——— Text aliases (used in legacy components) ———
  'text-primary':  '#1C1C1C',
  'text-secondary':'#6B6B6B',
}
```

The 8 "core brand" tokens are locked; the hover-state, muted-text, and
accent-warm tokens evolved with the v1 shipping work and are also
considered canonical.

globals.css:
```css
body {
  background-color: #F5F0E8;
  color: #1C1A17;
  font-family: 'DM Sans', sans-serif;
}
h1, h2, h3 { font-family: 'Frank Ruhl Libre', serif; }
```

---

## פונטים

התקן מ-Google Fonts ב-app/layout.js:
```html
<link href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@300;400;700;900&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
```

| פונט | שימוש | משקלים נטענים |
|------|--------|----------------|
| Frank Ruhl Libre | כותרות עברית h1-h3, גדול ואלגנטי | 400, 700, 900 |
| Cormorant Garamond | טקסט אנגלי בלבד (לציטוטים) | 400, 600 |
| DM Sans | גוף טקסט, כפתורים, ניווט | 400, 500, 600 |
| Heebo | fallback לעברית כאשר DM Sans לא זמין | 300–700 |

tailwind:
```js
fontFamily: {
  headline: ['Frank Ruhl Libre', 'serif'],
  english:  ['Cormorant Garamond', 'serif'],
  body:     ['DM Sans', 'Heebo', 'sans-serif'],
  heebo:    ['Heebo', 'sans-serif'],  // used by legacy components
}
```

Heebo is loaded from `globals.css` (not from `layout.js` like the other
three) at weights 300/400/500/600/700. It's the fallback Hebrew body
font — DM Sans renders Hebrew fine for most glyphs but Heebo covers the
tail of less-common code points and legacy components that explicitly
ask for `font-heebo`.

---

## Hero Section — בדיוק כמו gardensweet.com

```
גובה: 100vh (מסך מלא)

תמונת רקע עם PARALLAX:
  url: https://images.unsplash.com/photo-1542838132-92c53300491e?w=1920
  background-attachment: fixed  ← זה ה-parallax!
  background-size: cover
  background-position: center
  background-repeat: no-repeat

gradient overlay (מלמטה כלפי מעלה):
  background: linear-gradient(
    to top,
    rgba(46, 74, 46, 0.88) 0%,
    rgba(46, 74, 46, 0.4) 50%,
    rgba(0,0,0,0.1) 100%
  )

טקסט — position: absolute, bottom: 25%, width: 100%, text-align: center:

  כותרת ראשית:
    "אוכל אמיתי, ישר מהמקור אליך"
    font-family: Frank Ruhl Libre
    font-size: clamp(42px, 6vw, 80px)
    font-weight: 700
    color: white
    line-height: 1.15

  כתובית:
    "בתי עסק מקומיים, מגדלים קטנים ושכנות שמבשלות בבית"
    font-family: DM Sans
    font-size: 18px
    letter-spacing: 0.12em
    text-transform: uppercase
    color: #EAF3DE
    margin-top: 12px

  search bar:
    margin-top: 32px
    width: min(580px, 88vw)
    background: white
    border-radius: 50px
    padding: 14px 24px
    display: flex, align-items: center, gap: 10px
    אייקון חיפוש (#2e6853) + input
    placeholder: "חפשי ירקות טריים, בשר grass-fed..."
    font-size: 16px, RTL

חץ scroll למטה (animate-bounce):
  position: absolute, bottom: 32px, left: 50%
  color: white, opacity: 0.7
  גודל: 28px
```

---

## Social Proof Bar

מיקום: מיד אחרי ה-Hero, לפני הקטגוריות

```jsx
<div className="bg-primary text-white py-4 text-center">
  <span className="font-body text-lg tracking-wide">
    {producersCount} יצרנים מאומתים &nbsp;·&nbsp;
    {categoriesCount} קטגוריות &nbsp;·&nbsp;
    מכל רחבי הארץ
  </span>
</div>

// backend: GET /api/stats → { producers_count, categories_count }
```

---

## Parallax Sections (בין סקציות — כמו gardensweet.com)

הוסף 2-3 סקציות parallax בדף הבית בין הגריד ל"מהמטבח של השכן":

```jsx
// SectionDivider component — תמונה שזזה לאט:
<div style={{
  height: '400px',
  backgroundImage: 'url(https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=1600)',
  backgroundAttachment: 'fixed',
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  position: 'relative',
}}>
  <div style={{
    position: 'absolute', inset: 0,
    background: 'rgba(46,74,46,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }}>
    <h2 style={{
      fontFamily: 'Frank Ruhl Libre',
      fontSize: 'clamp(32px, 4vw, 56px)',
      color: 'white',
      textAlign: 'center',
    }}>
      "כשאתה יודע מאיפה האוכל שלך — הכל טועם אחרת"
    </h2>
  </div>
</div>
```

תמונות לשימוש ב-parallax dividers:
- https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=1600 (שדה חיטה)
- https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=1600 (חווה ירוקה)

---

## Category Grid (בהשראת foraged.com/categories)

```
Layout: grid-cols-3 desktop | grid-cols-2 tablet | grid-cols-1 mobile
gap: 20px | padding: 40px

כל כרטיסייה:
  height: 280px
  border-radius: 16px
  overflow: hidden
  position: relative
  cursor: pointer

  תמונת רקע:
    width: 100%, height: 100%
    object-fit: cover
    transition: transform 0.4s ease
    hover: transform scale(1.06)

  overlay:
    position: absolute, inset: 0
    background: rgba(46,104,83,0.65)
    transition: background 0.3s
    hover: rgba(46,104,83,0.45)

  טקסט (מרוכז):
    position: absolute, inset: 0
    display: flex, flex-direction: column
    align-items: center, justify-content: center
    emoji: font-size 40px, margin-bottom 8px
    שם: Frank Ruhl Libre, 22px, white, font-weight 700
```

| קטגוריה | תמונה Unsplash |
|----------|----------------|
| 🥩 בשר, עוף ודגים | photo-1607623814075-e51df1bdc82f |
| 🥬 ירקות, פירות ומשקים | photo-1540420773420-3366772f4999 |
| 🥛 חלב וגבינות | photo-1486297678162-eb2a19b0a432 |
| 🍞 לחמים ואפייה | photo-1509440159596-0249088772ff |
| 🫒 שמנים ודבש | photo-1474979266404-7eaacbcd87c5 |
| 🧴 טיפוח וסבונים | photo-1608248597279-f99d160bfcbc |

URL: `https://images.unsplash.com/[photo-id]?w=600&fit=crop&auto=format`

---

## כרטיסיית עסק (ProducerCard)

> Redesigned April 2026 (Phases A → B → C). Entire card is the navigation
> target; the heart is the only secondary action. No inline contact icons
> — `ProducerListOut` doesn't carry `phone` / `website` / `instagram`, so
> a row of 5 icons was dead code on every grid view.

```css
.producer-card {
  background: #F5F0E8;
  border: 1px solid #e8e0d0;
  border-radius: 16px;   /* Tailwind rounded-2xl */
  overflow: hidden;
  transition: box-shadow 0.2s, transform 0.2s;
}
.producer-card:hover {
  box-shadow: 0 8px 32px rgba(46,104,83,0.12);
  transform: translateY(-2px);
}
```

**Anatomy**

```
image (aspect-square on mobile → lg:aspect-[4/3]):
  object-cover object-center
  Cloudinary: c_fill,g_auto,ar_4:3 — saliency-aware smart crop
  top-3 start-3 overlay: ♡ heart button (white circle 44×44,
    HeartStraight icon, aria-pressed, z-10)

body (p-4, flex-col, flex-1):
  name row (flex justify-between items-baseline):
    ── h3 Frank Ruhl Libre 18px bold #1C1A17, 2-line clamp
    ── rating span (dir="ltr", shrink-0): ★ 4.8 · 12
       shown only when reviews_count >= 3 AND avg_rating > 0

  location line (13px #6b6b6b, flex items-center gap-1.5):
    ● dot 8×8 (green #4cb08b = available_today, orange #EF9F27 = vacation)
    {city}[ · {distance dir="ltr"}]

  description line (14px #1C1A17/85, line-clamp-1):
    short_description → top_product_name (80-char soft cap, then "…")
    entire row hidden when both null

  BadgeRow(producer, limit=2) — max 2 pills by priority:
    verified > recommended > new > organic > grass_fed > kosher > delivery > products

  footer (mt-auto pt-3 flex justify-between — no border-top):
    start: price label (max-w-[120px] truncate, #8B6914, 600)
    end:   primary_contact_method hint icon (decorative, 18px)
```

**Heart button contract**
- Logged-in tap → optimistic fill → `POST /users/me/favorites/{id}` → revert + error toast on failure.
- Logged-out tap → local fill + `sessionStorage["post_login_action"] = "favorite:{id}"` → snackbar toast with `התחברי` link (`/login?next=…`). `AuthContext.afterLogin` drains the pending action on next sign-in.
- Hidden when `user.producer_id === producer.id` (producer viewing own card).
- Uses `start-3` physical-RTL convention (project enforces logical properties via `no-restricted-syntax`).

**What's explicitly NOT on the card (moved to detail)**
- Contact icon row (WhatsApp / phone / website / email / Instagram).
- "פרמיום" plan overlay.
- "גלי עוד" / "מידע נוסף" text CTA.
- "זמין היום" pill overlay (folded into the location-line dot).
- Rating when `reviews_count < 3` (gate avoids misleadingly authoritative "★ 5.0 · 1" lines).

---

## אנימציות Scroll (כמו gardensweet.com)

הוסף fade-in לכל הסקציות — עם Intersection Observer:

```jsx
// hooks/useFadeIn.js
export const useFadeIn = () => {
  const ref = useRef(null)
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1'
          entry.target.style.transform = 'translateY(0)'
        }
      },
      { threshold: 0.15 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  return ref
}

// שימוש:
// style={{ opacity: 0, transform: 'translateY(30px)', transition: 'all 0.7s ease' }}
// ref={useFadeIn()}
```

---

## Footer

```
background: #2E4A2E | color: #EAF3DE | padding: 48px 0

3 עמודות (desktop):

עמודה 1 — לוגו + תיאור:
  לוגו מהמקור (גרסה לבנה)
  "ישר מהמקור אליך"
  אינסטגרם: אייקון + "@meha_makor"
  → https://www.instagram.com/meha_makor (new tab)

עמודה 2 — ניווט:
  דף הבית | מפה | בתי עסק | אירועים | מהמטבח של השכן | הוסף עסק

עמודה 3 — ניוזלטר:
  כותרת: "הישארי מעודכנת" (Frank Ruhl Libre, 22px)
  תת-כותרת: "מוצרים חדשים, אירועים ועסקים ישר לתיבה שלך"
  input email + כפתור "הצטרפי"
  POST /newsletter → newsletter_subscribers
  success: "ברוכה הבאה למהמקור 🌱 נפגשות בתיבה"
  עיצוב input: border: 1px solid rgba(255,255,255,0.3), bg: transparent, color white

שורה תחתונה:
  © 2026 מהמקור | תנאי שימוש | פרטיות
```

---

## עמוד /about — סקציות חדשות (הוסף בסוף)

### סקציה A — Parallax Quote
```
תמונת רקע parallax:
  url: https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=1600
  background-attachment: fixed | height: 350px
  overlay: rgba(46,74,46,0.7)
  ציטוט מרוכז לבן, Frank Ruhl Libre, italic, 36px:
  "כשאתה יודע מאיפה האוכל שלך — הכל טועם אחרת"
```

### סקציה B — 3 עמודות ערכים
```
background: #2e6853 | padding: 64px 0
3 עמודות עם SVG line-art לבן (50px):

  🏡 "המשימה"
  ליצור הזדמנויות כלכליות ליצרנים מקומיים
  ולחבר קהילות עם יתרונות אוכל מקומי.

  🌳 "קהילה"
  כפלטפורמה מונעת ערכים, הקהילה היא העדיפות.
  חיבור בין אנשים הוא המוקד של כל מה שאנחנו עושים.

  🌾 "למה מהמקור"
  מערכות המזון הגלובליות שבירות.
  מקורות מזון מקומיים יכולים להסתגל ולהתמיד.
```

### סקציה C — סיפור המייסדת
```
background: #F5F0E8 | padding: 80px 0

layout RTL:
  תמונה מימין — placeholder עגול 380x380px,
                 border-radius: 16px
                 (הערה בקוד: // TODO: replace with real photo)
  טקסט משמאל

  "היי, אני ספיר."
  Frank Ruhl Libre, 52px, #1C1A17

  DM Sans, 18px, line-height: 1.85, #3a3a3a:
  "אמא, מחפשת אוכל אמיתי, ובעלת מהמקור.

  כמו הרבה משפחות, התחלנו לחפש מקורות
  מזון מקומיים ובריאים יותר. וגילינו שזה
  לוקח המון צעדים — לשאול בקבוצות ווטסאפ,
  לגוגל, לחפש באינסטגרם...

  עם כל הטכנולוגיה שיש לנו, זה לא אמור
  להיות כל כך מסובך. אז מהמקור נולד."
```

### סקציה D — טופס יצירת קשר
```
background: #F5F0E8 | padding: 64px 0

"דברי איתנו" — Frank Ruhl Libre, 40px, מרוכז
"שאלות, רעיונות, או סתם שלום — נשמח לשמוע"
DM Sans, 17px, #6b6b6b, מרוכז

טופס max-width 560px, margin: auto:
  שם מלא | אימייל | textarea "איך נוכל לעזור?" (4 שורות)
  כפתור "שלח" — background: #2e6853, white, border-radius: 8px
  POST /api/contact → מייל לאדמין
  success: "תודה! נחזור אליך בקרוב 🌿"

עיצוב שדות:
  background: white | border: 1px solid #e8e0d0
  border-radius: 8px | padding: 12px 16px
  focus: border-color #2e6853, outline: none
```

---

## Endpoints חדשים הנדרשים
```
GET  /api/stats       → { producers_count, categories_count }
POST /api/newsletter  { email } → 201 (שמור ב-newsletter_subscribers)
POST /api/contact     { name, email, message } → שלח מייל לאדמין → 200
```

---

## Producer Detail Page — עיצוב (feature/meh-producer-detail-redesign, 2026-04-18)

### עמודות

- **Mobile**: עמוד ראשי (main column) קודם, `<aside>` שני. אין `order-` classes — DOM order הוא הסדר.
- **Desktop** (`lg:grid-cols-[1fr_320px]`): RTL grid — main column ימין, sidebar שמאל. `lg:sticky lg:top-24` ב-sidebar.

### Gallery placeholder (ללא תמונות)

- גובה: `h-[120px] md:h-[180px]`, רקע `#F5F0E8`
- מרכז: emoji קטגוריה (48px) + 2 אותיות ראשונות שם העסק (14px bold, `#2e6853` opacity-60)
- כאשר יש תמונות: `h-52` (208px), `priority={true}` על התמונה הראשונה

### StickyContactBar (mobile only)

- `fixed bottom-16 inset-x-0 z-[598]` — מתחת ל-CookieBanner (z-[599]) ו-BottomNav (z-[1000])
- IO trigger: `inlineCTARef` — כשה-CTA יוצא מה-viewport → הבר נכנסת (translateY 0, 200ms ease-out)
- כשה-CTA חוזר → הבר יוצאת (translateY 100%, 150ms ease-in)
- `paddingBottom: env(safe-area-inset-bottom, 0px)` לתמיכה ב-iPhone notch
- **Vacation state**: CTA בצבע `#6EAF8A`, label → "שלחי הודעה — יחזרו בקרוב", opacity 0.85

### Vacation UI

- Main column: `bg-amber-50 border border-amber-300 rounded-xl p-3` banner עם "🌿 בית עסק זה בהפסקה כרגע"
- Sidebar: `opacity-50 pointer-events-auto` עטיפה מעל כל תוכן ה-contact

### Highlights strip

- תנאי: אחד מהשדות `grass_fed / organic_certified / delivery_areas.length > 0 / kosher` הוא truthy
- סגנון chip: `background #EAF3DE, color #1C1A17, border 1px solid #e8e0d0, border-radius 20px, font-size 11px, padding 4px 10px`
- Label מיפוי: grass_fed → "🌾 מרעה חופשי", organic_certified → "🌿 אורגני מוסמך", delivery → "🚚 משלוח", kosher → "✡️ כשר"

---

## אחרי כל שינויי עיצוב — הרץ:
```bash
npx skills add pbakaus/impeccable
/audit
/polish homepage
/polish producer-card
/polish about-page
/normalize
/critique
```
