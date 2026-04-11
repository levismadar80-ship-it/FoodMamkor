# מהמקור — סקירה מקיפה: מה עוד חסר

---

## ❌ דברים שעוד לא טופלו כלל

### 1. Open Graph / Social Sharing
כשמישהי תשתף קישור לאתר בוואטסאפ או אינסטגרם — 
מה תראה? כרגע כנראה כלום.

```jsx
// בכל עמוד — הוסף ב-head:
<meta property="og:title" content="מהמקור — אוכל אמיתי ישר מהמקור אליך" />
<meta property="og:description" content="בתי עסק מקומיים, מגדלים קטנים ושכנות שמבשלות בבית" />
<meta property="og:image" content="https://mehamakor.co.il/og-image.jpg" />
<meta property="og:url" content="https://mehamakor.co.il" />

// לעמוד עסק ספציפי:
<meta property="og:title" content={`${producer.name} — ${producer.city} | מהמקור`} />
<meta property="og:image" content={producer.images[0]} />
```

צרי תמונת OG: **1200x630px** עם לוגו מהמקור + תמונת אוכל יפה.

---

### 2. Favicon
כרגע מציג את הברירת מחדל של הדפדפן.

```
/public/favicon.ico — לוגו מהמקור 32x32px
/public/favicon-192.png — לאנדרואיד
/public/apple-touch-icon.png — לאייפון 180x180px
```

---

### 3. Analytics — איך תדעי שהאתר עובד?
בלי analytics את עיוורת. הכי פשוט:

```js
// Google Analytics 4 — חינם
// הוסף ל-app/layout.js:
<Script src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXX" />

// Microsoft Clarity — חינם, מציג הקלטות של משתמשים אמיתיים
// 3 שורות קוד, ממש קל להתקין
```

---

### 4. Error Monitoring — לדעת על באגים בזמן אמת

```bash
npm install @sentry/nextjs

# כשמשתמש נתקל בשגיאה — תקבלי אימייל מיד
# חינם עד 5,000 שגיאות בחודש
```

---

### 5. תמונת Placeholder יפה
כרגע כשאין תמונה — מציג emoji קטן מכוער.

```jsx
// components/ImageWithFallback.jsx
export default function ImageWithFallback({ src, alt, ...props }) {
  const [error, setError] = useState(false)

  if (error || !src) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #EAF3DE 0%, #c9e2d3 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        ...props.style,
      }}>
        <span style={{ fontSize: 40 }}>🌿</span>
      </div>
    )
  }

  return <img src={src} alt={alt} onError={() => setError(true)} {...props} />
}
```

---

### 6. WhatsApp Share Button
כל עמוד עסק צריך כפתור שיתוף לוואטסאפ — זה ה-viral loop שלך:

```jsx
<a
  href={`https://wa.me/?text=${encodeURIComponent(`מצאתי עסק מגניב במהמקור! 🌿\n${producer.name} — ${producer.city}\nhttps://mehamakor.co.il/${producer.slug}`)}`}
  target="_blank"
  style={{
    display: 'flex', alignItems: 'center', gap: 6,
    color: '#25D366', fontSize: 13, fontFamily: 'DM Sans',
    textDecoration: 'none',
  }}
>
  <WhatsappLogo size={16} weight="fill" />
  שתפי עם חברות
</a>
```

---

### 7. "גם בתי עסק מהאזור שלך" — גיאוגרפי

```jsx
// כשמשתמש נכנס לאתר — שאלי אם לזהות מיקום:
useEffect(() => {
  if (navigator.geolocation && !userCity) {
    navigator.geolocation.getCurrentPosition(pos => {
      // Reverse geocoding → קבלי שם עיר
      fetchCityFromCoords(pos.coords.latitude, pos.coords.longitude)
        .then(city => setUserCity(city))
    })
  }
}, [])

// בדף הבית:
{userCity && (
  <p style={{ textAlign: 'center', color: '#6b6b6b', fontSize: 14 }}>
    מציגה עסקים קרוב ל{userCity} 📍
  </p>
)}
```

---

### 8. Skeleton Loading — כרגע אין

```jsx
// ProducerCardSkeleton:
function ProducerCardSkeleton() {
  return (
    <div style={{
      background: 'white', borderRadius: 16,
      overflow: 'hidden', border: '1px solid #e8e0d0',
    }}>
      <div style={{
        height: 200,
        background: 'linear-gradient(90deg, #e8e0d0 25%, #f5f0e8 50%, #e8e0d0 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite',
      }} />
      <div style={{ padding: 16 }}>
        <div style={{ height: 20, background: '#e8e0d0', borderRadius: 4, marginBottom: 8, width: '60%' }} />
        <div style={{ height: 14, background: '#f5f0e8', borderRadius: 4, width: '40%' }} />
      </div>
    </div>
  )
}

// CSS:
// @keyframes shimmer { 0%{background-position: -200% 0} 100%{background-position: 200% 0} }
```

---

### 9. Print CSS — לא קריטי אבל מקצועי

```css
/* globals.css */
@media print {
  .navbar, .footer, .whatsapp-btn { display: none; }
  body { background: white; color: black; }
  a[href]:after { content: " (" attr(href) ")"; }
}
```

---

## ⚠️ דברים שטופלו חלקית — צריכים בדיקה

### 10. Consistent Spacing
כל section gap צריך להיות עקבי:
```css
section { padding: 80px 0; }           /* desktop */
@media (max-width: 768px) {
  section { padding: 48px 0; }         /* mobile */
}
```

### 11. Font Loading — Flash of Unstyled Text
```html
<!-- בlayout.js הוסף preload: -->
<link rel="preload" href="..." as="font" crossOrigin="anonymous" />
```

### 12. Images — WebP Format
```
כל תמונת Cloudinary — הוסף /f_auto,q_auto לURL:
https://res.cloudinary.com/xxx/image/upload/f_auto,q_auto/v1/...
                                              ^^^^^^^^^^
```

---

## 🧪 בדיקות שחברות גדולות עושות

### בדיקה 1 — 5-Second Test (חינם)
```
כנסי ל: usabilityhub.com
העלי תמונה של דף הבית
שאלי: "מה האתר הזה עושה?"
5 אנשים זרים → אם לא מבינים = hero לא ברור
```

### בדיקה 2 — Heatmap (Microsoft Clarity)
```
clarity.microsoft.com — חינם לגמרי
מותקן ב-5 דקות
רואה:
  - איפה אנשים לוחצים
  - עד איפה גוללים
  - "rage clicks" — לחיצות מתוסכלות
```

### בדיקה 3 — Real Device Testing
```
browserstack.com — ניסיון חינם
בדקי על:
  iPhone 13 Safari ← הכי חשוב לישראל
  Samsung Galaxy Chrome
  iPad Safari
```

### בדיקה 4 — Lighthouse (כבר יש בקוד)
```bash
npx lighthouse http://localhost:3000 --view
# מטרות:
# Performance > 85
# SEO > 90  
# Accessibility > 85
# Best Practices > 90
```

### בדיקה 5 — Dead Links
```bash
npx broken-link-checker http://localhost:3000
# מוצא כל לינק שבור באתר
```

### בדיקה 6 — RTL בדיקה ספציפית לעברית
```
בדקי שכל הטקסטים מיושרים ימין
בדקי שcaret בinputs מופיע בצד ימין
בדקי שflows כמו multi-step forms זורמים מימין לשמאל
בדקי שauto-complete של ערים מציג RTL
```

---

## 📋 רשימת הבדיקה הסופית שלי — ספציפית למהמקור

```
עיצוב:
□ כל עמוד — אותם פונטים (Frank Ruhl + DM Sans)
□ כל עמוד — אותם צבעים (#F5F0E8 רקע, #2e6853 primary)
□ favicon מותאם אישית
□ OG image יפה (1200x630px)
□ skeleton loading על כרטיסיות
□ placeholder image יפה (לא emoji)
□ WhatsApp share button בכל עמוד עסק

פונקציונליות:
□ ולידציית אימייל בכניסה
□ כפתור Google OAuth נראה ועובד
□ כפתור Apple OAuth נראה ועובד
□ חיפוש ערים — ישראל בלבד
□ כפתור "חפש באזור זה" במפה
□ hover sync רשימה ↔ מפה
□ "קרוב אלי" במפה

תוכן:
□ אין "Lorem Ipsum" או "Admin" בשום מקום
□ כל התמונות אמיתיות (לא placeholder של Unsplash לאתר חי)
□ תאריך © 2026 בfooter
□ מספר טלפון ואימייל יצירת קשר אמיתיים

טכני:
□ HTTPS פעיל
□ sitemap.xml
□ robots.txt
□ Google Analytics / Clarity מותקן
□ Sentry לשגיאות
□ תמונות WebP דרך Cloudinary f_auto
□ Lighthouse > 85 על כל עמוד

לפני השקה:
□ 5 אנשים שניסו את האתר בלי עזרה
□ 3 יצרנים שניסו להירשם בעצמם
□ בדיקה על iPhone אמיתי
□ Security review — כל 🔴 תוקן
```

---

## לשלוח ל-Claude Code

```
Read CLAUDE.md, then implement these missing items in order:
1. Open Graph meta tags on all pages (og:title, og:description, og:image, og:url)
2. Favicon files (/public/favicon.ico, favicon-192.png, apple-touch-icon.png)
3. ImageWithFallback component — replace all <img> tags
4. Skeleton loading for ProducerCard and HomeListingCard
5. WhatsApp share button on every producer page
6. Add Microsoft Clarity snippet (placeholder — I'll add the real ID later)
7. Add Sentry error monitoring (npm install @sentry/nextjs)
8. Cloudinary images — add f_auto,q_auto to all image URLs
9. Fix spacing consistency: sections 80px desktop, 48px mobile

Update CLAUDE.md after.
```
