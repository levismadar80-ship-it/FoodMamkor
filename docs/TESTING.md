# מהמקור — בדיקת כל הפיצ'רים
> קרא CLAUDE.md קודם. זה קובץ בדיקות — לא לממש פיצ'רים חדשים.

---

## Playwright E2E (MEH-126) — תשתית אוטומטית

### הרצה מקומית

```bash
cd frontend

# Against local dev server (start it first):
npm run dev          # terminal 1 — http://localhost:3000
npm run test:e2e     # terminal 2

# Against any deployed URL:
TEST_URL=https://staging.mehamakor.online npm run test:e2e

# View HTML report (generated only in CI or on failure):
npm run test:e2e:report
```

### מבנה קבצים

```
frontend/e2e/
  flows/                        ← 5 critical-path flows (MEH-126)
    01-home-load.spec.ts          homepage h1 + hero-search + zero JS errors
    02-search-producer.spec.ts    hero search → /producers?q=
    03-view-producer-detail.spec.ts  click card → detail h1 + CTA
    04-whatsapp-click.spec.ts     WA CTA click → analytics beacon fires
    05-map-navigation.spec.ts     /map loads + centered on Israel
  rtl.spec.ts                   ← RTL layout regression (existing)
  screenshots.spec.ts           ← Visual smoke + issue reporter (existing)
```

### CI — GitHub Actions (e2e.yml)

Triggers on every PR targeting `staging` or `main`. Tests run against the **Vercel preview URL** for that PR — not shared staging. Flow:

1. Wait for Vercel deployment to complete (up to 5 min via `patrickedqvist/wait-for-vercel-preview`)
2. Set `TEST_URL` to the preview URL
3. Run `playwright test` (Chromium, desktop + mobile)
4. Upload `playwright-report/` artifact on failure

No extra secrets needed — only the auto-provided `GITHUB_TOKEN`.

### Adding a new test

1. Create `frontend/e2e/flows/NN-my-feature.spec.ts`
2. Use `data-testid` attributes, not CSS classes (they survive refactors)
3. Keep each test under 30 seconds
4. Use `page.route(...)` to block external navigations (WhatsApp, OAuth, etc.)
5. If the test needs a logged-in user, use Playwright `storageState` fixture (v2 path)

### data-testid inventory (E2E-relevant)

| testid | component | notes |
|--------|-----------|-------|
| `hero-search` | HeroSearch.jsx | search input |
| `producer-card` | ProducerCard.jsx | card link |
| `primary-contact-button` | PrimaryContactButton.jsx | has `data-method` attr |
| `whatsapp-cta` | WhatsAppButton.jsx | standalone WA button |
| `hero-search-dropdown` | HeroSearch.jsx | combobox listbox |
| `availability-badge` | AvailabilityBadge.jsx | |
| `smart-search-dropdown` | SmartSearch.jsx | |

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
□ טאב בר ב-/events: "אירועים בחוות" ו-"חוויות וסדנאות"
□ ?tab=experiences עמיד לרענון (deep-link עובד)
□ החלפת טאב מאפסת סינון עיר + קטגוריה
```

### 6a. חוויות קהילתיות (feature/experiences-moderation)
> רץ מול staging. Backend tests: `tests/test_experiences.py` — 40 cases.

**הגשה וזרימת מודרציה**
```bash
□ GET /experiences ציבורי — רק approved + upcoming
□ משתמש מחובר (consumer/producer/admin) יכול POST /experiences
□ בלי אישור → 401
□ title < 4 תווים / description < 20 תווים → 422
□ תוכן אסור (spam, MLM, טענות ריפוי) → Claude REJECTED → 400
□ תוכן חשוד → Claude FLAGGED → נשמר כ-pending, moderation_status=FLAGGED
□ תוכן תקין → Claude APPROVED → נשמר כ-pending, ממתין לאישור אדמין
□ /experiences/new בטופס — עדכון live של Claude תוך 1.5s הקלדה:
    - APPROVED: אין feedback
    - FLAGGED: פס צהוב + הצעת שיפור, submit פעיל
    - REJECTED: פס אדום, submit disabled
□ הגשה מוצלחת → redirect ל-/experiences/{id}?pending=1 + ירוק banner
□ אדמין מקבל מייל על כל הגשה חדשה (FLAGGED מופיע בנושא)
```

**תצוגה ופרטיות**
```bash
□ /experiences ציבורי לא מציג כתובת רחוב
□ /experiences/{id} ציבורי (approved) לא מציג address
□ /experiences/{id} לבעלים — מציג address + moderation context
□ /experiences/{id} לאדמין — מציג הכל כמו בעלים
□ חוויה pending → 404 לזר, 200 לבעלים/אדמין (לא 403 — לא לחשוף קיום)
□ חוויות עבר (event_date < היום) לא מופיעות בגריד הציבורי
□ "נשארו X מקומות" על כרטיסייה כשיש max_participants
□ "אזל" מסתיר את כפתור ה-WhatsApp בעמוד הפרטים
```

**אדמין**
```bash
□ /admin/experiences חסום ל-consumer/producer (403)
□ טאבים: ממתינות / שינויים נדרשים / מאושרות / נדחו / הכל
□ שורה ניתנת להרחבה — מציגה תיאור, דרישות, Claude reason/suggestion
□ "אשרי" → status=approved → מופיע בגריד הציבורי + מייל לבעלים
□ "שינויים" דורש הערה (400 אם ריק) → status=changes_requested + מייל
□ "דחי" עם הערה → status=rejected + מייל
□ בעלים מקבלת מייל עם feedback verbatim
```

**מחזור חיים מלא**
```bash
□ pending → changes_requested (עם admin_feedback)
□ בעלים עורכת PUT /experiences/{id} → status חוזר ל-pending
□ admin_feedback + rejection_reason מתנקים
□ Claude רץ שוב על התוכן החדש
□ אדמין מקבל מייל "הגשה חדשה"
□ אדמין מאשר → approved → מופיע בציבור
```

**עברית + RTL + iOS**
```bash
□ פונטים נטענים: Frank Ruhl Libre בכותרות, DM Sans בגוף
□ כל העמודים RTL — אין דלף LTR בטופס / בטאב בר / במודל
□ iOS Safari על iPhone: אין zoom אוטומטי על שדות (font-size ≥ 16px)
□ טקסט פמיני עקבי: הגישי, טוענת, אישרי, דחי
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
