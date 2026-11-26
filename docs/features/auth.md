# הזדהות

**מה היא עושה.** התחברות והרשמה במייל וסיסמה, ‏Google ו-Apple, אימות מייל, איפוס סיסמה, ומחיקת חשבון.

**Routes**
* `frontend/app/[locale]/login/` · `frontend/app/[locale]/register/`
* `frontend/app/[locale]/forgot-password/` · `frontend/app/[locale]/reset-password/`
* `frontend/app/[locale]/verify-email/` · `frontend/app/[locale]/account-deleted/`
* `frontend/app/[locale]/settings/`

**קבצים מרכזיים**
* `backend/app/auth.py` — ה-JWT, ה-scope, ‏`token_version`, טביעת האצבע. **כל PR שנוגע כאן עובר גם בדיקת CVE בחיפוש רשת וגם `/security-review`** (`.claude/rules/security.md`).
* `backend/app/routers/auth.py`
* `backend/app/routers/auth_register_producer.py` — ‏`/auth/register/producer` ו-`/auth/register/producer/oauth` (הופרדו מ-`auth.py` ב-MEH-3293).
* `backend/app/config.py` — ‏`JWT_SECRET_KEY` נדרש ב-production; חסר = `RuntimeError` באתחול.
* `frontend/lib/safe-redirect.js` — יעד חזרה בטוח אחרי התחברות.
* `frontend/components/LoginPromptModal.jsx` + `frontend/components/LoginPromptGoogle.jsx` — החלונית «רוצה לשמור?» שאורחת רואה בשמירה / עדכונים / ביקורת / שריון סל / הצטרפות לקבוצת רכישה (MEH-3679): Google בתוך החלונית (נשארים בדף, והפעולה נגמרת לבד דרך `frontend/lib/pending-action.js`), ו«היכנסו» ל-/login (MEH-3661).
* `backend/app/routers/auth_google_code.py` + `backend/app/services/google_code_exchange.py` — ‏`POST /auth/google/code`: הכפתור של Google שלנו שולח את הקוד החד-פעמי מהחלון של Google, והשרת מחליף אותו אצל Google ב-ID token, בודק שהוא הונפק ל-client שלנו ושהמייל מאומת, ומחזיר אותו. השרת לא מחבר אף אחד בשלב הזה: האתר שולח את ה-token לאותה כתובת שהשתמש בה קודם. דורש `GOOGLE_CLIENT_SECRET` (MEH-3690).
* `frontend/components/ui/GoogleButton.jsx` + `frontend/lib/use-google-code-sign-in.js` — הכפתור «להמשיך עם Google» שלנו, בכל כניסה עם Google: `frontend/components/GoogleAuthButton.jsx` (התחברות, הרשמה, החלונית, דף הבעלות והזמנת בעלים), `frontend/components/ProducerOAuthButtons.jsx` (הרשמת עסק) ו-`frontend/components/AccountDeleteCard.jsx` (אימות לפני מחיקת חשבון). הוא מופיע יחד עם הדף, לחיצה פותחת את החלון של Google, והקוד שחוזר מוחלף ב-`POST /auth/google/code` ב-ID token שנשלח לאותה כתובת כמו קודם (`/auth/google`, `/auth/register/producer/oauth`, `/auth/me/delete`). הכפתור המצויר של Google לא נמצא יותר באתר (MEH-3690).
* `preloadGsiWhenIdle` ב-`frontend/lib/use-google-sign-in.js` טוען את הסקריפט של Google מראש, מ-`frontend/components/LoginPromptModal.jsx`: רק לאורחת שאישרה את כל העוגיות (`hasFullCookieConsent`, כמו האנליטיקס). בלי אישור, הבקשה ל-Google יוצאת רק כשהיא פותחת את החלונית בעצמה (MEH-3744).
* `frontend/lib/post-auth-return.js` — הדף שממנו לקוחה נרשמה באימייל, כדי שקישור האימות יחזיר אותה אליו (24 שעות, localStorage, MEH-3661).
* `frontend/lib/prehydration-flags-inline.js` — סקריפט inline ראשון ב-`<head>`: מסמן `data-cookie-answered` / `data-has-token` / `data-friday-mode` / `data-from-map` (MEH-3856) על `<html>` לפני ה-hydration, וחוסם שליחה נייטיבית של טופס `data-no-native-submit` (הסיסמה לא תגיע ל-URL). `/login` נבנה סטטי עם הטופס ב-HTML (MEH-2233).
* `backend/app/routers/users_me.py` + `backend/app/services/email_change_guard.py` — שינוי מייל: דורש סיסמה, 5 סיסמאות שגויות לשעה לכל חשבון, ומנתק את שאר המכשירים (MEH-3104, MEH-3425).
* **מפתח גישה לחשבון אדמין (MEH-3305).** `backend/app/services/admin_passkey.py` (בדיקות WebAuthn, כרטיס חד-פעמי, קודי שחזור), `backend/app/routers/admin_passkey.py` (‏`/auth/passkey/*`), `frontend/lib/webauthn.js`, `frontend/components/PasskeyRecoveryPanel.jsx` (שלב קוד השחזור ב-`/login`), `frontend/app/[locale]/admin/settings/PasskeySettings.jsx` (הוספה, הסרה, קודים). אדמין עם מפתח לא מקבל סשן מ-`/auth/login` / Google / Apple עד שהמפתח (או קוד) מאשר.

**Flags.** ‏`WEBAUTHN_RP_ID` + `WEBAUTHN_ORIGIN` — ריקים = מפתח הגישה כבוי (מקומי, תצוגות vercel.app). ‏OAuth מושבת בחן כשה-client id לא מוגדר (`tests/test_oauth_unconfigured.py`).

**טסטים**
* `tests/test_meh3372_login_per_email_limit.py` · `tests/test_auth.py` · `tests/test_expansion_auth_jwt.py` · `tests/test_auth_email_notify.py`
* `tests/test_meh3104_email_change_hardening.py` · `tests/test_meh3425_email_change_followup.py`
* `tests/test_meh3591_missing_emails.py` — המייל «הסיסמה בחשבון שונתה» אחרי שינוי ואחרי איפוס (MEH-3591).
* `tests/test_meh3305_admin_passkeys_routes.py` · `tests/test_meh3305_admin_passkeys_schema.py` · `frontend/__tests__/PasskeySignIn.test.jsx` · `frontend/__tests__/PasskeySettings.test.jsx`
* `tests/test_producer_oauth.py` · `tests/test_oauth_verify_4xx.py` · `tests/test_meh2080_oauth_terms_consent.py`
* `frontend/e2e/flows/30-login-journey-c.spec.ts` · `frontend/e2e/flows/manual/auth.spec.ts` · `frontend/e2e/flows/11-password-policy.spec.ts`
* `frontend/e2e/flows/25-role-reachability.spec.ts`
* `frontend/__tests__/LoginPromptModalGoogle.test.jsx` · `frontend/__tests__/VerifyEmailReturnsToOrigin.test.jsx` · `frontend/__tests__/PostAuthReturn.test.js` — Google בחלונית, החזרה לדף אחרי אימות, ואירועי המדידה (MEH-3661). `frontend/__tests__/GroupBuyJoinSignInInPlace.test.jsx` — הצטרפות לקבוצת רכישה אחרי Google בחלונית (MEH-3679).
* `tests/test_meh3690_google_code_exchange.py` — החלפת הקוד: טוקן של אפליקציה אחרת נדחה, מייל לא מאומת נדחה, בלי הסוד 503 (MEH-3690).
* `frontend/e2e/flows/_google-code-stub.ts` — תחליף ל-Google בבדיקות הדפדפן: החלון מחזיר קוד שהבדיקה בוחרת (MEH-3690).
* `frontend/__tests__/use-google-sign-in.test.jsx` — טעינת הסקריפט של Google פעם אחת, וטעינה חוזרת אחרי כישלון (MEH-3690).
* `frontend/__tests__/GoogleCodeSignIn.test.jsx` — הכפתור שלנו מופיע לפני שהסקריפט נטען, לחיצה פותחת את החלון, הקוד מוחלף, וסגירת החלון אינה שגיאה (MEH-3690).
* `frontend/__tests__/GsiPreload.test.jsx` — טעינה מראש לאורחות בלבד (MEH-3744).
* `frontend/__tests__/PrehydrationFlags.test.jsx` — הדגלים, חסימת השליחה הנייטיבית, וטופס ההתחברות ב-HTML של השרת.
* `frontend/__tests__/AuthHydrationNoFallback.test.jsx` — ההגדרה הראשונה של מצב ההתחברות לא מחזירה דף שעדיין בהידרציה למסך הטעינה (`startTransition` ב-`frontend/lib/auth-context.js`, MEH-3828).

**מזהי רישום שזה מכסה.** `social_signup`.
