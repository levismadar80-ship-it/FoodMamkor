# מהמקור — Checklist לפני השקה + תיקוני עיצוב

> קרא CLAUDE.md קודם. עדכן CLAUDE.md בסוף.

---

## עיקרון מנחה — בדוק כל שינוי לפיו

**מהמקור = חם, אישי, שוק איכרים, שכנה שמבשלת בבית.**
לפני כל קוד שאלי: "האם זה מרגיש כמו tech startup או כמו שוק מקומי?"
אם startup — פשט אותו.

---

## תיקוני עיצוב — דברים שמוגזמים מדי

### תיקון 1 — Login: החזר לבהיר

```jsx
// ❌ מחק: dark mode, split layout, background שחור
// ✅ החלף בזה:

<div style={{
  minHeight: '100vh',
  background: '#F5F0E8',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
}}>
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5 }}
    style={{
      background: 'white',
      borderRadius: 20,
      padding: '48px 40px',
      width: '100%',
      maxWidth: 400,
      boxShadow: '0 4px 32px rgba(46,104,83,0.08)',
      textAlign: 'center',
    }}
  >
    {/* לוגו */}
    <div style={{ fontFamily: 'Frank Ruhl Libre', fontSize: 28, color: '#2e6853', marginBottom: 8 }}>
      מהמקור
    </div>
    <p style={{ color: '#6b6b6b', fontSize: 14, marginBottom: 32 }}>
      ברוכה הבאה 🌿
    </p>

    {/* Google + Apple */}
    <GoogleLoginButton />
    <AppleLoginButton />

    {/* Divider */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
      <div style={{ flex: 1, height: 1, background: '#e8e0d0' }} />
      <span style={{ color: '#aaa', fontSize: 13 }}>או</span>
      <div style={{ flex: 1, height: 1, background: '#e8e0d0' }} />
    </div>

    {/* אימייל + סיסמה */}
    <form style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <WarmInput placeholder="אימייל" type="email" />
      <WarmInput placeholder="סיסמה" type="password" />
      <button style={{
        background: '#2e6853', color: 'white',
        border: 'none', borderRadius: 10,
        padding: 14, fontSize: 15, cursor: 'pointer',
      }}>
        כניסה
      </button>
    </form>
  </motion.div>
</div>
```

### תיקון 2 — "איך זה עובד": פשט ל-3 כרטיסיות

```jsx
// ❌ מחק: sticky scroll מורכב עם useScroll
// ✅ החלף ב-3 כרטיסיות פשוטות עם fade-in:

<section style={{ background: '#F5F0E8', padding: '80px 24px' }}>
  <motion.h2
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    style={{
      fontFamily: 'Frank Ruhl Libre',
      fontSize: 'clamp(28px, 4vw, 44px)',
      textAlign: 'center', color: '#1C1A17',
      marginBottom: 56,
    }}
  >
    איך זה עובד?
  </motion.h2>

  <div style={{
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 32, maxWidth: 900, margin: '0 auto',
  }}>
    {[
      { emoji: '🗺️', num: '01', title: 'גלי בתי עסק', desc: 'חפשי לפי קטגוריה, עיר, או גרירה על המפה' },
      { emoji: '💬', num: '02', title: 'צרי קשר ישיר', desc: 'לחצי WhatsApp ודברי ישירות עם הבעלים' },
      { emoji: '🛒', num: '03', title: 'קני מקומי', desc: 'אסופי עצמאית או בקשי משלוח לבית' },
    ].map((step, i) => (
      <motion.div
        key={step.num}
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: i * 0.12, duration: 0.6 }}
        style={{
          background: 'white',
          borderRadius: 16,
          padding: '32px 24px',
          textAlign: 'center',
          border: '1px solid #e8e0d0',
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 12 }}>{step.emoji}</div>
        <div style={{ fontSize: 11, color: '#2e6853', letterSpacing: '0.15em', marginBottom: 8 }}>
          {step.num}
        </div>
        <h3 style={{ fontFamily: 'Frank Ruhl Libre', fontSize: 20, marginBottom: 8 }}>
          {step.title}
        </h3>
        <p style={{ fontFamily: 'DM Sans', color: '#6b6b6b', fontSize: 14, lineHeight: 1.6 }}>
          {step.desc}
        </p>
      </motion.div>
    ))}
  </div>
</section>
```

### תיקון 3 — הוסף Organic Texture לרקע

```css
/* globals.css — הוסף טקסטורת נייר עדינה */
body {
  background-color: #F5F0E8;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='400' height='400' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");
}
```

### תיקון 4 — הוסף סיפור ספיר בדף הבית

```jsx
// הוסף אחרי Category Grid — לפני הגריד של עסקים:

<motion.section
  initial={{ opacity: 0 }}
  whileInView={{ opacity: 1 }}
  viewport={{ once: true }}
  style={{
    background: 'white',
    padding: '48px 40px',
    maxWidth: 900,
    margin: '0 auto 48px',
    borderRadius: 20,
    border: '1px solid #e8e0d0',
    display: 'flex',
    alignItems: 'center',
    gap: 32,
  }}
>
  {/* תמונת ספיר — placeholder עד שיש תמונה */}
  <div style={{
    width: 80, height: 80, borderRadius: '50%',
    background: '#EAF3DE', flexShrink: 0,
    display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 32,
  }}>
    🌿
  </div>
  <div>
    <p style={{
      fontFamily: 'Frank Ruhl Libre',
      fontSize: 18, color: '#1C1A17',
      lineHeight: 1.6, marginBottom: 8,
      fontStyle: 'italic',
    }}>
      "מצאתי grass-fed ליד הבית רק אחרי שעתיים בקבוצות ווטסאפ.
      בניתי את מהמקור כדי שלך זה ייקח 30 שניות."
    </p>
    <a href="/about" style={{
      fontFamily: 'DM Sans', fontSize: 13,
      color: '#2e6853', textDecoration: 'none',
    }}>
      ספיר, מייסדת מהמקור →
    </a>
  </div>
</motion.section>
```

---

## Checklist לפני השקה

### שבוע 1 — ביצועים ובסיס

```
□ Lighthouse score:
  □ Performance > 85
  □ SEO > 90
  □ Accessibility > 85
  □ Best Practices > 90

□ תמונות מאופטמות:
  □ כל תמונה דרך Cloudinary עם ?w=600&f=auto
  □ lazy loading על כרטיסיות
  □ alt text על כל תמונה

□ SEO:
  □ כל עמוד עסק — title + description + og:image
  □ sitemap.xml אוטומטי
  □ robots.txt
  □ schema.org לעסקים מקומיים
```

### שבוע 2 — תוכן ואמון

```
□ Seed data — לפני השקה:
  □ לפחות 8 בתי עסק אמיתיים עם תמונות
  □ 2-3 קטגוריות מאוכלסות
  □ לפחות 3 ערים שונות

□ Trust signals:
  □ תמונה אמיתית של ספיר ב-/about
  □ ביקורת ראשונה אמיתית (אפילו מחברה/בן משפחה)
  □ מספר עסקים בולט בדף הבית

□ WhatsApp CTA בכל עמוד עסק:
  קישור: https://wa.me/[מספר]?text=היי!+מצאתי+אותך+במהמקור
```

### שבוע 3 — חוויה מלאה

```
□ Welcome email אחרי הרשמה
□ דף 404 יפה עם כיוון לדף הבית
□ דף שגיאה כללי
□ Cookies banner
□ נגישות:
  □ כפתור נגישות בפינה
  □ contrast ratio תקין
  □ ניווט עם מקלדת עובד
```

### שבוע 4 — בדיקות אמיתיות

```
□ 5 אנשים שאינם מכירים את האתר ניסו להשתמש בו
□ בדיקה על: iPhone 13, Samsung Galaxy, iPad
□ בדיקה על: Chrome, Safari, Firefox
□ בדיקה על: 3G (האם נטען תוך 3 שניות?)
□ Security review (SECURITY.md) — כל 🔴 תוקן
□ 3 יצרנים ניסו להירשם בעצמם בלי עזרה
```

### לפני הדומיין — חובה

```
□ כל 13 שלבי הבדיקה ב-ROADMAP.md עברו
□ .env.production מוגדר נכון
□ HTTPS פעיל
□ backup אוטומטי של DB
□ Monitoring (Sentry לשגיאות)
```

---

## עדכן CLAUDE.md:

```
עדכן CLAUDE.md:
## עיקרון עיצוב מרכזי
מהמקור = חם, אישי, שוק איכרים. לא tech startup.
כל שינוי עיצובי — שאל: "האם זה מרגיש כמו שוק מקומי?"

## תיקונים שבוצעו
- Login: בהיר (#F5F0E8 + white card), לא dark mode
- "איך זה עובד": 3 כרטיסיות פשוטות, לא sticky scroll
- טקסטורת נייר עדינה ברקע
- סיפור ספיר מוסיף בדף הבית (לפני גריד עסקים)
```
