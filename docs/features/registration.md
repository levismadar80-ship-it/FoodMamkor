# הרשמה ואימוץ עסק

**מה היא עושה.** ארבע דרכים שבית עסק מגיע לאתר: הרשמה עצמית בטופס רב-שלבי, אימוץ של דף טיוטה שהצוות הכין (קישור claim), הזמנת בעלים, ופרסום טיוטה באישור כתוב של בעלת העסק אחרי שראתה אותה בקישור תצוגה מקדימה (MEH-3377). ‏`/join` הוא דף השיווק שמסביר מה בית עסק מקבל.

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
* `backend/app/routers/producer_claim.py` · `frontend/components/admin/ClaimLinkPanel.jsx`
* `frontend/app/[locale]/claim/claim-metadata.js` — התצוגה המקדימה של קישור ה-claim בוואטסאפ: עם טוקן תקף היא מציגה את שם העסק ואת התמונה הראשית; טוקן שפג או בוטל, או תקלה בשרת, משאירים את הכרטיס הכללי. הטוקן לא נכתב לאף תגית (MEH-3403).
* `backend/app/services/admin_draft_missing.py` · `frontend/app/[locale]/admin/producers/AdminDraftMissing.jsx` — מה חסר בטיוטה שנקלטה, ברשימת האדמין (MEH-3409).
* `backend/app/routers/producer_draft_preview.py` · `backend/app/services/draft_preview.py` · `frontend/components/admin/DraftPreviewLinkPanel.jsx` · `frontend/components/admin/PublishWithConsentPanel.jsx` · `frontend/scripts/capture-page-video.mjs`
* `backend/app/services/pending_nudge.py` — מיילי ההמשך לעסק שלא סיים.
* `frontend/lib/business-features.js` — ממנו `/join` מרנדר את רשימת הכלים.

**Flags.** אין.

**טסטים**
* `frontend/e2e/flows/18-producer-register-wizard.spec.ts` · `frontend/e2e/flows/29-register-journey-a.spec.ts` · `frontend/e2e/flows/32-register-journey-b-oauth.spec.ts`
* `frontend/e2e/flows/manual/register-producer.spec.ts` · `frontend/e2e/flows/manual/join.spec.ts`
* `frontend/e2e/flows/46-owner-invite.spec.ts` · `tests/test_producer_owner_invite.py` · `tests/test_producer_claim.py` · `tests/test_meh3246_invite_gates.py` · `tests/test_meh3268_accept_keeps_incomplete_page_hidden.py`
* `tests/test_producer_draft_preview.py` · `frontend/__tests__/DraftPreviewConsentPublish.test.jsx`
* `frontend/__tests__/ClaimLinkPreviewMetadata.test.js`
* `tests/test_meh3409_admin_draft_missing.py` · `frontend/__tests__/AdminDraftMissing.test.jsx`
* `tests/test_expansion_registration.py` · `tests/test_organizer_registration.py`

**מזהי רישום שזה מכסה.** `draft_claim`, `social_signup`, `onboarding_emails`, `wa_approval`, `guides`.
