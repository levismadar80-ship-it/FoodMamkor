# מועדפים והתראות

**מה הם עושים.** לקוחה שומרת בית עסק, רואה את השמורים שלה במקום אחד, ומגדירה התראות על מה שחדש אצלם. בעמוד הבית יש «נצפו לאחרונה», שנשמר בדפדפן ולא בשרת.

**Routes**
* `frontend/app/[locale]/favorites/`
* `frontend/app/[locale]/messages/`

**קבצים מרכזיים**
* `frontend/app/[locale]/favorites/FavoritesClient.jsx` — כולל גיליון ההתראות ואת ה-parse-per-row המכוון (ראו `.claude/rules/frontend.md`, החריג של `.loose()`).
* `frontend/lib/recently-viewed.js` — «נצפו לאחרונה», תקרה של 5.
* `frontend/components/ShareButton.jsx` · `frontend/lib/share-link.js`
* `frontend/components/AlertPrefsPanel.jsx` · `frontend/components/PhoneVerifyCard.jsx` · `backend/app/services/user_phone_verify.py` — התראות בוואטסאפ נשלחות רק למספר שאומת בקוד ושיש עליו הסכמה בתוקף. «הסר» מבטל את ההסכמה, וקוד חדש מחזיר אותה (MEH-3302).

**Flags.** אין.

**טסטים**
* `frontend/e2e/flows/31-favorites-journey-d.spec.ts`
* `frontend/e2e/flows/manual/share.spec.ts`
* `tests/test_meh3302_user_phone_verify.py` · `frontend/__tests__/AlertPrefsWhatsappPaused.test.jsx`

**מזהי רישום שזה מכסה.** `save_share`, `follower_updates` (הצד הצרכני).
