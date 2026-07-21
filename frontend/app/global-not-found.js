/**
 * Module:   global-not-found
 * Purpose:  App Router global 404 boundary (Next 16 experimental.globalNotFound,
 *           enabled in next.config.js). Returns a REAL HTTP 404 for unmatched
 *           routes and notFound() calls under the [locale] dynamic segment —
 *           fixing the soft-404 (200) that app/[locale]/not-found.js streams.
 * Does NOT: use next-intl — this file replaces the root layout (which lives in
 *           app/[locale]/layout.js), so NextIntlClientProvider is unavailable.
 *           Copy is therefore hardcoded, mirroring global-error.js. Values are
 *           lifted verbatim from messages/he.json → errors.not_found (Hebrew
 *           primary, matching the brand default locale) with a neutral English
 *           subline, since a global boundary can serve either locale.
 * Related:  app/global-error.js (sibling top-level boundary, same self-owned
 *           <html>/<body> + inline-style pattern), app/[locale]/not-found.js
 *           (in-locale 404 UI, still rendered for matched-route notFound()).
 * History:  MEH-918 (creation — soft-404 → real HTTP 404 for SEO).
 */

import { BRAND_NAME } from "@/lib/constants";

// Next injects noindex on the global 404 automatically; declare it explicitly
// so crawlers never index this error document even if that behavior changes.
export const metadata = {
  title: "404",
  robots: { index: false, follow: false },
};

const PRIMARY = "#2e6853"; // brand primary token
const PRIMARY_DARK = "#234f3f";

export default function GlobalNotFound() {
  return (
    <html lang="he" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1rem",
          background: "#f7f9f4",
          color: "#1f2a24",
          fontFamily:
            "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: "28rem" }}>
          <p
            style={{
              color: PRIMARY,
              fontWeight: 500,
              fontSize: "0.875rem",
              letterSpacing: "0.15em",
              margin: "0 0 0.5rem",
            }}
          >
            404
          </p>
          <h1
            style={{
              fontSize: "2rem",
              fontWeight: 700,
              margin: "0 0 0.75rem",
              color: "#1f2a24",
            }}
          >
            לא מצאנו את הדף הזה
          </h1>
          <p
            style={{
              fontSize: "1.125rem",
              lineHeight: 1.6,
              margin: "0 0 0.5rem",
              color: "#4a554e",
            }}
          >
            יכול להיות שהקישור פג תוקף, או שהדף עבר לכתובת אחרת.
          </p>
          <p
            style={{
              fontSize: "0.9375rem",
              lineHeight: 1.5,
              margin: "0 0 2rem",
              color: "#7a857e",
            }}
          >
            The link may have expired, or the page has moved.
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem",
              justifyContent: "center",
            }}
          >
            {/* Plain <a>, not next/link: the App Router / next-intl context is
                gone at the global boundary, so a full document navigation is the
                correct path back into the app. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                background: PRIMARY,
                color: "#fff",
                padding: "0.75rem 1.5rem",
                borderRadius: "9999px",
                fontSize: "1rem",
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              חזרו לדף הבית
            </a>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/map"
              style={{
                border: `1px solid ${PRIMARY}`,
                color: PRIMARY,
                padding: "0.75rem 1.5rem",
                borderRadius: "9999px",
                fontSize: "1rem",
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              גלו עסקים במפה
            </a>
          </div>
          <p
            style={{
              marginTop: "2.5rem",
              fontSize: "0.8125rem",
              color: "#9aa39d",
            }}
          >
            {BRAND_NAME}
          </p>
        </div>
      </body>
    </html>
  );
}
