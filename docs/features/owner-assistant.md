# העוזרת בלוח הבקרה

**מה היא עושה.** עוזרת AI בתוך לוח הבקרה של בעלת העסק (MEH-3902). כפתור «עוזרת» בשורת הלשוניות, בטלפון ובמחשב, פותח חלון. העוזרת יודעת את מצב העסק (טיוטה / בבדיקה / מאושר), מה עוד חסר כדי לשלוח לבדיקה ואיפה משלימים אותו, אילו שדות ריקים, ובאיזה מסך בעלת העסק נמצאת. היא עונה על שאלות (בעברית, או באנגלית כשהממשק באנגלית), אומרת מה הצעד הבא עם קישור למסך או לכרטיס בעריכה, ועושה את הצעדים בתוך השיחה:

* פרטי העסק: מהטקסט שבעלת העסק כתבה, בסקירה שדה-שדה (אותה סקירה של «ספרו לנו על העסק»).
* מוצרים: מהטקסט שלה, או מצילום תפריט, באותה סקירה של «העלו תפריט».
* תמונות: כרטיס התמונות של העריכה, בתוך השיחה.
* אימות הוואטסאפ ושליחה לבדיקה: הכרטיס של לוח הבקרה, לעסק בטיוטה.

כל אחד מאלה הוא הרכיב הקיים של לוח הבקרה ונשמר בנתיב שלו, ורק אחרי שבעלת העסק אישרה. השיחה נשמרת שבוע בדפדפן, ו«שיחה חדשה» מוחקת אותה. בבית לוח הבקרה, לעסק בטיוטה שעוד חסרים לו דברים, שורה מהעוזרת אומרת כמה נשארו ופותחת אותה על «מה הצעד הבא שלי?». צ'אט האתר כבוי בכל לוח הבקרה, כדי שתהיה עוזרת אחת.

**מדידה.** אירועי PostHog (רק בהסכמה לעוגיות): `owner_assistant_open`, `owner_assistant_ask` (מסך, ושאלה מוכנה או «typed»), `owner_assistant_card`, `owner_assistant_saved`, `owner_assistant_unanswered` (מסך ונושא מרשימה סגורה, אף פעם לא המילים שלה).

**Routes**
* `POST /chat/owner` — רק לבעלת עסק מחוברת.

**קבצים מרכזיים**
* `backend/app/routers/chat_owner.py` — הנתיב. משתמש בלקוח, בתקרות ובידע של צ'אט האתר (`backend/app/routers/chat.py`).
* `backend/app/services/owner_assistant.py` — ההנחיה, הנתונים של העסק (מגודרים בתגית `owner_business`), וארבעת הכלים. `fill_page_from_chat` ו-`products_from_chat` לא מקבלים קלט מהמודל: השרת קורא רק את ההודעות שבעלת העסק כתבה, ומעביר אותן ל-`backend/app/services/page_filler.py` או ל-`read_menu_text` ב-`backend/app/services/menu_reader.py`. `show_in_chat` בוחר כרטיס מרשימה סגורה, ו-`note_unanswered` נושא מרשימה סגורה.
* `backend/app/owner_sections.py` + `frontend/lib/owner-pages.js` — רשימה אחת של מסכי לוח הבקרה וכרטיסי העריכה. העוזרת כותבת נתיב, ו-`frontend/components/owner-assistant/OwnerAssistantText.jsx` הופך רק נתיבים מהרשימה לקישור. תת-דף (אירוע חדש, תצוגת הדפסה) נשלח כמסך שהוא שייך אליו.
* `frontend/components/owner-assistant/OwnerAssistant.jsx` — הכפתור, והחלון ב-portal (שורת הלשוניות sticky עם blur).
* `frontend/components/owner-assistant/OwnerAssistantPanel.jsx` — השיחה, שאלות לחיצה לפי מסך, והמדידה.
* `frontend/components/owner-assistant/OwnerAssistantCard.jsx` — מה שתשובה פותחת בשיחה: `frontend/components/PageFillReview.jsx`, `frontend/components/MenuImport.jsx`, `frontend/app/[locale]/producer/dashboard/edit/cards/ImagesCard.jsx`, `frontend/components/producer/DraftSubmitBanner.jsx`.
* `frontend/components/owner-assistant/OwnerAssistantNudge.jsx` — השורה בבית לוח הבקרה.
* `frontend/lib/owner-assistant-store.js` — השיחה בדפדפן, שבוע.
* `frontend/components/PageFillReview.jsx` — סקירת השדות ושמירה, משותפת ל-`frontend/components/PageFillPanel.jsx` ולעוזרת.
* `frontend/lib/owner-page-updated.js` — אחרי שמירה מהעוזרת, הסקירה ועמוד העריכה קוראים את העסק מחדש; ובכיוון השני, מסך פותח את העוזרת על שאלה.

**Flags.** אין. בלי `ANTHROPIC_API_KEY` חוזרת הודעת «לא זמינה». מסך «סלי הפתעה» נכנס להנחיה רק כשהפיילוט פעיל.

**טסטים**
* `tests/test_owner_assistant.py` — 401 / 403, מה שחסר ואיפה משלימים בנתונים, טקסט של בעלת העסק לא סוגר את התגית, נתיב שלא ברשימה לא מגיע למודל, המילוי והמוצרים קוראים רק את המילים שלה ולא שומרים, כרטיס לא מוכר לא נפתח, שליחה לבדיקה רק לטיוטה, נושא לא מוכר הופך ל-other, אנגלית, וכל דף בלוח הבקרה ברשימה או מוחרג עם סיבה.
* `frontend/__tests__/OwnerAssistant.test.jsx` — סגור / פתוח, המסך והשפה נשלחים עם השאלה, 0 / 1 / הרבה הודעות, קישורים, רק שדות מסומנים נשמרים, מוצרים נוספים אחרי סקירה, כרטיס נפתח רק כשהשרת מבקש, מדידה בלי תוכן, השיחה נשמרת ונמחקת, והשורה בבית.

**מזהי רישום שזה מכסה.** אין עדיין.
