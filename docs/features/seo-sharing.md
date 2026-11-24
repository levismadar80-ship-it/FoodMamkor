# ‏SEO ושיתוף

**מה הוא עושה.** איך דף נראה לגוגל ולסוכן AI, ואיך הוא נראה כשמישהי משתפת אותו בוואטסאפ: canonical, ‏hreflang, ‏og:url, ‏sitemap, ‏structured data, ‏robots, כרטיסי שיתוף ו-QR.

**Routes**
* `frontend/app/sitemap.js` — ה-sitemap. ‏robots הוא קובץ סטטי: `frontend/public/robots.txt`. מאז MEH-3638: דפי תוכן נכנסים רק בעברית ובלי hreflang, כל `<loc>` מקודד, ואין `<lastmod>` (לא היה תאריך עדכון אמיתי).
* `frontend/app/[locale]/layout.js` — ה-metadata הבסיסי וה-`generateMetadata` לכל locale.

**קבצים מרכזיים**
* `frontend/lib/i18n-seo.js` — ‏`urlForLocalePath` ו-`buildAlternates`: מקור אחד ל-canonical ול-og:url, כך שהשניים לא יכולים לסתור.
  ‏`buildUntranslatedEntityMeta` (MEH-3638): לדף שהתוכן העיקרי שלו עברית שבית העסק כתב (עסק, מתכון, אירוע, מארגן, חוויה, רכישה קבוצתית) אין צמד hreflang, וגרסת ה-/en שלו היא `noindex, follow`. כך גוגל לא רואה בדף שרק המסגרת שלו תורגמה כפילות. כשיהיה תרגום אמיתי (MEH-3637), מסירים את זה רק לדף שתורגם.
* `frontend/lib/env.client.js` — ‏`SITE_URL`. ‏`resolveSiteUrl()` מפיל את הבנייה כש-`VERCEL_ENV=production` וה-host נראה כמו staging.
* `frontend/lib/sitemap-static.js` — הדפים הסטטיים ב-sitemap, ובהם `/producers`.
* `frontend/lib/seo.js` — ה-structured data.
* `frontend/lib/og-site-image.js` — ‏`siteOgImageUrl(locale)`: תמונת השיתוף של האתר (JPEG קל, אנגלית ב-/en). דף שכותב `openGraph` משלו מאבד את התמונה של ה-layout, ולכן נותן אותה בעצמו, מכאן (MEH-3590).
* `frontend/lib/guide-metadata.js` — ‏`buildGuideMetadata`: ה-metadata של שלושת המדריכים לבתי עסק, במקום שלושה עותקים (MEH-3590).
* `frontend/lib/legal-page-metadata.js` — ‏`buildLegalPageMetadata`: ה-metadata של דפי הפרטיות, התנאים והצהרת הנגישות, במקום שלושה עותקים (MEH-3623).
* `frontend/components/StoryCardCanvas.jsx` · `frontend/components/ReviewCardCanvas.jsx` — כרטיסי שיתוף.
* `frontend/components/producer/FeedPostCanvas.jsx` · `frontend/components/producer/feed-post-draw.js` · `frontend/lib/share-post.js` — פוסט 4:5 מוכן לשיתוף, לפי רגע (השבוע · מוצר חדש · חג), עם קישור מתויג `?from=share` (MEH-3330).
* `frontend/components/producer/LinkEverywhere.jsx` — «הקישור שלך בכל מקום»: ארבעה מקומות לקישור, העתקה ו«עשיתי» (localStorage). `frontend/components/producer/ShareVisitsLine.jsx` — שורת «כניסות מהשיתופים שלך» בתובנות, מ-`share_visits` (MEH-3331).
* `frontend/lib/qr.js` · `frontend/components/producer/BusinessQrCard.jsx`
* `frontend/public/robots.txt` — מי חסום ומי לא. ‏ClaudeBot חסום, ‏Claude-User מותר; ‏GPTBot חסום, ‏OAI-SearchBot מותר. הדוח: `docs/audits/2026-11-ai-crawler-access.md`.

**Flags.** אין.

**טסטים**
* `frontend/__tests__/OgUrlPerLocale.test.js`
* `frontend/__tests__/GoogleSeoRulesMeh3638.test.js` · `frontend/__tests__/sitemap.test.js` (`MEH-3638`) — noindex ל-/en, כתובת וטלפון ‎+972 ב-JSON-LD, קידוד ה-sitemap.
* `frontend/__tests__/OgSiteImage.test.js` · `scripts/checks/og-site-image-guard.sh` — כל openGraph עם תמונה, ואין PNG כבד (MEH-3590).
* `frontend/e2e/flows/39-en-locale-direction.spec.ts` · `frontend/e2e/flows/41-not-found-chrome.spec.ts`
* `frontend/e2e/flows/manual/link-crawl.spec.ts`
* `tests/test_link_preview_check.py`
* `frontend/__tests__/FeedPostCanvas.test.jsx` · `frontend/__tests__/LinkEverywhere.test.jsx` · `tests/test_analytics.py` (`TestShareVisits`) — ערכת השיתוף וספירת הכניסות (MEH-3330, MEH-3331).

**מזהי רישום שזה מכסה.** `structured_data`, `share_cards`, `qr_code`, `vanity_link`.
