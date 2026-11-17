# הרשמה ואימוץ עסק

**מה היא עושה.** שלוש דרכים שבית עסק מגיע לאתר: הרשמה עצמית בטופס רב-שלבי, אימוץ של דף טיוטה שהצוות הכין (קישור claim), והזמנת בעלים. ‏`/join` הוא דף השיווק שמסביר מה בית עסק מקבל.

**Routes**
* `frontend/app/[locale]/register/` · `frontend/app/[locale]/register/producer/` · `frontend/app/[locale]/register/organizer/`
* `frontend/app/[locale]/join/` · `frontend/app/[locale]/join/pricing/`
* `frontend/app/[locale]/claim/` · `frontend/app/[locale]/claim/[token]/`
* `frontend/app/[locale]/owner-invite/` · `frontend/app/[locale]/owner-invite/[token]/`
* `frontend/app/[locale]/recommend/` — המלצה על בית עסק מצד הקהל.

**קבצים מרכזיים**
* `frontend/lib/wizard-step-numbers.js` — המספור בטופס הרב-שלבי: מספר של שלב הוא מיקומו הנראה, לא ערך ה-enum שלו.
* `backend/app/routers/producer_claim.py` · `frontend/components/admin/ClaimLinkPanel.jsx`
* `backend/app/services/pending_nudge.py` — מיילי ההמשך לעסק שלא סיים.
* `frontend/lib/business-features.js` — ממנו `/join` מרנדר את רשימת הכלים.

**Flags.** אין.

**טסטים**
* `frontend/e2e/flows/18-producer-register-wizard.spec.ts` · `frontend/e2e/flows/29-register-journey-a.spec.ts` · `frontend/e2e/flows/32-register-journey-b-oauth.spec.ts`
* `frontend/e2e/flows/manual/register-producer.spec.ts` · `frontend/e2e/flows/manual/join.spec.ts`
* `frontend/e2e/flows/46-owner-invite.spec.ts` · `tests/test_producer_owner_invite.py` · `tests/test_producer_claim.py`
* `tests/test_expansion_registration.py` · `tests/test_organizer_registration.py`

**מזהי רישום שזה מכסה.** `draft_claim`, `social_signup`, `onboarding_emails`, `wa_approval`, `guides`.
