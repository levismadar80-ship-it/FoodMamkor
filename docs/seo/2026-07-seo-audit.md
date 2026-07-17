# דוח ביקורת SEO טכני — יולי 2026 (MEH-1060 Chunk A)

> **⚠️ STOP-condition TRIGGERED — נרשם וממשיכים (לפי הנחיית ה-Chunk):**
> הציפייה הייתה JSON-LD יחיד (FAQPage ב-`/about/for-businesses`, MEH-579). בפועל קיימים
> **7 אתרי הזרקה של JSON-LD**, כולם מנותבים דרך `serializeJsonLd` (`frontend/lib/seo.js:33`):
> 1. דף הבית — Organization + WebSite + SearchAction (`frontend/app/[locale]/page.js:73-76`, builder: `frontend/lib/seo.js:384-417`, MEH-804)
> 2. `/[slug]` — @graph מלא: FoodEstablishment + BreadcrumbList + WebPage + WebSite + Organization (`frontend/app/[locale]/[slug]/page.js:66-75`, builder: `frontend/lib/seo.js:221-373`, MEH-9/172/452)
> 3. `/producer/[id]` — אותו @graph (`frontend/app/[locale]/producer/[id]/page.js:50-59`)
> 4. `/events/[id]` — Event + BreadcrumbList (`frontend/app/[locale]/events/[id]/page.js:79-88`, builder: `frontend/lib/seo.js:466-543`, MEH-1062)
> 5. מתכון — Recipe (`frontend/components/public/RecipeJsonLd.jsx:76`, MEH-591)
> 6. מתכון — BreadcrumbList נפרד (`frontend/app/[locale]/[slug]/recipes/[recipe_id]/page.jsx:134-139`, MEH-1062)
> 7. `/about/for-businesses` — FAQPage (`frontend/app/[locale]/about/for-businesses/page.js:119-122`, MEH-579)
>
> **משמעות ל-B1/B2:** התכולה המקורית של B1 (Organization/WebSite + FoodEstablishment) ושל B2
> (Recipe/Event/BreadcrumbList) **כבר ממומשת** ב-staging. B1/B2 דורשים re-scope לפני dispatch — ראו הצעת חלוקה בסוף.

**היקף:** ניתוח קוד סטטי בלבד (ה-sandbox לא מגיע ל-URLs של staging — MEH-360). לא בוצע אימות live של HTML מרונדר.
**Surfaces:** `/` · `/map` · `/producers` · `/producer/[id]` · `/[slug]` · מתכונים (רשימה+פרט) · אירועים (רשימה+פרט) · `/about` · `/about/for-businesses` · `/register` · `/terms` · `/privacy`.
**עדשה:** `.claude/skills/seo-audit/SKILL.md` (checklist בלבד; לא הופעלה שרשרת שיווקית).

---

## ממצאים

פורמט: `SEO-NN · surface · file:line · ממצא · severity · dup-check`

| # | Surface | file:line | ממצא | Sev | Dup |
|---|---|---|---|---|---|
| SEO-01 | /producer/[id] | `frontend/app/[locale]/producer/[id]/page.js:24-25` vs `frontend/lib/seo.js:116-121` | canonical עצמי ל-`/producer/{id}` גם כשלבית העסק יש slug, בעוד ה-JSON-LD **באותו דף** מכריז `url`/`@id` על כתובת ה-slug (`buildPageUrl` מעדיף slug, `lib/seo.js:239`); ה-sitemap פולט רק את כתובת ה-slug (`frontend/app/sitemap.js:74`). תוכן כפול בשני URLs אינדקסביליים + אותות canonical↔JSON-LD סותרים | high | NEW |
| SEO-02 | /producer/[id] | `frontend/app/[locale]/producer/[id]/page.js:61-70` | בית עסק לא קיים → הדף עדיין מרונדר ב-200 (אין `notFound()` בקומפוננטה; רק metadata noindex בשורות 27-36) — soft-404 | med | DUP MEH-918 |
| SEO-03 | /events/[id] | `frontend/app/[locale]/events/[id]/page.js:90-98` | אירוע לא קיים → 200 + noindex (שורות 38-52) + UI של 404 בצד לקוח — soft-404 | med | DUP MEH-918 |
| SEO-04 | /[slug] | `frontend/app/[locale]/[slug]/page.js:32-37` | רק נתיבים "scanner-shaped" מקבלים 404 אמיתי; miss בצורת slug זורם 200 + UI 404 (בגלל `loading.js` boundary) עם noindex — soft-404 שיורי | med | DUP MEH-918 |
| SEO-05 | robots.txt | `frontend/public/robots.txt:8-14` | נתיבי ה-Disallow אינם מכסים את קידומת ה-locale — `/en/admin/`, `/en/login`, `/en/register`, `/en/settings`, `/en/favorites`, `/en/producer/dashboard/` נשארים crawlable | med | DUP MEH-1045 (פער שיורי במשפחת robots-hardening) |
| SEO-06 | host consistency | `frontend/lib/env.client.js:50-51` vs `frontend/public/robots.txt:36` | fallback של `SITE_URL` = `https://mehamakor.co.il` בעוד robots.txt (סטטי) מצביע על `mehamakor.online`; deploy בלי `NEXT_PUBLIC_SITE_URL` יפלוט canonical/hreflang/JSON-LD/sitemap על host שגוי. (`frontend/app/[locale]/producer/dashboard/page.js:21` מציין ש-mehamakor.online הוא הדומיין הציבורי הקנוני — MEH-1242 PR4) | med | DUP MEH-1045 (משפחת sitemap-host) |
| SEO-07 | / (בית) | `frontend/app/[locale]/page.js:1,45-61` + `frontend/lib/use-home-page.js:89-207` | דף הבית הוא `"use client"` וכל התוכן המרכזי (גריד בתי עסק, קטגוריות, מונים) נטען ב-`useEffect` בצד לקוח — לא קיים ב-HTML השרתי; רק hero + בלוקים סטטיים מרונדרים SSR | med | NEW |
| SEO-08 | /events (רשימה) | `frontend/app/[locale]/events/EventsClient.jsx:171-183` | רשימת האירועים נטענת client-side בלבד — אין SSR של הרשימה; discovery של דפי אירוע תלוי ב-sitemap בלבד. (ל-/map יש פתרון: `<nav>` sr-only שרתי — `frontend/app/[locale]/map/page.js:72-83`; ל-/events אין מקבילה) | med | NEW |
| SEO-09 | internal linking | `frontend/components/Footer.jsx:74-86` (+אין התאמות ב-`Header.jsx`/`BottomNav.jsx`) | אינדקס `/producers` לא מקושר משום ניווט קבוע (footer/header/bottom-nav); נגיש רק דרך כרטיסי קטגוריה בבית (`/producers?category=`, `frontend/app/[locale]/page.js:169-171`) ומה-sitemap | med | NEW |
| SEO-10 | Twitter cards | `frontend/app/[locale]/map/page.js:15-34`, `events/page.js:13-31`, `about/page.js`, `terms/page.js`, `privacy/page.js`, `about/for-businesses/page.js:27-40`, `producers/page.jsx:76-92` | הדפים דורסים `openGraph` אבל לא `twitter` → יורשים את כרטיס ה-Twitter הגנרי של ה-layout (`frontend/app/[locale]/layout.js:85-90,149-153`) — כותרת כרטיס לא תואמת לכותרת הדף (בניגוד לדפי הישות: producer/event/recipe שכן דורסים, MEH-1062 SEO-05) | low | NEW |
| SEO-11 | OG image EN | `frontend/public/og-image-en.png` (0 הפניות בקוד) vs `frontend/app/[locale]/layout.js:32` | קיים נכס `og-image-en.png` שאינו בשימוש; דפי `/en/*` משתפים את `og-image.png` עם טקסט עברי | low | NEW |
| SEO-12 | /login, /register | `frontend/public/robots.txt:13-14` + `frontend/app/[locale]/login/page.js:28`, `register/page.js:29` | שילוב Disallow ב-robots.txt עם meta-noindex — ה-crawler חסום מלראות את ה-noindex; סיכון "indexed, though blocked" (URL-only) | low | NEW |
| SEO-13 | sitemap coverage | `frontend/app/sitemap.js:44-56` | נתיבים ציבוריים אינדקסביליים חסרים ב-sitemap: `/accessibility`, `/about/for-businesses/guides` (+3 תתי-מדריכים), `/join`, `/share`; דפי פרט של experiences/group-buys לא נפלטים (דפי הרשימה כן — שורות 49-50) | low | NEW |
| SEO-14 | /map popup | `frontend/components/MapComponent.jsx:93` | תמונת בית העסק ב-popup של המפה עם `alt=""` (טיפול דקורטיבי בתמונה בעלת משמעות) | low | NEW |
| SEO-15 | דפי פרט OG | `frontend/app/[locale]/events/[id]/page.js:58-62`, `[slug]/recipes/[recipe_id]/page.jsx:81-87` | ה-openGraph הנדרס בדפי אירוע/מתכון חסר `url` (og:url) ו-`siteName` — בניגוד לדפי בית עסק (`frontend/lib/seo.js:435`) ולדפים סטטיים (MEH-740) | low | NEW |

**ספירה:** high 1 · med 8 · low 6 — סה"כ 15 (NEW 10 · DUP 5).

---

## מה נבדק ונמצא תקין (עם עדות)

- **hreflang he/en:** `buildAlternates` פולט self + reciprocal + `x-default` לכל locale (`frontend/lib/i18n-seo.js:61-70`); קודים תקינים `he-IL`/`en` (`i18n-seo.js:29`). ה-sitemap מוסיף `<xhtml:link>` **כולל self** לכל entry (`frontend/app/sitemap.js:26-37`) — ה-caveat של Next.js (אין self אוטומטי) מטופל ידנית. `localeDetection: false` כבר קיים (`frontend/i18n/routing.js:12`, DUP MEH-1045 — תוקן).
- **canonical עצמי לכל דף ציבורי:** כל 17+ הנתיבים הציבוריים עם `generateMetadata` + `buildAlternates` משלהם; עמודי `?page=N` של /producers עם canonical עצמאי לכל עמוד + hreflang תואם-עמוד (`frontend/app/[locale]/producers/page.jsx:62-69`).
- **ייחודיות ואורך titles:** `seo.*` ב-`frontend/messages/he.json` — כל ה-titles ייחודיים, 16–52 תווים; descriptions קצרים (34–42) קיימים רק בנתיבי noindex (register/reset/verify) — ללא השפעה.
- **sitemap דינמי:** בתי עסק (slug עדיף), עמודי אינדקס מדופדפים, מתכונים (MEH-1062 SEO-03), אירועים — עתידיים בלבד (ברירת המחדל של ה-API: `backend/app/routers/events.py:93-94`); נתיבי noindex הוחרגו בכוונה (`frontend/app/sitemap.js:53-56`, MEH-803).
- **robots.txt:** קיים, מפנה ל-sitemap על host נכון (`frontend/public/robots.txt:36`), חוסם AI-crawlers (MEH-1045).
- **היררכיית כותרות:** h1 יחיד בכל surface שנבדק — בית (`frontend/app/[locale]/home/HomeHero.jsx:93`), מפה (`MapClient.jsx:454`), producers (`components/ProducersClient.jsx:325`), אירועים (`EventsClient.jsx:272`), בית עסק (`producer/[id]/components/ProducerHeader.jsx:63`), מתכון (`components/public/RecipeDetail.jsx:86`), for-businesses (h1→h2, `page.js:128,147`).
- **alt לתמונות מרכזיות:** `ProducerCard.jsx:235` (`alt={producer.name}`), `Lightbox.jsx:117` (alt מתורגם עם מונה), `MobileSheetSelectedCard.jsx:61`; אווטרים עם `alt=""` דקורטיבי לגיטימי (`Header.jsx:509`).
- **דפדוף crawlable:** קישורי `<Link>` שרתיים ל-prev/next באינדקס (`components/ProducersClient.jsx:629-660`).
- **פרוטוקול escaping ל-JSON-LD:** owner יחיד `serializeJsonLd` נגד `</script>` breakout (`frontend/lib/seo.js:54-59`, MEH-1069).

---

## סיכום ממצאי NEW מדורגים

1. **SEO-01 (high)** — כפילות canonical בין `/producer/{id}` ל-`/{slug}` + סתירה פנימית canonical↔JSON-LD באותו דף. התיקון הקטן ביותר: כשקיים slug — canonical של `/producer/[id]` יצביע על כתובת ה-slug (או redirect 308).
2. **SEO-07 (med)** — תוכן הליבה של דף הבית אינו ב-HTML השרתי (client-fetch מלא).
3. **SEO-08 (med)** — רשימת אירועים ללא SSR; אין נתיב discovery שרתי לדפי אירוע (למעט sitemap).
4. **SEO-09 (med)** — `/producers` יתום מניווט קבוע.
5. **SEO-10 (low)** — כרטיסי Twitter גנריים בדפים סטטיים שדרסו רק openGraph.
(היתר — SEO-11 עד SEO-15 — low, מרוכזים בהצעת B3 להלן.)

---

## הצעת חלוקת תיקונים (gated on Sapir review)

- **B1 (מקורי: Organization/WebSite + FoodEstablishment JSON-LD) — כבר קיים (MEH-804 / MEH-9 / MEH-172 / MEH-452). re-scope מוצע:** איחוד אותות canonical — SEO-01 בלבד (שינוי ממוקד ב-`producer/[id]/page.js` generateMetadata; לתאם עם MEH-918 לגבי ה-soft-404 באותו קובץ).
- **B2 (מקורי: Recipe/Event/BreadcrumbList) — כבר קיים (MEH-591 / MEH-1062). re-scope מוצע:** SSR discoverability — SEO-08 (רשימת אירועים שרתית או sr-only nav בתבנית `/map`) + SEO-09 (קישור `/producers` ב-footer). את SEO-07 (SSR לדף הבית) לפצל ל-ticket נפרד — נוגע ב-central components ודורש chunked review (RED tier).
- **B3 (חדש, metadata polish — GREEN):** SEO-10 (twitter overrides בדפים סטטיים) + SEO-11 (חיווט `og-image-en.png` ל-EN) + SEO-15 (og:url/siteName בדפי אירוע/מתכון) + SEO-13 (השלמות sitemap) + SEO-14 (alt ב-popup).
- **ל-MEH-1045 (קיים):** SEO-05 (קידומות /en ב-robots.txt) + SEO-06 (יישור fallback host ב-`env.client.js`) + SEO-12 (הסרת Disallow על /login,/register והשארת noindex בלבד) — להוסיף כהערות על ה-ticket הקיים, לא לפתוח חדש.

---

_מקור: MEH-1060 Chunk A · 2026-07-17 · ניתוח סטטי בלבד; אימות live (סטטוסי HTTP, HTML מרונדר, Rich Results) נדחה למשתמשת/CI (מגבלת sandbox, MEH-360)._
