# הרשמה ואימוץ עסק

**מה היא עושה.** ארבע דרכים שבית עסק מגיע לאתר: הרשמה עצמית בטופס רב-שלבי, אימוץ של דף טיוטה שהצוות הכין (קישור claim), הזמנת בעלים, ופרסום טיוטה באישור כתוב של בעלת העסק אחרי שראתה אותה בקישור תצוגה מקדימה (MEH-3377). ‏`/join` הוא דף השיווק שמסביר מה בית עסק מקבל.

**הטופס לבית עסק — 3 שלבים (MEH-3656).** חשבון → פרטי העסק → קטגוריה, וההסכמות וכפתור «הצטרפו» בשלב הקטגוריה. אין מסך פתיחה לפני השלב הראשון, ואין שלב סיפור לבית עסק: תיאור, משפט קצר וקישור לחנות חיצונית נכתבים בלוח הבקרה אחרי ההרשמה. השאלה «איך הגעתם אלינו» (אופציונלית) נשאלת בשלב הקטגוריה, האחרון, מאז MEH-3697 — רכיב אחד לשני המסלולים: `frontend/app/[locale]/register/producer/steps/ReferralSourceField.jsx`. לכל שדה בבקשת ההרשמה יש «בית» — שלב בהרשמה או כרטיס בלוח הבקרה — ברשימה `frontend/lib/signup-field-homes.json` (MEH-3699); שדה שיוצא מההרשמה בלי בית בלוח הבקרה מפיל את `frontend/__tests__/RegisterProducerClient-01.test.jsx`, ושדה חדש בסכמה בלי שורה ברשימה מפיל את `tests/test_meh3699_signup_field_homes.py`. בכל יום ראשון נבדק אחוז העסקים החדשים שענו «מאיפה שמעתם» ושיש להם מיקום, וכשאחד מהם 0% (מ-3 הרשמות ומעלה) נרשמת אזהרה ב-Sentry עם התג `signup_fill_zero` (`backend/app/services/signup_fill_digest.py`); סבב הבוקר היומי של Claude ‏(«סבב בוקר: בריאות האתר») קורא אותה ומטפל, בלי מייל למנהלת המערכת. שלב הסיפור נשאר רק למארגני אירועים. ההסכמות עצמן נמצאות ברכיב אחד שמשמש את שני המסלולים: `frontend/app/[locale]/register/producer/steps/ConsentSubmit.jsx`.

**Routes**
* `frontend/app/[locale]/register/` · `frontend/app/[locale]/register/producer/` · `frontend/app/[locale]/register/organizer/`
* `frontend/app/[locale]/join/` · `frontend/app/[locale]/join/pricing/`
* `frontend/app/[locale]/claim/` · `frontend/app/[locale]/claim/[token]/`
* `frontend/app/[locale]/owner-invite/` · `frontend/app/[locale]/owner-invite/[token]/`
* `frontend/app/[locale]/draft-preview/[token]/` — הטיוטה כמו שתיראה באתר, לקריאה בלבד.
* `frontend/app/[locale]/recommend/` — המלצה על בית עסק מצד הקהל.

**קבצים מרכזיים**
* `frontend/lib/wizard-step-numbers.js` — המספור בטופס הרב-שלבי: מספר של שלב הוא מיקומו הנראה, לא ערך ה-enum שלו.
* `backend/app/routers/auth_register_producer.py` — הרשמה עצמית של בית עסק, בסיסמה וב-Google/Apple (MEH-3293).
* `backend/app/routers/producer_claim.py` · `frontend/components/admin/ClaimLinkPanel.jsx` (renders `frontend/components/admin/AdminLinkPanel.jsx`, shared with the preview-link panel, MEH-3464)
* `frontend/app/[locale]/claim/claim-metadata.js` — התצוגה המקדימה של קישור ה-claim בוואטסאפ: עם טוקן תקף היא מציגה את שם העסק ואת התמונה הראשית; טוקן שפג או בוטל, או תקלה בשרת, משאירים את הכרטיס הכללי. הטוקן לא נכתב לאף תגית (MEH-3403).
* `backend/app/services/auth_notifications.py` — `notify_admin_draft_claimed`: מייל לאדמין כשבעלת עסק קולטת טיוטה (MEH-3410; בלי וואטסאפ מאז MEH-3589).
* `backend/app/services/admin_draft_missing.py` · `frontend/app/[locale]/admin/producers/AdminDraftMissing.jsx` — מה חסר בטיוטה שנקלטה, ברשימת האדמין (MEH-3409).
* `backend/app/routers/producer_draft_preview.py` · `backend/app/services/draft_preview.py` · `frontend/components/admin/DraftPreviewLinkPanel.jsx` (also renders `frontend/components/admin/AdminLinkPanel.jsx`) · `frontend/components/admin/PublishWithConsentPanel.jsx` · `frontend/scripts/capture-page-video.mjs`
* `frontend/app/[locale]/owner-invite/OwnerInviteConsents.jsx` — תיבת ההסכמה האחת (תנאים + הצהרת רישוי, ההצהרה המלאה נפתחת בלחיצה) והצהרת החקלאית, משותפת להזמנת בעלים ול-claim. בהזמנת בעלים הטופס נפתח שלב אחרי שלב (מייל, קוד, סיסמה ותיבה), ויש «המשך עם Google» שמעביר לטופס של חשבון קיים (MEH-3662). כניסה עם Google שנעשתה בדף הזה לפני פחות מ-5 דקות מחליפה שם את הקוד במייל (MEH-3675, `backend/app/services/owner_invite_google.py`, `frontend/app/[locale]/owner-invite/useFreshGoogleCredential.js`).
* `backend/app/services/pending_nudge.py` — מיילי ההמשך לעסק שלא סיים.
* `frontend/lib/business-features.js` — ממנו `/join` מרנדר את רשימת הכלים.

**Flags.** אין.

**טסטים**
* `frontend/e2e/flows/18-producer-register-wizard.spec.ts` · `frontend/e2e/flows/29-register-journey-a.spec.ts` · `frontend/e2e/flows/32-register-journey-b-oauth.spec.ts`
* `frontend/e2e/flows/manual/register-producer.spec.ts` · `frontend/e2e/flows/manual/join.spec.ts`
* `frontend/e2e/flows/46-owner-invite.spec.ts` · `tests/test_producer_owner_invite.py` · `tests/test_producer_claim.py` · `tests/test_meh3246_invite_gates.py` · `tests/test_meh3268_accept_keeps_incomplete_page_hidden.py` · `tests/test_meh3675_owner_invite_google_fresh.py` · `frontend/__tests__/OwnerInviteExistingGoogle.test.jsx`
* `tests/test_producer_draft_preview.py` · `frontend/__tests__/DraftPreviewConsentPublish.test.jsx`
* `frontend/__tests__/ClaimLinkPreviewMetadata.test.js`
* `frontend/__tests__/OwnerInviteAcceptSignsIn.test.jsx` · `frontend/__tests__/OwnerInviteExistingAccount.test.jsx` · `frontend/__tests__/ClaimPage.test.jsx`
* `tests/test_meh3409_admin_draft_missing.py` · `frontend/__tests__/AdminDraftMissing.test.jsx`
* `tests/test_expansion_registration.py` · `tests/test_organizer_registration.py`
* פיילוט MEH-2913 (קטגוריות 5, רישיון לפי קטגוריה, «איך קונים» בשתי תיבות, קישור לחנות): `frontend/e2e/flows/38-register-delivery-axis.spec.ts` · `frontend/__tests__/RegisterDeliveryAxis.test.jsx` · `frontend/__tests__/CategoryStepLicenseHint.test.jsx` · `frontend/__tests__/StoreLinkForPayload.test.js` · `tests/test_meh2938_register_store_link.py` · `tests/test_producer_categories.py`

**מזהי רישום שזה מכסה.** `draft_claim`, `social_signup`, `onboarding_emails`, `wa_approval`, `guides`.
