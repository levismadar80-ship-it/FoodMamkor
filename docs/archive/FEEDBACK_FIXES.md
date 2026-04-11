# מהמקור — תיקונים מהתמונות + שיפורים כלליים
> קרא CLAUDE.md קודם. עדכן CLAUDE.md בסוף.

---

## תיקון 1 — מהמטבח של השכן: השאר בדף הבית + דף נפרד

```
החלטה: מהמטבח של השכן יופיע בשני מקומות:
1. דף הבית — preview קטן (3 כרטיסיות + "ראי עוד →")  ← השאר!
2. /neighbor — דף נפרד מלא עם גריד + סינון

אל תמחק את הסקציה מדף הבית.
```

---

## תיקון 2 — דף Login: עיצוב מחדש (בהשראת תמונה 2)

```jsx
// עיצוב נקי: לוגו + כותרת + email קודם + Google/Apple מתחת

<div style={{
  minHeight: '100vh',
  background: '#F5F0E8',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}}>
  <div style={{
    background: 'white', borderRadius: 20,
    padding: '48px 40px', width: '100%', maxWidth: 400,
    boxShadow: '0 4px 32px rgba(46,104,83,0.08)',
    textAlign: 'center',
  }}>

    {/* תמונה/לוגו בראש */}
    <div style={{ marginBottom: 24 }}>
      {/* אפשר: תמונת Hero קטנה של ירקות/שוק, או לוגו מהמקור */}
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: '#EAF3DE',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 16px',
        fontSize: 32,
      }}>🌿</div>
      <h2 style={{ fontFamily: 'Frank Ruhl Libre', fontSize: 24, color: '#1C1A17', marginBottom: 6 }}>
        כניסה למהמקור
      </h2>
      <p style={{ fontFamily: 'DM Sans', fontSize: 14, color: '#6b6b6b' }}>
        ברוכה הבאה 🌱
      </p>
    </div>

    {/* Email קודם (כמו AuthKit) */}
    <form style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
      <input
        type="email"
        placeholder="האימייל שלך"
        required
        pattern="[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$"
        style={{
          padding: '13px 16px', borderRadius: 10,
          border: '1px solid #e8e0d0', fontSize: 15,
          fontFamily: 'DM Sans', direction: 'rtl',
          outline: 'none',
        }}
        onInvalid={e => e.target.setCustomValidity('נא להזין אימייל תקין')}
        onInput={e => e.target.setCustomValidity('')}
        onFocus={e => e.target.style.borderColor = '#2e6853'}
        onBlur={e => e.target.style.borderColor = '#e8e0d0'}
      />
      <input
        type="password"
        placeholder="סיסמה (לפחות 8 תווים)"
        required
        minLength={8}
        style={{ /* same */ }}
      />
      <button type="submit" style={{
        background: '#2e6853', color: 'white',
        border: 'none', borderRadius: 10,
        padding: 14, fontSize: 15,
        fontFamily: 'DM Sans', cursor: 'pointer',
      }}>
        כניסה
      </button>
    </form>

    {/* Divider */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
      <div style={{ flex: 1, height: 1, background: '#e8e0d0' }} />
      <span style={{ color: '#aaa', fontSize: 13, fontFamily: 'DM Sans' }}>או</span>
      <div style={{ flex: 1, height: 1, background: '#e8e0d0' }} />
    </div>

    {/* Google — כפתור מלא עם לוגו */}
    <button onClick={handleGoogleLogin} style={{
      width: '100%', display: 'flex', alignItems: 'center',
      justifyContent: 'center', gap: 10,
      border: '1px solid #e8e0d0', background: 'white',
      borderRadius: 10, padding: '12px 16px',
      fontFamily: 'DM Sans', fontSize: 15, cursor: 'pointer',
      marginBottom: 10, transition: 'background 0.2s',
    }}
    onMouseEnter={e => e.currentTarget.style.background = '#f8f8f8'}
    onMouseLeave={e => e.currentTarget.style.background = 'white'}>
      <img src="https://www.google.com/favicon.ico" width={18} height={18} />
      המשיכי עם Google
    </button>

    {/* Apple — שחור */}
    <button onClick={handleAppleLogin} style={{
      width: '100%', display: 'flex', alignItems: 'center',
      justifyContent: 'center', gap: 10,
      background: 'black', color: 'white',
      border: 'none', borderRadius: 10,
      padding: '12px 16px', fontFamily: 'DM Sans',
      fontSize: 15, cursor: 'pointer', marginBottom: 20,
    }}>
       המשיכי עם Apple
    </button>

    <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: '#6b6b6b' }}>
      אין חשבון?{' '}
      <a href="/register" style={{ color: '#2e6853', textDecoration: 'none' }}>
        הצטרפי
      </a>
    </p>
  </div>
</div>
```

**ולידציית אימייל:**
```js
// בbackend — FastAPI:
from pydantic import EmailStr

class UserLogin(BaseModel):
    email: EmailStr  // ← Pydantic מאמת אוטומטית
    password: str

// שגיאה ברורה:
// 422: "כתובת האימייל אינה תקינה"
```

---

## תיקון 3 — Parallax Divider: משפט חדש

```jsx
// החלף את המשפט הקיים:

// ❌ "מצאתי בשר grass-fed ליד הבית רק אחרי שעתיים בקבוצות ווטסאפ..."

// ✅ החלף ב:
quote="כשאתה יודע מאיפה האוכל שלך — הכל טועם אחרת"

// או אחד מהאפשרויות האלה:
// "אוכל אמיתי, מאנשים אמיתיים, ממש ליד הבית"
// "כי מה שאוכלים — חשוב. ומאיפה קונים — חשוב יותר"
```

---

## תיקון 4 — /about: Navbar וטקסטים

### א. Navbar ב-/about — הסר breadcrumb
```jsx
// ❌ הסר: "בית › אודות" מה-navbar
// ✅ ה-navbar הרגיל מספיק — ללא breadcrumb בדף about
// breadcrumb מתאים רק לדפי עסקים ומפה
```

### ב. הסר את הטקסט המוזר
```
// ❌ מחק לגמרי:
"חפשי בתי עסק קרובים דרך המפה, גריד הקטגוריות או שורת החיפוש"

// זה לא מתאים לדף about — יש CTA בתחתית הדף
```

### ג. "הסיפור שלנו" — טקסט מעודכן
```
הסיפור שלנו

מהמקור נולדה מתוך צורך אמיתי — למצוא אוכל אמיתי, לא מעובד.
בשר מחקלאים, גבינות אמיתיות, לחם מחמצת שמישהו הכין בבית,
משקאות חקלאיים וירקות שגדלו באדמה ישראלית.

אבל למצוא את כל זה? זה היה מסע.
לרוץ אחרי מודעה בפייסבוק לפני שתפוג, לעקוב אחרי עמוד אינסטגרם
של מישהי מהכפר, לשאול בקבוצת ווטסאפ של השכונה ולקוות שמישהי תענה.

הכל היה מפוזר — קשה למצוא, קשה להגיע, קשה לסמוך.

מהמקור שמה הכל במקום אחד.
פלטפורמה שמרכזת בתי עסק מקומיים, מגדלים קטנים,
ושכנות שמבשלות בבית. פשוט, נגיש, ואמיתי.
```

---

## תיקון 5 — /about: כפתור "הוסף" חסר

```jsx
// בסקציית CTA בסוף /about — הוסף שני כפתורות:
<div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 32 }}>
  <a href="/register/business" style={{
    background: '#2e6853', color: 'white',
    padding: '14px 32px', borderRadius: 50,
    textDecoration: 'none', fontFamily: 'DM Sans', fontSize: 15,
  }}>
    + הוסיפי את העסק שלך
  </a>
  <a href="/map" style={{
    border: '1px solid #2e6853', color: '#2e6853',
    padding: '14px 32px', borderRadius: 50,
    textDecoration: 'none', fontFamily: 'DM Sans', fontSize: 15,
    background: 'white',
  }}>
    גלי עסקים קרובים
  </a>
</div>
```

---

## תיקון 6 — /about: תמונות וצבעים חסרים

```
הוסף תמונות אמיתיות לסקציות:

סקציית "הסיפור שלנו":
  background image (parallax):
  url: https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=1600
  (שוק ירקות)

סקציית 4 ערכים:
  🌿 ללא מעובד → background: #EAF3DE
  🥩 חומרי גלם מזוהים → background: #FFF3E0
  🏡 ייצור קטן → background: #E8F5E9
  🌱 טרי ואמיתי → background: #F3E5F5

סקציית המייסדת:
  placeholder: תמונת פרופיל עם border-radius: 50%
  (הערה בקוד: // TODO: replace with real photo of Sapir)
```

---

## תיקון 7 — באג: חיפוש עיר מציג ערים ערביות/סוריות

```
בתמונה האחרונה — החיפוש "זכ" מציג "מחאפצת ריף דמשק"
הסיבה: Google Places לא מוגבל לישראל

תיקון:
autocomplete = new google.maps.places.Autocomplete(input, {
  componentRestrictions: { country: 'il' },  // ← ישראל בלבד!
  types: ['(cities)'],
  language: 'he',
})
```

---

## פיצ'ר חדש — התראות על מוצרים חדשים מבית עסק

```sql
-- DB:
CREATE TABLE producer_followers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  producer_id uuid REFERENCES producers(id),
  notify_new_products bool DEFAULT true,
  notify_back_in_stock bool DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, producer_id)
);
```

```
-- API:
POST /producers/:id/follow    → עקוב אחרי עסק
DELETE /producers/:id/follow  → הפסק לעקוב
GET /users/me/following        → רשימת עסקים שעוקבת אחריהם

-- טריגרים לשליחת התראה (Twilio/Push):
1. כשעסק מוסיף מוצר חדש → שלח push notification לעוקבים
2. כשמוצר חוזר למלאי (is_available_today → true) → התראה
```

```jsx
// כפתור "עקבי" בעמוד עסק:
<button
  onClick={toggleFollow}
  style={{
    display: 'flex', alignItems: 'center', gap: 6,
    border: '1px solid #2e6853',
    background: isFollowing ? '#2e6853' : 'white',
    color: isFollowing ? 'white' : '#2e6853',
    padding: '8px 16px', borderRadius: 8,
    fontFamily: 'DM Sans', fontSize: 13, cursor: 'pointer',
  }}
>
  {isFollowing ? '🔔 עוקבת' : '🔔 עקבי אחרי עסק זה'}
</button>

// הודעת push:
"[שם עסק] הוסיפו מוצר חדש: [שם מוצר] 🌿"
"[שם עסק] חזרו למלאי! לחצי לפרטים →"
```

---

## רשימת בדיקות נוספות לפני השקה

### בדיקות UX שחברות גדולות עושות:
```
□ 5-second test: הראי את דף הבית ל-5 אנשים זרים ל-5 שניות
  → שאלי: "מה האתר הזה עושה?" — אם לא יודעים = hero לא ברור

□ User test: תני ל-3 אנשים למצוא "בית עסק לגבינות בחיפה"
  → מדדי: כמה קליקים, איפה נתקעו

□ Mobile thumb test: כל הכפתורים לפחות 44x44px?
  → כל מה שקטן יותר — קשה ללחוץ עם אגודל

□ Color contrast: כל טקסט עובר WCAG AA?
  → npx accessibility-checker http://localhost:3000

□ Load time test:
  → https://pagespeed.web.dev
  → מטרה: < 3 שניות על 4G
```

### כלי בדיקה מומלצים:
```
1. Hotjar (חינם) — הקלטת sessions אמיתיים
   → רואים בדיוק איפה אנשים לוחצים ואיפה עוזבים

2. Microsoft Clarity (חינם) — heatmaps + recordings
   → מצוין לראות "dead clicks" (לחיצות על דברים שלא קישורים)

3. Google PageSpeed Insights
   → https://pagespeed.web.dev/?url=http://localhost:3000

4. WAVE accessibility checker
   → https://wave.webaim.org

5. BrowserStack (ניסיון חינם)
   → בדיקה על אייפון אמיתי, Samsung, iPad
```

---

## דברים שעוד חסרים (לא טופלו עד כה)

```
□ Loading state על כפתור WhatsApp (כדי שלא ילחצו פעמיים)
□ "מוכר: Admin" — צריך להציג שם אמיתי של המוכר, לא "Admin"
□ תמונת placeholder יפה כשאין תמונה למוצר ביתי
  (כרגע מציג emoji קטן — לא מספיק)
□ כרטיסיית מוצר ביתי: גובה אחיד בין כרטיסיות בגריד
□ /about: טעינת תמונות איטית — הוסף loading="lazy"
□ אין favicon מותאם אישית — מציג ברירת מחדל של דפדפן
  → הוסף: /public/favicon.ico עם לוגו מהמקור
```

---

## עדכן CLAUDE.md:
```
עדכן CLAUDE.md:
- Login: email קודם + Google + Apple, ולידציית EmailStr
- /about: ללא breadcrumb, טקסט "הסיפור שלנו" מעודכן, 2 כפתורות CTA
- parallax quote: "כשאתה יודע מאיפה האוכל שלך — הכל טועם אחרת"
- Google Places: componentRestrictions: { country: 'il' } + types: ['(cities)']
- producer_followers: follow/unfollow, push notifications
- מהמטבח של השכן: נשאר בדף הבית (preview) + /neighbor (מלא)
- חסר: favicon, placeholder תמונה, שם מוכר אמיתי
```
