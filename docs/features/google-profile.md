# הפרופיל בגוגל

**מה הוא עושה.** כלי בלשונית «כלים» של לוח הבקרה (MEH-3641). בעלת העסק מקבלת מדריך קצר לפתיחה או לעדכון של פרופיל עסק בגוגל, עם הקישור לעמוד שלה להעתקה ועם הכלל של גוגל נגד תמורה על ביקורות. היא מוצאת את הפרופיל שלה בגוגל ומחברת אותו לעמוד: השרת מקבל חיבור רק כשהשם או הטלפון בגוגל תואמים לבית העסק, והאדמין מקבלת מייל «פרטים רגישים» כשעסק מאושר משנה אותו. אחרי החיבור היא יכולה לבדוק אם השם, הטלפון והאתר בגוגל זהים לעמוד שלה, ולראות את שעות הפתיחה של שני הצדדים זו ליד זו. החיבור הוא גם מה שמדליק את שורת הדירוג מגוגל בעמוד הציבורי (מ-20 ביקורות). מגוגל נשמר רק ה-place_id (תנאי השימוש, §3.2.3(b)). בלי מפתח Places הכלי מציג «לא זמין» ולא פונה לגוגל.

**Routes**
* `frontend/app/[locale]/producer/dashboard/google-profile/`

**קבצים מרכזיים**
* `frontend/components/producer/google-profile/GoogleProfileTool.jsx` — קורא את המצב ומרכיב את שלושת החלקים.
* `frontend/components/producer/google-profile/GoogleProfileLink.jsx` · `frontend/components/producer/google-profile/GoogleProfileCheck.jsx` · `frontend/components/producer/google-profile/GoogleProfileGuide.jsx`
* `backend/app/routers/producer_google_profile.py` — ארבעת ה-routes של הבעלים תחת `/producers/me/google-profile`, כל אחד מהם (חוץ מקריאת המצב) 10 בשעה.
* `backend/app/services/google_profile.py` — הקריאות לגוגל וההשוואה: שם (אחרי ניקוי, או אחד מכיל את השני), טלפון (נייד או קווי), אתר (האתר שלה או עמוד כאן).
* `backend/app/routers/google_rating.py` — הצד של האדמין ושורת הדירוג הציבורית, שקוראת את אותו place_id.

**Flags.** אין. משתמש ב-`GOOGLE_PLACES_API_KEY` הקיים.

**טסטים**
* `tests/test_meh3641_owner_google_profile.py` — **השומר**: חיבור רק בהתאמה, 409 על פרופיל של מישהו אחר, ניתוק בלי קריאה לגוגל, «לא זמין» בלי מפתח, שום דבר מגוגל לא נשמר, ומגבלת הקצב.
* `frontend/__tests__/GoogleProfileTool.test.jsx` — כל המצבים במסך: לא מחובר, 0 / 1 / כמה תוצאות, מחובר, בדיקה שלא רצה / הצליחה / נכשלה, «לא זמין».

**מזהי רישום שזה מכסה.** `google_profile`.
