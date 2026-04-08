# מהמקור — תיקוני UX + שיפורים
> קרא CLAUDE.md קודם. בצע לפי הסדר. עדכן CLAUDE.md בסוף.

---

## לפני הכל — התקן את ה-Skills האלה

```bash
# Skill 1 — Brand Guidelines (by Anthropic)
npx claude install brand-guidelines

# Skill 2 — UI/UX Pro Max (by NextLevelBuilder)  
npx claude install ui-ux-pro-max

# Skill 3 — Design Auditor (Community)
npx claude install design-auditor

# Skill 4 — Frontend Design (by Anthropic) ← התקן ראשון!
npx claude install frontend-design

# Skill 5 — Webapp Testing (by Anthropic)
npx claude install webapp-testing
```

אחרי ההתקנה הרץ:
```bash
/design-review    # סרוק את כל האתר
/audit            # מצא בעיות עיצוב
```

---

## תיקון 1 — כפתור "הצג במפה" → פוקוס ישיר

בעמוד עסק `/producer/:id` יש כפתור "הצג במפה 🗺️" בפינה ימין תחתונה.
כרגע הוא לא עושה כלום שימושי.

**מה לתקן:**
```js
// בעמוד /producer/:id
// כפתור "הצג במפה" יעשה:

const handleShowOnMap = () => {
  // 1. שמור את העסק ב-sessionStorage
  sessionStorage.setItem('focusProducer', JSON.stringify({
    id: producer.id,
    lat: producer.lat,
    lng: producer.lng,
    name: producer.name,
  }))

  // 2. נווט לעמוד המפה
  router.push('/map')
}

// בעמוד /map — בעת טעינה:
useEffect(() => {
  const focus = sessionStorage.getItem('focusProducer')
  if (focus) {
    const p = JSON.parse(focus)
    // עף לעסק עם zoom 15
    map.flyTo([p.lat, p.lng], 15, { duration: 1.5 })
    // פתח את ה-popup שלו אחרי שסיים לעוף
    setTimeout(() => markers[p.id]?.openPopup(), 1600)
    // הדגש אותו בגריד מתחת למפה
    setActiveProducer(p.id)
    // נקה
    sessionStorage.removeItem('focusProducer')
  }
}, [map])
```

---

## תיקון 2 — ניווט ראשי: הוסף "אירועים"

כרגע קשה למצוא את עמוד האירועים. הוסף לתפריט:

```
navbar (desktop):
  גלה | מפה | אירועים 📅 | מהמטבח של השכן | הוסף עסק

bottom nav (mobile) — עדכן 4 הטאבים:
  🏠 גלה  |  🗺️ מפה  |  📅 אירועים  |  ❤️ מועדפים
```

---

## תיקון 3 — עמוד /about — שיפור מלא

הבעיה: העמוד כרגע לא מספיק מרשים ולא מתחבר לאסתטיקה של gardensweet.com

**בצע לפי docs/DESIGN.md סקציות A-D שמפורטות שם.**

בנוסף — הוסף breadcrumb בראש הדף:
```
בית > אודות
```

וכפתור CTA גדול בסוף הדף:
```jsx
<div style={{textAlign:'center', padding:'64px 0', background:'#F5F0E8'}}>
  <h2 style={{fontFamily:'Frank Ruhl Libre', fontSize:36}}>
    מוכנה להצטרף?
  </h2>
  <div style={{display:'flex', gap:16, justifyContent:'center', marginTop:24}}>
    <a href="/register/producer"
       style={{background:'#2e6853', color:'white', padding:'14px 32px', borderRadius:8}}>
      הוסף את העסק שלך
    </a>
    <a href="/map"
       style={{border:'1px solid #2e6853', color:'#2e6853', padding:'14px 32px', borderRadius:8}}>
      מצאי עסקים קרובים
    </a>
  </div>
</div>
```

---

## תיקון 4 — מבנה ניווט כללי (sitemap ברור)

הוסף `/sitemap` page פשוטה + עדכן footer עם כל הקישורים:

```
footer — עמודת ניווט:
  לגלות:     דף הבית | מפה | כל הקטגוריות | עסקים חדשים
  קהילה:     אירועים | מהמטבח של השכן | אודות
  יצרנים:    הוסף עסק | כניסת יצרן | שאלות נפוצות
  משפטי:     תנאי שימוש | פרטיות | דווח על בעיה
```

---

## תיקון 5 — שיפורי UX קטנים שמשפרים הרבה

### א. Breadcrumbs בכל עמוד
```
דף עסק:    בית > [קטגוריה] > [שם עסק]
מפה:       בית > מפה
אירועים:   בית > אירועים
אודות:     בית > אודות
```

### ב. "חזור לתוצאות" בעמוד עסק
```jsx
// כשמגיעים מהדף הבית / מהמפה — הצג:
<button onClick={() => router.back()}>
  → חזרה לתוצאות
</button>
// מיקום: ראש הדף, מעל הגלריה
```

### ג. Empty States יפים
```
מפה ריקה:
  אייקון מפה עם עלים
  "אין עסקים באזור זה עדיין 🌱"
  "הכירי מישהי שתוכל להצטרף? שתפי!"
  [כפתור: הזמן יצרן]

מועדפים ריקים:
  אייקון לב
  "עדיין לא שמרת עסקים 🌿"
  [כפתור: גלי עסקים]
```

### ד. Toast notifications
```js
// אחרי כל פעולה הצג toast קצר:
"נשמר למועדפים ❤️"
"הסרת מהמועדפים"
"הדיווח נשלח ✓"
"הועתק לקליפבורד 🔗"
```

### ה. Loading skeleton במקום spinner
```jsx
// במקום סתם ספינר — הצג skeleton cards:
<div className="skeleton-card" style={{
  background: 'linear-gradient(90deg, #e8e0d0 25%, #f5f0e8 50%, #e8e0d0 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s infinite',
  borderRadius: 16,
  height: 280,
}}/>
```

### ו. כפתור "שתף עסק" בעמוד עסק
```js
const shareProducer = async () => {
  const url = `https://mehamekor.co.il/${producer.slug}`
  if (navigator.share) {
    await navigator.share({ title: producer.name, url })
  } else {
    navigator.clipboard.writeText(url)
    showToast("הקישור הועתק! 🔗")
  }
}
```

---

## תיקון 6 — 3D Scroll Animations (מהתמונה האחרונה)

**ההמלצה: כן, אבל במינון נכון.**

3D scrolling זה מרשים אבל יכול להאט את האתר ולהסיח דעת. הנה מה שמתאים למהמקור:

### מה כן להוסיף (עדין ואלגנטי):
```js
// ספרייה: npm install framer-motion
import { motion, useScroll, useTransform } from 'framer-motion'

// 1. כרטיסיות עסקים — fade + slide up בכניסה לתצוגה
<motion.div
  initial={{ opacity: 0, y: 40 }}
  whileInView={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.6, delay: index * 0.1 }}
  viewport={{ once: true }}
>
  <ProducerCard ... />
</motion.div>

// 2. Hero text — fade in מלמטה
<motion.h1
  initial={{ opacity: 0, y: 60 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.9, ease: 'easeOut' }}
>
  אוכל אמיתי, ישר מהמקור אליך
</motion.h1>

// 3. Parallax sections — כבר יש עם background-attachment:fixed
// זה מספיק, לא צריך ספרייה נוספת
```

### מה לא להוסיף:
```
✗ אנימציות 3D מסובכות על כרטיסיות
✗ rotation או perspective כבד
✗ אנימציות שמפריעות לגלילה במובייל
✗ כלום שמאט את הדף מתחת ל-90 Lighthouse
```

### הכלל: פשוט = יפה יותר
```
fade in + slide up = מושלם למהמקור
parallax תמונות = כבר יש, מספיק
```

---

## בסוף — עדכן CLAUDE.md:
```
עדכן CLAUDE.md:
- כפתור "הצג במפה": sessionStorage → router.push('/map') → flyTo + openPopup
- ניווט: הוספת "אירועים" לnavbar ול-bottom nav
- אנימציות: framer-motion, fade+slide only, NO heavy 3D
- Skills מותקנים: brand-guidelines, ui-ux-pro-max, design-auditor, frontend-design, webapp-testing
- UX: breadcrumbs, toast notifications, skeleton loading, share button
```
