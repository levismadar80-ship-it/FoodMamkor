# ביקורות

**מה הן עושות.** לקוחה שיצרה קשר עם בית עסק יכולה לכתוב ביקורת. הביקורת עוברת בדיקת AI, בית העסק יכול להשיב, והניהול יכול להסתיר. יש דיווח על ביקורת מתוך תפריט ⋮.

**Routes**
* `frontend/app/[locale]/producer/dashboard/reviews/`
* `frontend/app/[locale]/admin/reviews/`
* הביקורות עצמן מרונדרות בתוך דף בית העסק.

**קבצים מרכזיים**
* `backend/app/routers/reviews.py`
* `backend/app/routers/review_reply_suggest.py` · `backend/app/services/reply_writer.py` — «הצעת תשובה» (MEH-3480): `POST /reviews/{review_id}/reply/suggest`, רק בעלת העסק שעליו הביקורת. טיוטה בלבד; שום דבר לא נשמר או נשלח עד «שמירה» (`PUT /reviews/{review_id}/reply`, שבודקת אותה). משפט שמבטיח החזר, זיכוי, הנחה, מתנה או משהו בחינם יורד — הסינון הוא רשימה, best-effort, ושמירת התשובה עדיין עוברת בדיקה.
* `frontend/components/AiTextSuggest.jsx` — הכפתור והתצוגה המקדימה הניתנת לעריכה, משותפים עם «הצעת תיאור» של מוצר.
* `backend/app/services/review_conflicts.py` — ביקורת של מי שהיא עכשיו הבעלים של העסק, או של עסק מאותה קטגוריה, יורדת מהרשימה הציבורית ומהדירוג. מחושב בכל קריאה, לא נשמר.
* `frontend/components/ReviewsSection.jsx`
* `frontend/components/producer/RequestReviewCard.jsx` — בקשת ביקורת מלקוחה.
* `frontend/components/ReviewCardCanvas.jsx` — כרטיס שיתוף של ביקורת.

**Flags.** אין. בדיקת ה-AI נכשלת פתוח בלי `ANTHROPIC_API_KEY`: ביקורת נשמרת בלי verdict ונבדקת שוב בשמירה הבאה. «הצעת תשובה» בלי מפתח עונה 503 בעברית, ובעלת העסק כותבת בעצמה.

**טסטים**
* `tests/test_reviews.py`
* `tests/test_meh2349_review_ai_flag.py` · `tests/test_meh2390_review_fail_open_rechecks.py`
* `tests/test_meh2348_review_hide_sticky.py` · `tests/test_meh2381_review_edited_after_hidden.py` · `tests/test_meh2389_review_hide_not_found_code.py` · `tests/test_meh2409_deleted_review_edit_404.py`
* `tests/test_meh3221_reviews_public_name.py` · `tests/test_meh3223_report_admin_email.py`
* `tests/test_meh3480_review_reply_suggest.py` · `frontend/__tests__/ReviewReplySuggest.test.jsx` — «הצעת תשובה»: רק הבעלים, כלום לא נשמר, הבטחות יורדות, מגבלות.
* `tests/test_meh3258_review_conflicts.py` — ניגוד עניינים (בעלים / מתחרה) וכל הטריגרים לחישוב הדירוג מחדש.

**מזהי רישום שזה מכסה.** `reviews_contacted`, `review_request`.
