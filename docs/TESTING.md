# מהמקור — בדיקת כל הפיצ'רים
> קרא CLAUDE.md קודם. זה קובץ בדיקות — לא לממש פיצ'רים חדשים.

---

## לפני הכל — התקן כלי בדיקות

```bash
# Playwright CLI — בדיקות E2E (מהתמונות)
npm install -g @playwright/test
npx playwright install

# TDD Skill — מהתמונות של Jens
npx skills add superpowers/tdd

# Adversarial Review — מוצא באגים אמיתיים (מ-Olle)
# הורד את SKILL.md מ: skool.com/ctx
```

---

## שיטת הבדיקה — Adversarial Review

מהתמונות של Olle — במקום Claude אחד שמסכים איתך, 3 agents:

```
שלחי ל-Claude Code:

"Run an adversarial review of the entire codebase:
1. FINDER: Find every possible bug, UX issue, broken feature
2. ADVERSARY: Try to disprove each issue found
3. REFEREE: Decide which issues are real

Report only the REAL issues."
```

---

## בדיקות לפי פיצ'ר — הרץ בסדר הזה

### 1. עיצוב ו-UI
```bash
# פתח localhost:3000 ובדוק:

□ Hero — תמונה נטענת, parallax עובד בגלילה
□ Social Proof Bar — מספרים דינמיים מה-DB
□ Category Grid — 6 קטגוריות עם תמונות, hover עובד
□ כרטיסיות עסקים — תמונה, שם, badges, כפתורים
□ Footer — Instagram + ניוזלטר + "שקיפות ואמון"
□ RTL — כל הטקסט מיושר ימין
□ פונטים — Frank Ruhl Libre בכותרות, DM Sans בגוף
□ צבעים — background #F5F0E8 (לא לבן!)
□ מובייל — bottom nav מוצג, כל הכרטיסיות נראות טוב
```

### 2. מפה
```bash
□ מפה נטענת ב-/map
□ סימנים מוצגים על בתי העסק
□ לחיצה על כרטיסייה → מפה עפה לעסק (flyTo) + popup נפתח
□ לחיצה על סימן במפה → גלול לכרטיסייה + הדגש
□ 3 מסננים עובדים: קטגוריה / עיר / מאומת
□ כפתור "הצג במפה" בעמוד עסק → עובר ל-/map ומתמקד
```

### 3. כניסה והרשמה
```bash
□ הרשמה עם אימייל + סיסמה
□ כניסה עם Google OAuth
□ כניסה עם Apple OAuth
□ שגיאה ברורה אם אימייל כבר קיים
□ JWT נשמר ב-localStorage
□ logout מנקה את ה-token
```

### 4. מהמטבח של השכן + מודרציה
```bash
□ טופס פרסום מוצר נפתח
□ בדיקת AI — הקלד תוכן תקין → אין אזהרה
□ בדיקת AI — הקלד "מרפא סרטן" → הופיעה אזהרה צהובה
□ בדיקת AI — הקלד תוכן אסור → כפתור נחסם + הסבר אדום
□ מוצר תקין עולה מיד
□ מוצר FLAGGED עולה עם badge "בבדיקה 🔍"
□ disclaimer מוצג: "האחריות על המוצר היא של המוכר בלבד"
```

### 5. אדמין
```bash
□ /admin נגיש רק ל-role=admin (אחרים → 403)
□ Dashboard — 4 stat cards עם מספרים
□ /admin/producers — טבלה + חיפוש + אישור מהיר
□ /admin/reports → טאב "מוצרים ביתיים" מציג רק FLAGGED
□ אישור מוצר FLAGGED → badge נעלם
□ מחיקת מוצר → הודעה נשלחת למוכר
```

### 6. אירועים
```bash
□ /events נטען עם גריד
□ מסנן עיר / קטגוריה / תאריך עובד
□ Preview של 3 אירועים בדף הבית
□ יצרן יכול להוסיף אירוע מ-/producer/dashboard
□ אירוע שעבר לא מוצג
```

### 7. UX כללי
```bash
□ Breadcrumbs מוצגים בכל עמוד
□ Toast notifications — "נשמר ❤️" אחרי שמירת מועדף
□ Skeleton loading במקום spinner
□ כפתור שיתוף עסק — copy link עובד
□ "חזרה לתוצאות" בעמוד עסק
□ Empty states — מועדפים ריקים מציג הודעה יפה
```

### 8. טקסטים
```bash
□ אין שום מקום שכתוב "יצרן" — רק "בית עסק"
□ Footer: "שקיפות ואמון" (לא "משפטי")
□ סיפור ספיר מעודכן ב-/about
□ Micro-copy נשי: "הצטרפי", "גלי", "טוענת..."
```

---

## בדיקות אוטומטיות — Playwright

```bash
# צור קובץ: tests/test_all_features.spec.ts

npx playwright test --reporter=html
# פותח דוח מפורט בדפדפן
```

```typescript
// tests/test_all_features.spec.ts
import { test, expect } from '@playwright/test'

// עיצוב
test('hero loads with parallax image', async ({ page }) => {
  await page.goto('http://localhost:3000')
  const hero = page.locator('.hero-section')
  await expect(hero).toBeVisible()
  await expect(hero).toHaveCSS('background-attachment', 'fixed')
})

// מפה
test('map focuses on producer when card clicked', async ({ page }) => {
  await page.goto('http://localhost:3000/map')
  await page.locator('.producer-card').first().click()
  // בדוק שה-popup נפתח
  await expect(page.locator('.leaflet-popup')).toBeVisible()
})

// מודרציה
test('AI blocks harmful listing', async ({ page }) => {
  await page.goto('http://localhost:3000')
  await page.locator('[data-testid="publish-listing"]').click()
  await page.fill('[name="title"]', 'תרופה מרפאת סרטן')
  await page.fill('[name="description"]', 'מרפאת כל מחלה')
  await expect(page.locator('.moderation-rejected')).toBeVisible()
  await expect(page.locator('[type="submit"]')).toBeDisabled()
})

// אדמין
test('admin page blocked for regular user', async ({ page }) => {
  await page.goto('http://localhost:3000/admin')
  await expect(page).toHaveURL(/login/)
})

// טקסטים
test('no "יצרן" text anywhere visible', async ({ page }) => {
  await page.goto('http://localhost:3000')
  const content = await page.textContent('body')
  expect(content).not.toContain('יצרן')
  expect(content).not.toContain('יצרנים')
})
```

---

## Agent Teams — בדיקה מתקדמת (מהתמונות)

שלחי ל-Claude Code:

```
Use agent teams to QA the entire מהמקור project:

Research agent: Read all feature files (TASKS.md, UX_FIXES.md, MODERATION.md, COPY_FIXES.md)
Code agent: Check if each feature is actually implemented in the codebase
Test agent: Run playwright tests for each feature
Review agent: Report what's missing or broken
Deploy agent: Create a summary report

Output: TESTING_REPORT.md with:
- ✅ Working features
- ❌ Missing features  
- 🐛 Bugs found
- 📋 Priority fix list
```

---

## בסוף — עדכן CLAUDE.md:
```
עדכן CLAUDE.md:
- כלי בדיקות: playwright-cli, TDD skill, Adversarial Review
- בדיקות: tests/test_all_features.spec.ts
- כל הפיצ'רים שנבדקו ועובדים
```
