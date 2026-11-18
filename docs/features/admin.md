# ניהול

**מה הוא עושה.** תורי האישור והמודרציה: בתי עסק ממתינים, מתכונים, ביקורות, חוויות, קבוצות רכישה, דיווחים, בקשות קטגוריה ושינוי שם, כשרות, פנייה יזומה, והגדרות.

> **«נבדק בנייד» חל על כל מסך `/admin`.** טבלאות ניהול נושאות `.table-stack` (כרטיס לשורה מתחת ל-md), ו-`frontend/__tests__/AdminTablesStackGuard.test.js` אוכף את זה.

**Routes**
* `frontend/app/[locale]/admin/` ועוד שלוש-עשרה תת-לשוניות, בהן `frontend/app/[locale]/admin/producers/`, `frontend/app/[locale]/admin/recipes/`, `frontend/app/[locale]/admin/reviews/`, `frontend/app/[locale]/admin/reports/`, `frontend/app/[locale]/admin/kashrut/`, `frontend/app/[locale]/admin/outreach/`, `frontend/app/[locale]/admin/settings/`, `frontend/app/[locale]/admin/analytics/`, `frontend/app/[locale]/admin/billing/`.
* `frontend/app/[locale]/admin/producers/new/` · `frontend/app/[locale]/admin/producers/[id]/edit/`
* `frontend/app/[locale]/admin/audit-log/` — מסך יומן הפעולות (MEH-3306), לקריאה בלבד.

**קבצים מרכזיים**
* `backend/app/routers/admin.py`
* `backend/app/services/admin_audit.py` — יומן הפעולות (MEH-3306): שורה לכל שינוי מוצלח של חשבון אדמין, נכתבת מתוך `backend/app/auth.py`. קריאה: `GET /admin/audit-log` ב-`backend/app/routers/admin_extra.py`.
* `frontend/components/admin/AdminRowMenu.jsx`
* `frontend/app/[locale]/admin/audit-log/page.jsx` — מסך יומן הפעולות: 50 שורות, «הצגת פעולות קודמות» לפי (created_at, id).
* `backend/app/services/producer_risk.py` — דירוג סיכון לפני אישור.
* `backend/app/routers/admin_whatsapp.py` + `frontend/components/admin/WhatsappBlockedSection.jsx` — במסך `frontend/app/[locale]/admin/whatsapp-failures/`: הודעות שלא נמסרו, ומחוץ ל-production גם הודעות שהשומר חסם, עם התוכן (MEH-3402; קוד כניסה מוסתר).

**Flags.** אין. ‏`SUPER_ADMIN_EMAIL` הוא הגדרת סביבה, לא flag.

**טסטים**
* `tests/test_admin_approval_transitions.py` · `tests/test_admin_queue_sla_aging.py` · `tests/test_admin_producer_delete_cascade.py` · `tests/test_admin_error_no_leak.py`
* `tests/test_meh3306_admin_audit_log.py` — **השומר** של יומן הפעולות; `frontend/__tests__/AdminAuditLogPage.test.jsx` — המסך (0 / 1 / עמוד מלא + דפדוף).
* `tests/test_meh3402_blocked_capture.py` — **השומר** של לכידת ההודעות שנחסמו.
* `tests/test_expansion_admin_authz.py` · `tests/test_meh2900_admin_role_endpoint.py` · `tests/test_meh2890_super_admin_env.py`
* `frontend/e2e/flows/30-admin-panel-tabs.spec.ts` · `frontend/e2e/flows/33-admin-producers-tab.spec.ts`
* `frontend/e2e/flows/manual/admin-producers-queue.spec.ts` · `admin-producers-decisions.spec.ts` · `admin-users-reviews-categories.spec.ts` · `admin-settings-licence-actions.spec.ts` (תחת `frontend/e2e/flows/manual/`)

**מזהי רישום שזה מכסה.** `kashrut_verified`, `verified_badge`, `editor_pick` (צד ההחלטה).
