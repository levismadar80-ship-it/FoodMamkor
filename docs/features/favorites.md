# מועדפים והתראות

**מה הם עושים.** לקוחה שומרת בית עסק, רואה את השמורים שלה במקום אחד, ומגדירה התראות על מה שחדש אצלם. בעמוד הבית יש «נצפו לאחרונה», שנשמר בדפדפן ולא בשרת.

**Routes**
* `frontend/app/[locale]/favorites/`
* `frontend/app/[locale]/messages/`

**קבצים מרכזיים**
* `frontend/app/[locale]/favorites/FavoritesClient.jsx` — כולל גיליון ההתראות ואת ה-parse-per-row המכוון (ראו `.claude/rules/frontend.md`, החריג של `.loose()`).
* `frontend/lib/guest-to-login-inline.js` — סקריפט inline ב-`frontend/app/[locale]/favorites/page.js`: אורחת בלי token עוברת ל-`/login` (עם `?redirect=` שחוזר לכאן) כבר כשה-HTML נקרא, לפני ה-JS. בניווט בתוך האתר הסקריפט לא רץ, והבדיקה ב-`FavoritesClient` מפנה כמו קודם (MEH-2233).
* `frontend/lib/recently-viewed.js` — «נצפו לאחרונה», תקרה של 5.
* `frontend/lib/favorites-cache.js` · `frontend/lib/use-favorite-producers.js` — רצועת «המועדפים שלכם» בבית שומרת את הגובה שלה בזמן הטעינה רק כשיש בדפדפן גם רמז מהביקור הקודם וגם התחברות שמורה (`token`). זה אותו תנאי של הסקריפט שרץ לפני הציור הראשון ב-`frontend/app/[locale]/home/HomeStaticBlocks.jsx`. רמז שנשאר אחרי שההתחברות פגה פתח את הרצועה וסגר אותה מיד, וגרם לקפיצה של 0.14 בדף הבית (MEH-3858).
* `frontend/components/ShareButton.jsx` · `frontend/lib/share-link.js`
* `frontend/components/AlertPrefsPanel.jsx` · `frontend/components/PhoneVerifyCard.jsx` · `backend/app/services/user_phone_verify.py` — התראות בוואטסאפ נשלחות רק למספר שאומת בקוד ושיש עליו הסכמה בתוקף. «הסר» מבטל את ההסכמה, וקוד חדש מחזיר אותה (MEH-3302). מאז MEH-3640 «הסר» עוצר כל תבנית וואטסאפ למספר הזה, לא רק התראות מועדפים, חוץ מקוד אימות שהיא ביקשה; כל הודעה מאוחרת יותר ממנה מבטלת את העצירה (`backend/app/services/whatsapp.py`, `tests/test_meh3640_optout_all_messages.py`).

**Flags.** אין.

**טסטים**
* `frontend/__tests__/GuestToLoginInline.test.js` — היעד שווה ל-`loginHrefBackHere`, ‏token שמור או אחסון חסום נשארים בדף.
* `frontend/e2e/flows/31-favorites-journey-d.spec.ts`
* `frontend/__tests__/useFavoriteProducersReserve.test.jsx` — רמז בלי התחברות שמורה לא שומר מקום.
* `frontend/e2e/flows/50-returning-visitor-no-shift.spec.ts` — הדפים המרכזיים נטענים עם אחסון של מבקרת חוזרת, ובלי קפיצה מעל 0.1 (MEH-3858).
* `frontend/e2e/flows/manual/share.spec.ts`
* `tests/test_meh3302_user_phone_verify.py` · `frontend/__tests__/AlertPrefsWhatsappPaused.test.jsx`

**מזהי רישום שזה מכסה.** `save_share`, `follower_updates` (הצד הצרכני).
