# ביקורות

**מה הן עושות.** לקוחה שיצרה קשר עם בית עסק יכולה לכתוב ביקורת. הביקורת עוברת בדיקת AI, בית העסק יכול להשיב, והניהול יכול להסתיר. יש דיווח על ביקורת מתוך תפריט ⋮.

**Routes**
* `frontend/app/[locale]/producer/dashboard/reviews/`
* `frontend/app/[locale]/admin/reviews/`
* הביקורות עצמן מרונדרות בתוך דף בית העסק.

**קבצים מרכזיים**
* `backend/app/routers/reviews.py`
* `frontend/components/ReviewsSection.jsx`
* `frontend/components/producer/RequestReviewCard.jsx` — בקשת ביקורת מלקוחה.
* `frontend/components/ReviewCardCanvas.jsx` — כרטיס שיתוף של ביקורת.

**Flags.** אין. בדיקת ה-AI נכשלת פתוח בלי `ANTHROPIC_API_KEY`: ביקורת נשמרת בלי verdict ונבדקת שוב בשמירה הבאה.

**טסטים**
* `tests/test_reviews.py`
* `tests/test_meh2349_review_ai_flag.py` · `tests/test_meh2390_review_fail_open_rechecks.py`
* `tests/test_meh2348_review_hide_sticky.py` · `tests/test_meh2381_review_edited_after_hidden.py` · `tests/test_meh2389_review_hide_not_found_code.py` · `tests/test_meh2409_deleted_review_edit_404.py`
* `tests/test_meh3221_reviews_public_name.py` · `tests/test_meh3223_report_admin_email.py`

**מזהי רישום שזה מכסה.** `reviews_contacted`, `review_request`.
