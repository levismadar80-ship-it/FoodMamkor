# מהמקור — ממשק אדמין + בדיקות
> קרא קובץ זה כשעובדים על /admin או בדיקות

## מבנה האדמין
sidebar קבוע ב: `frontend/app/admin/layout.js` — 8 דפים

| דף | URL | תוכן |
|----|-----|-------|
| Dashboard | /admin | 4 stat cards + גרף 6 חודשים + מפה מיני + פעילות + התראות |
| בתי עסק | /admin/producers | טבלה + חיפוש + ייבוא/ייצוא Excel + אישור מהיר |
| משתמשים | /admin/users | חיפוש + שינוי role + חסימה |
| תוכן | /admin/content | קטגוריות CRUD + עורך about/terms |
| דיווחים | /admin/reports | ממוין לפי דחיפות + פתור/השהה/התעלם |
| אנליטיקס | /admin/analytics | גרפים + heat map + top producers |
| חוויות | /admin/experiences | מיתון חוויות — 5 טאבים (ממתינות לאישור / דרוש תיקון / מאושרות / נדחו / הכל) + כפתורי אישור/דחייה/בקשת שינויים + התראת מייל למארח |
| הגדרות | /admin/settings | אימייל/WhatsApp אדמין + freemium + בדיקת Twilio/Cloudinary |

## Backend
קובץ: `backend/app/routers/admin_extra.py`

endpoints: `/admin/users`, `/admin/categories`, `/admin/pages/{slug}`,
           `/admin/analytics`, `/admin/settings`, `/admin/dashboard`

מודלים:
- `AdminSetting(key, value)`
- `StaticPage(slug, title, body)`
- שדה `users.is_blocked` — login דוחה עם 403

## בדיקות אוטומטיות
```
tests/test_api.py       — 24 pytest (auth, producers, filters, admin guard)
tests/test_e2e.spec.ts  — Playwright (public pages + admin guard)
tests/conftest.py       — fixture עם DB מבודד (mehamakor_test)
tests/README.md         — הוראות הרצה
```

הרצה:
```bash
pytest tests/test_api.py        # 24/24 passing
npx playwright test             # E2E
```

## Freemium
| תוכנית | מחיר | תמונות | מוצרים | סטטיסטיקות |
|--------|------|--------|---------|-------------|
| חינם | ₪0 | עד 3 | לא | לא |
| פרמיום | TBD | ללא הגבלה | כן | כן |
