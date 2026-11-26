# חוויות

**מה הן עושות.** ביקור מאורח אצל בית העסק — סיור, טעימה, סדנה חוזרת. אותה זרימת הרשמה כמו אירוע, עם קטגוריה משלה ומודרציה של AI על התיאור.

**Routes**
* `frontend/app/[locale]/(whats-on)/experiences/` (לשונית בתוך `frontend/app/[locale]/(whats-on)/layout.js`, MEH-3463) · `frontend/app/[locale]/experiences/[id]/`
* `frontend/app/[locale]/producer/dashboard/experiences/` ‏(+ `new`, `[id]/edit`)
* `frontend/app/[locale]/admin/experiences/`

**קבצים מרכזיים**
* `backend/app/routers/admin_business_content.py` — אדמין יוצרת ועורכת חוויה בשם בית עסק שיש לו חשבון בעלים (המארח הוא החשבון הזה), עם `owner_consent: true` בכל שמירה. עוברת לאותו תור אישור ואותה בדיקת תוכן כמו חוויה של בעל העסק. אותה פונקציה משותפת: `submit_experience_for` / `update_experience_row` ב-`backend/app/routers/experiences.py` (MEH-3873).
* `frontend/components/admin/AdminBusinessExperiencesPanel.jsx` — הפאנל «חוויות של בית העסק» בעמוד העריכה של עסק באדמין: הרשימה (`GET /admin/producers/{id}/experiences`), «הוספת חוויה», «עריכה» ו«שכפול», עם `ExperienceForm` של בעל העסק ותיבת ההסכמה. לעסק בלי חשבון בעלים מופיע הסבר במקום הכפתור. שומר: `frontend/__tests__/AdminBusinessExperiences.test.jsx` (MEH-3876).
* `backend/app/routers/experiences.py`
* `backend/app/services/producer_images.py` — `first_image`: התמונה הראשונה (לא ריקה) של בית העסק המארח נשלחת בכל חוויה כ-`owner_image_url`, ושורה, כרטיס ודף חוויה בלי תמונה משלה מציגים אותה, כמו באירועים (MEH-3894). הטסטים `tests/test_meh3894_first_image.py` · `frontend/__tests__/MEH3894PhotoFallbacks.test.jsx`.
* `backend/app/services/experience_moderation.py` — בדיקת AI, נכשלת פתוח בלי `ANTHROPIC_API_KEY`.
* `backend/app/services/moderation_common.py` — הלקוח, קריאת התשובה והקריאה למודל המהיר, משותפים לבדיקת החוויות, המתכונים ומוצרי השכנים (MEH-3619).
* `backend/app/services/experience_sessions.py` — מועדים של סדנה חוזרת (MEH-3441): עד 12 קדימה, ומקומות, המתנה ורישום כפול לכל מועד. סדנה חוזרת בלי מועדים נשארת מאגר מקומות אחד.
* `frontend/components/ExperienceSessionsField.jsx` — «מועדים» בתוך «החוויה חוזרת» בטופס בעלת העסק (MEH-3447): שורה לכל מועד, הסרת מועד עם נרשמות שואלת קודם. עם `kind="course"` אותו רכיב מציג את מפגשי הקורס (MEH-3898).
* `backend/app/services/course_meetings.py` — קורס (MEH-3898): חוויה אחת עם 2 עד 20 מפגשים והרשמה אחת לכולם. השרת קובע את התאריך של החוויה לפי המפגש הראשון, ולכן ההרשמה נסגרת כשהוא מתחיל. קורס לא יכול להיות גם חוויה חוזרת, ומפגש שכבר התקיים נשאר ברשימה בלי שינוי (אחרת התאריך היה זז קדימה וההרשמה הייתה נפתחת באמצע הקורס). שינוי במפגשים שולח מייל לנרשמות: מפגש ראשון שזז במייל «המועד השתנה» הרגיל, וכל שינוי אחר במייל עם רשימת המפגשים החדשה (`backend/app/services/booking_cancellations.py`). בעמוד החוויה המפגשים מוצגים ב-`frontend/components/CourseMeetingsList.jsx`.
* `frontend/components/RegistrationCta.jsx` — כפתור ההרשמה. לחיצה על וואטסאפ, התקשרות או «שאלה» נספרת לבית העסק (`trackChannelClick`, MEH-2991), כמו בדף בית העסק. קישור הרשמה חיצוני לא נספר. שומר: `frontend/__tests__/RegistrationCtaContactCount.test.jsx`. לחיצה על וואטסאפ (הכפתור, רשימת ההמתנה או «שאלה» עם נייד) נשלחת גם ל-PostHog כאירוע `item_whatsapp_click`, עם סוג הדף, הפריט, בית העסק והקישור, כדי לראות כמה הרשמות נסגרות מחוץ לאתר. שום דבר לא נחסם (MEH-3194). שומר: `frontend/__tests__/RegistrationCtaOffSiteWhatsApp.test.jsx`. בטופס ההרשמה באתר, מתחת לכפתור, שורה שמציינת מול איזה בית עסק עושים את העסקה ושמהמקור לא צד לה (`frontend/components/public/NotAPartyLine.jsx`, MEH-3570).
* `frontend/components/RegistrationSessionSelect.jsx` — «מועד», השדה הראשון בטופס ההרשמה (MEH-3447). מועד מלא נשאר לבחירה והופך לרשימת ההמתנה של אותו מועד. רשימת הנרשמות בלוח הבקרה (`frontend/components/RegistrationsList.jsx`) מקובצת לפי מועד. שומר: `frontend/__tests__/ExperienceSessionsUi.test.jsx`.
* `frontend/lib/use-duplicate-source.js` — «שכפול» ברשימת החוויות פותח את `new?from=<id>` עם כל השדות מלאים חוץ מהתאריך. השורה נמצאת ב-`/experiences/mine` (MEH-3438). הטסט `frontend/__tests__/NewExperienceDashboardPage.test.jsx`.
* `frontend/components/admin/AdminFeedbackModal.jsx` — חלון המשוב של האדמין («לבקש שינויים» או «לדחות», עם הערה) בדף החוויות באדמין. משותף לחוויות ולמתכונים מאז MEH-3623.

**Flags.** אין.

**טסטים**
* `tests/test_experiences.py` · `tests/test_experience_moderation_unit.py`
* `tests/test_meh3441_session_signups.py` — **השומר** של המועדים: מועד מלא לצד מועד פנוי, אותה כתובת בשני מועדים, הסרת מועד מבטלת את ההרשמות שלו.
* `tests/test_meh3898_course_meetings.py` — **השומר** של הקורס: שמירת המפגשים, התאריך לפי המפגש הראשון, הרשמה אחת, סגירה כשהמפגש הראשון התחיל. בצד הלקוח `frontend/__tests__/ExperienceCourse.test.jsx`.
* `tests/test_meh2602_experience_category.py` · `tests/test_meh1176_experience_email_notifications.py` · `tests/test_meh3219_b12_recurring_experience.py`

**מזהי רישום שזה מכסה.** `experiences`.
