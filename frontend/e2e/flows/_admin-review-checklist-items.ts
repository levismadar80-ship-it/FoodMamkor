// MEH-2954: the seven Phase-1 pre-approval checklist items, for specs that stub
// GET /admin/checklist-items. The product reads them from the
// admin_checklist_items table (seed: backend/alembic/versions/
// 20260821_1700_d4a9c31e6f82_meh1399_admin_review_checklist.py). The old
// frontend array these specs imported was a dead second copy and is deleted.
// DO NOT import this from app code — it is test data, not a source of copy.
export const ADMIN_REVIEW_CHECKLIST_ITEMS: { id: string; label: string; hint?: string }[] = [
  { id: "basics", label: "פרטים בסיסיים תקינים", hint: "שם, עיר, טלפון, קטגוריות, תיאור ברמת מגזין" },
  { id: "photos", label: "תמונות שייכות לעסק ואיכותיות", hint: "חשד לתמונת סטוק — בדקי חיפוש הפוך" },
  { id: "license", label: "רישיון הוצלב מול מאגר משרד הבריאות", hint: "שם תואם, מספר תואם, תוקף בתוקף" },
  { id: "kosher", label: "כשרות: תעודה נבדקה (אם הוצהרה)" },
  { id: "signals", label: "סימני חיים: אתר / אינסטגרם / גוגל תואמים לעסק" },
  { id: "call", label: "שיחה קצרה בוצעה (רק אם risk גבוה או ספק)" },
  { id: "decision", label: "החלטה מנומקת: אישור / השלמה / דחייה" },
];
