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
* `frontend/lib/qr.js` · `frontend/components/producer/BusinessQrCard.jsx`
* `frontend/public/robots.txt` — מי חסום ומי לא. ‏ClaudeBot חסום, ‏Claude-User מותר; ‏GPTBot חסום, ‏OAI-SearchBot מותר. הדוח: `docs/audits/2026-11-ai-crawler-access.md`.

**Flags.** אין.

**טסטים**
* `frontend/__tests__/OgUrlPerLocale.test.js`
* `frontend/e2e/flows/39-en-locale-direction.spec.ts` · `frontend/e2e/flows/41-not-found-chrome.spec.ts`
* `frontend/e2e/flows/manual/link-crawl.spec.ts`
* `tests/test_link_preview_check.py`

**מזהי רישום שזה מכסה.** `structured_data`, `share_cards`, `qr_code`, `vanity_link`.
