# קבוצות רכישה

**מה הן עושות.** בית עסק פותח קבוצת רכישה עם מחיר רגיל ומחיר קבוצתי, מינימום משתתפים ומועד אחרון. לקוחות מתחייבות לכמות; כשהמינימום מושג הקבוצה ממומנת וממשיכה לקבל מצטרפות עד התקרה או המועד.

> המונח הנעול הוא **«קבוצת רכישה»**. ‏«קנייה קבוצתית», «רכישה קבוצתית» ו«קבוצת רכש» אסורים ונתפסים על ידי `scripts/checks/brand-lexicon-guard.sh` (‏`docs/BRAND.md` §7).

**Routes**
* `frontend/app/[locale]/group-buys/` — הרשימה הציבורית.
* `frontend/app/[locale]/group-buys/[id]/` — קבוצה אחת.
* `frontend/app/[locale]/producer/dashboard/group-buys/` — הניהול של בית העסק.
* `frontend/app/[locale]/admin/group-buys/` — המסך של הניהול.

**קבצים מרכזיים**
* `backend/app/routers/group_buys.py` — כל המסלולים. שימו לב להערה על `selectinload`: היא שייכת למסלולי הרשימה ולא ל-`_status_tab_query`, כי מסלול ה-`/counts` חולק את אותה שאילתה ורק סופר.
* `frontend/app/[locale]/group-buys/GroupBuysClient.jsx`

**Flags.** אין.

**טסטים**
* `tests/test_group_buys_api.py` — ה-API.
* `tests/test_meh0000_group_buys_query_count.py` — ספירת שאילתות: קבוצה אחת וארבע חייבות לעלות אותו מספר SELECT.
* `tests/test_meh2943_group_buy_commit_scoping.py` · `tests/test_meh3128_group_buy_counts.py` · `tests/test_group_buys_cancel_on_delist.py`
* `frontend/e2e/flows/manual/dashboard-offer-groupbuy.spec.ts`
* `frontend/__tests__/GroupBuyNotAParty.test.jsx` — כרטיס ההצטרפות נושא את ההבהרה «לא צד לעסקה» (`frontend/components/DirectoryDisclaimer.jsx`), כי שם מתחייבים להזמנה.

**מזהי רישום שזה מכסה.** `group_buys`.
