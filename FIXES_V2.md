# מהמקור — תיקונים ושיפורים נוספים
> קרא CLAUDE.md קודם. בצע לפי הסדר. עדכן CLAUDE.md בסוף.

---

## תיקון 1 — רשימת ערים בישראל עם חיפוש (Autocomplete)

### בכל מקום באתר שיש שדה "עיר" או "שכונה" — החלף ב-CitySelect component.

```jsx
// components/CitySelect.jsx
import { useState } from 'react'

const ISRAEL_CITIES = [
  'אבו גוש', 'אבו סנאן', 'אור יהודה', 'אור עקיבא', 'אילת',
  'אלעד', 'אפרת', 'אריאל', 'אשדוד', 'אשקלון',
  'באר שבע', 'באר יעקב', 'באר שבע', 'בית דגן', 'בית שאן',
  'בית שמש', 'בני ברק', 'בני עי"ש', 'בקה אל-גרבייה', 'בת ים',
  'גבעת שמואל', 'גבעתיים', 'גדרה', 'גן יבנה',
  'דימונה', 'טבריה', 'טייבה', 'טירה', 'טירת כרמל', 'טמרה',
  'יבנה', 'יהוד-מונוסון', 'יוקנעם עילית', 'ירושלים',
  'כפר יונה', 'כפר סבא', 'כפר קאסם', 'כרמיאל',
  'לוד', 'מגדל העמק', 'מודיעין-מכבים-רעות', 'מעלה אדומים',
  'מעלות-תרשיחא', 'נהריה', 'נס ציונה', 'נצרת', 'נצרת עילית',
  'נשר', 'נתיבות', 'נתניה', 'סחנין', 'עכו', 'עפולה',
  'עראבה', 'ערד', 'פתח תקווה', 'צפת', 'קלנסווה',
  'קריית אונו', 'קריית אתא', 'קריית ביאליק', 'קריית גת',
  'קריית טבעון', 'קריית ים', 'קריית מוצקין', 'קריית מלאכי',
  'קריית שמונה', 'ראש העין', 'ראשון לציון', 'רהט',
  'רחובות', 'רמלה', 'רמת גן', 'רמת השרון',
  'שדרות', 'תל אביב-יפו', 'תל מונד', 'חדרה', 'חולון',
  'חיפה', 'חצור הגלילית', 'הוד השרון', 'הרצליה',
  // שכונות תל אביב
  'פלורנטין', 'נווה צדק', 'יפו', 'הצפון הישן', 'רמת אביב',
  // שכונות ירושלים
  'רחביה', 'בקעה', 'קטמון', 'מושבת הגרמנים', 'מרכז העיר',
  // שכונות חיפה
  'כרמל', 'נווה שאנן', 'הדר הכרמל', 'רמת הנשיא',
]

export default function CitySelect({ value, onChange, placeholder = 'חפשי עיר...' }) {
  const [query, setQuery] = useState(value || '')
  const [open, setOpen] = useState(false)

  const filtered = query.length >= 1
    ? ISRAEL_CITIES.filter(c => c.includes(query)).slice(0, 8)
    : []

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); onChange('') }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '10px 14px',
          border: '1px solid #e8e0d0', borderRadius: 8,
          background: 'white', fontSize: 15, direction: 'rtl',
        }}
      />
      {open && filtered.length > 0 && (
        <ul style={{
          position: 'absolute', top: '100%', right: 0, left: 0,
          background: 'white', border: '1px solid #e8e0d0',
          borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
          zIndex: 100, margin: 0, padding: 0, listStyle: 'none',
          maxHeight: 240, overflowY: 'auto',
        }}>
          {filtered.map(city => (
            <li key={city}
              onClick={() => { setQuery(city); onChange(city); setOpen(false) }}
              style={{
                padding: '10px 14px', cursor: 'pointer',
                direction: 'rtl', fontSize: 14,
                borderBottom: '1px solid #f5f0e8',
              }}
              onMouseEnter={e => e.target.style.background = '#EAF3DE'}
              onMouseLeave={e => e.target.style.background = 'white'}
            >
              {city}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

**החלף CitySelect בכל המקומות הבאים:**
- טופס הרשמת בית עסק → שדה "עיר"
- טופס פרסום מוצר ביתי → שדה "שכונה/עיר"
- מסנן חיפוש בדף הבית → שדה "עיר משלוח"
- מסנן מפה → שדה "עיר"
- פרופיל משתמש → שדה "עיר"

---

## תיקון 2 — טופס פרסום מוצר ביתי — שדות חסרים

השווה ל-Facebook Marketplace, Yad2, Craigslist — הוסף את השדות הבאים:

### שדות מיקום מדויק:
```
עיר* (CitySelect)
רחוב + מספר בית (אופציונלי — מוצג רק כ"אזור" לפרטיות)
קומה (אופציונלי)
הערות מיקום — "ליד הסופר, כניסה מהחנייה" (textarea קצר)
```

### שדות מוצר מזון — חשוב לקונה:
```
כותרת המוצר* (מה זה?)
תיאור* (איך הוכן? מה יש בו?)
קטגוריה* — dropdown:
  [ בשר ועוף | דגים | ירקות ופירות | חלב וגבינות |
    לחמים ואפייה | שמנים ודבש | מותססים | טיפוח | אחר ]

--- מידע חשוב לקונה ---
תאריך הכנה* (מתי הוכן/נקטף?)
תאריך תפוגה* (עד מתי טרי?)
אחסון נדרש* — dropdown: [ מקרר | מקפיא | טמפרטורת חדר ]
רכיבים/אלרגנים* — textarea: "חיטה, ביצים, חלב..."
  (חשוב לאנשים עם אלרגיות!)
כשרות — dropdown: [ כשר | לא כשר | לא ידוע ]
אורגני — checkbox: [ ] גידול אורגני

--- כמות ומחיר ---
כמות זמינה* — מספר + יחידה (ק"ג / יח' / ליטר / מנות)
מחיר* — מספר בשקלים (או checkbox "במתנה" / "בהחלפה")
מינימום הזמנה — אופציונלי

--- תמונות ---
תמונות המוצר* — עד 4 תמונות (Cloudinary upload)
  (לפחות תמונה אחת חובה)

--- זמינות ---
זמין עד תאריך*
שיטת מסירה* — checkboxes:
  [ ] איסוף עצמי
  [ ] משלוח (בתוספת מחיר)
  [ ] שניהם
```

### הצג לקונה בכרטיסייה:
```jsx
// בכרטיסיית מוצר ביתי — הצג את המידע הכי חשוב:
<div className="listing-card">
  <img src={photo} />
  <h3>{title}</h3>
  <div className="badges">
    {isOrganic && <span>🌿 אורגני</span>}
    {kosher && <span>✡️ כשר</span>}
    {storageType === 'מקרר' && <span>❄️ שמור בקירור</span>}
  </div>
  <p>📅 הוכן: {prepDate} | עד: {expiryDate}</p>
  <p>⚠️ אלרגנים: {allergens}</p>
  <p>📍 {city}</p>
  <p className="price">{price === 0 ? '🎁 במתנה' : `₪${price}`} / {unit}</p>
  <p>כמות: {quantity} {unit}</p>
</div>
```

---

## תיקון 3 — ביקורות ודירוגים (עובר ל-v1!)

זה חשוב לאמינות — נכנס עכשיו לגרסה 1.

### DB:
```sql
CREATE TABLE reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producer_id uuid REFERENCES producers(id),
  user_id uuid REFERENCES users(id),
  stars int CHECK (stars BETWEEN 1 AND 5),
  title text,
  body text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(producer_id, user_id)  -- ביקורת אחת למשתמש
);

-- הוסף לטבלת producers:
ALTER TABLE producers ADD COLUMN avg_rating float DEFAULT 0;
ALTER TABLE producers ADD COLUMN reviews_count int DEFAULT 0;
```

### API:
```
POST /reviews { producer_id, stars, title, body }
GET  /reviews?producer_id=X
```

### תצוגה בעמוד עסק:
```jsx
// במקום תגית "מאומת" בלבד — הצג ביחד:
<div className="trust-badges">
  {producer.is_verified && (
    <span style={{ background:'#EAF3DE', color:'#2e6853',
                   borderRadius:20, padding:'4px 12px', fontSize:13 }}>
      ✅ עסק מאומת
    </span>
  )}
  {producer.avg_rating > 0 && (
    <span style={{ background:'#FFF9E6', color:'#946A00',
                   borderRadius:20, padding:'4px 12px', fontSize:13 }}>
      ⭐ {producer.avg_rating.toFixed(1)} ({producer.reviews_count} ביקורות)
    </span>
  )}
</div>

// סקציית ביקורות בתחתית עמוד עסק:
<section>
  <h3>ביקורות לקוחות</h3>

  {/* טופס כתיבת ביקורת — רק למחוברים */}
  {user && !userAlreadyReviewed && (
    <form onSubmit={submitReview}>
      <StarRating value={stars} onChange={setStars} />
      <input placeholder="כותרת קצרה" value={title} onChange={...} />
      <textarea placeholder="ספרי על החוויה שלך..." rows={3} />
      <button type="submit">פרסמי ביקורת</button>
    </form>
  )}

  {/* רשימת ביקורות */}
  {reviews.map(review => (
    <div key={review.id} className="review-card">
      <StarDisplay stars={review.stars} />
      <strong>{review.title}</strong>
      <p>{review.body}</p>
      <small>{review.user.name} · {formatDate(review.created_at)}</small>
    </div>
  ))}
</section>
```

### StarRating component:
```jsx
const StarRating = ({ value, onChange }) => (
  <div style={{ display:'flex', gap:4, direction:'ltr' }}>
    {[1,2,3,4,5].map(n => (
      <span key={n}
        onClick={() => onChange(n)}
        style={{ fontSize:28, cursor:'pointer',
                 color: n <= value ? '#F0C040' : '#e8e0d0' }}>
        ★
      </span>
    ))}
  </div>
)
```

---

## תיקון 4 — ולידציה של פרטים בהרשמה

### טלפון:
```js
// utils/validators.js
export const validateIsraeliPhone = (phone) => {
  // מקבל: 050-1234567 / 0501234567 / +972501234567
  const cleaned = phone.replace(/[-\s]/g, '')
  const pattern = /^(\+972|0)(5[0-9]|7[2-9])\d{7}$/
  return pattern.test(cleaned)
}

// הצג שגיאה מיידית:
// ❌ "מספר טלפון לא תקין — נסי שוב"
// ✅ "✓ מספר תקין"
```

### סיסמה (הוסף דרישות ברורות):
```jsx
// הצג בזמן אמת:
const passwordRules = [
  { label: 'לפחות 8 תווים', check: p => p.length >= 8 },
  { label: 'אות גדולה אחת (A-Z)', check: p => /[A-Z]/.test(p) },
  { label: 'ספרה אחת (0-9)', check: p => /\d/.test(p) },
]

// רנדר:
{passwordRules.map(rule => (
  <div key={rule.label} style={{
    color: rule.check(password) ? '#2e6853' : '#999',
    fontSize: 12,
  }}>
    {rule.check(password) ? '✓' : '○'} {rule.label}
  </div>
))}
```

### ולידציות נוספות בטופס בית עסק:
```js
// אימייל — בדוק פורמט תקין
// אינסטגרם — בדוק שמתחיל ב-@ או שהוא username תקין
// אתר — בדוק שמתחיל ב-http
// שעות פעילות — תאריך הגיוני
```

---

## תיקון 5 — Google OAuth + Apple OAuth (לא עובד!)

### הבעיה: כפתור Google לא מופיע.

```bash
# התקן:
npm install @react-oauth/google
npm install apple-auth  # או next-auth
```

```jsx
// app/login/page.jsx

import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google'

export default function LoginPage() {
  return (
    <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID}>
      <div className="login-container">

        {/* Google — חייב להיות נראה! */}
        <GoogleLogin
          onSuccess={async (credentialResponse) => {
            const res = await fetch('/api/auth/google', {
              method: 'POST',
              body: JSON.stringify({ token: credentialResponse.credential }),
              headers: { 'Content-Type': 'application/json' }
            })
            const { jwt } = await res.json()
            localStorage.setItem('token', jwt)
            router.push('/')
          }}
          text="continue_with"
          locale="he"
          shape="pill"
          size="large"
          width="100%"
        />

        {/* Apple — כפתור שחור */}
        <button onClick={handleAppleLogin} style={{
          background: 'black', color: 'white',
          border: 'none', borderRadius: 50,
          padding: '12px 24px', width: '100%',
          fontSize: 15, cursor: 'pointer',
          display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 8,
        }}>
          <AppleIcon /> המשך עם Apple
        </button>

        <div style={{ textAlign:'center', color:'#999', margin:'16px 0' }}>
          — או —
        </div>

        {/* אימייל + סיסמה */}
        <form onSubmit={handleEmailLogin}>
          <input type="email" placeholder="אימייל" required />
          <input type="password" placeholder="סיסמה" required />
          <button type="submit">כניסה</button>
        </form>

        <a href="/register">אין חשבון? הצטרפי →</a>
      </div>
    </GoogleOAuthProvider>
  )
}
```

### .env.local — חובה:
```
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
APPLE_CLIENT_ID=com.mehamekor.app
APPLE_TEAM_ID=your_team_id
APPLE_KEY_ID=your_key_id
```

### Backend:
```python
# POST /auth/google
@router.post("/auth/google")
async def google_login(data: GoogleToken):
    # אמת מול Google
    google_user = await verify_google_token(data.token)
    
    # מצא או צור משתמש
    user = await get_or_create_user(
        email=google_user['email'],
        name=google_user['name'],
        google_id=google_user['sub']
    )
    
    jwt_token = create_jwt(user.id)
    return { "jwt": jwt_token, "user": user }
```

---

## תיקון 6 — Cookies + Banner

כל אתר חייב cookies banner. הוסף:

```jsx
// components/CookieBanner.jsx
export default function CookieBanner() {
  const [accepted, setAccepted] = useState(
    () => localStorage.getItem('cookies_accepted') === 'true'
  )

  if (accepted) return null

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: '#2E4A2E', color: '#EAF3DE',
      padding: '16px 24px',
      display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', gap: 16,
      zIndex: 9999, flexWrap: 'wrap',
    }}>
      <p style={{ margin: 0, fontSize: 14 }}>
        🍪 אנחנו משתמשים בעוגיות כדי לשפר את החוויה שלך.
        <a href="/terms" style={{ color:'#4cb08b', marginRight: 6 }}>
          מדיניות פרטיות
        </a>
      </p>
      <div style={{ display:'flex', gap: 8 }}>
        <button
          onClick={() => {
            localStorage.setItem('cookies_accepted', 'true')
            setAccepted(true)
          }}
          style={{
            background: '#2e6853', color: 'white',
            border: 'none', borderRadius: 8,
            padding: '8px 20px', cursor: 'pointer',
          }}>
          אני מסכימה ✓
        </button>
        <button
          onClick={() => setAccepted(true)}
          style={{
            background: 'transparent', color: '#EAF3DE',
            border: '1px solid #EAF3DE', borderRadius: 8,
            padding: '8px 20px', cursor: 'pointer',
          }}>
          רק הכרחיים
        </button>
      </div>
    </div>
  )
}

// הוסף ב-app/layout.js:
<CookieBanner />
```

---

## עדכן CLAUDE.md:
```
עדכן CLAUDE.md:
- CitySelect component — בכל שדות עיר/שכונה באתר
- טופס מוצר ביתי: הוסף שדות תאריך הכנה/תפוגה, אלרגנים, אחסון, תמונות
- ביקורות ודירוגים: עבר ל-v1! טבלה reviews, avg_rating בproducers
- ולידציה טלפון ישראלי + דרישות סיסמה
- Google OAuth: @react-oauth/google — env: NEXT_PUBLIC_GOOGLE_CLIENT_ID
- Apple OAuth: כפתור שחור מתחת לגוגל
- Cookies banner — CookieBanner component בlayout.js
```
