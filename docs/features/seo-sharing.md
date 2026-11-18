# ‏SEO ושיתוף

**מה הוא עושה.** איך דף נראה לגוגל ולסוכן AI, ואיך הוא נראה כשמישהי משתפת אותו בוואטסאפ: canonical, ‏hreflang, ‏og:url, ‏sitemap, ‏structured data, ‏robots, כרטיסי שיתוף ו-QR.

**Routes**
* `frontend/app/sitemap.js` — ה-sitemap. ‏robots הוא קובץ סטטי: `frontend/public/robots.txt`.
* `frontend/app/[locale]/layout.js` — ה-metadata הבסיסי וה-`generateMetadata` לכל locale.

**קבצים מרכזיים**
* `frontend/lib/i18n-seo.js` — ‏`urlForLocalePath` ו-`buildAlternates`: מקור אחד ל-canonical ול-og:url, כך שהשניים לא יכולים לסתור.
* `frontend/lib/env.client.js` — ‏`SITE_URL`. ‏`resolveSiteUrl()` מפיל את הבנייה כש-`VERCEL_ENV=production` וה-host נראה כמו staging.
* `frontend/lib/sitemap-static.js` — הדפים הסטטיים ב-sitemap, ובהם `/producers`.
* `frontend/lib/seo.js` — ה-structured data.
* `frontend/components/StoryCardCanvas.jsx` · `frontend/components/ReviewCardCanvas.jsx` — כרטיסי שיתוף.
* `frontend/components/producer/FeedPostCanvas.jsx` · `frontend/components/producer/feed-post-draw.js` · `frontend/lib/share-post.js` — פוסט 4:5 מוכן לשיתוף, לפי רגע (השבוע · מוצר חדש · חג), עם קישור מתויג `?from=share` (MEH-3330).
* `frontend/components/producer/LinkEverywhere.jsx` — «הקישור שלך בכל מקום»: ארבעה מקומות לקישור, העתקה ו«עשיתי» (localStorage). `frontend/components/producer/ShareVisitsLine.jsx` — שורת «כניסות מהשיתופים שלך» בתובנות, מ-`share_visits` (MEH-3331).
* `frontend/lib/qr.js` · `frontend/components/producer/BusinessQrCard.jsx`
* `frontend/public/robots.txt` — מי חסום ומי לא. ‏ClaudeBot חסום, ‏Claude-User מותר; ‏GPTBot חסום, ‏OAI-SearchBot מותר. הדוח: `docs/audits/2026-11-ai-crawler-access.md`.

**Flags.** אין.

**טסטים**
* `frontend/__tests__/OgUrlPerLocale.test.js`
* `frontend/e2e/flows/39-en-locale-direction.spec.ts` · `frontend/e2e/flows/41-not-found-chrome.spec.ts`
* `frontend/e2e/flows/manual/link-crawl.spec.ts`
* `tests/test_link_preview_check.py`
* `frontend/__tests__/FeedPostCanvas.test.jsx` · `frontend/__tests__/LinkEverywhere.test.jsx` · `tests/test_analytics.py` (`TestShareVisits`) — ערכת השיתוף וספירת הכניסות (MEH-3330, MEH-3331).

**מזהי רישום שזה מכסה.** `structured_data`, `share_cards`, `qr_code`, `vanity_link`.
