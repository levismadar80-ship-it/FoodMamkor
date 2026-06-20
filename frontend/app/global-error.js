"use client";

/**
 * Module:   global-error
 * Purpose:  App Router global-error boundary — catches errors thrown in the
 *           root [locale] layout itself, which app/[locale]/error.js cannot.
 *           Renders a branded RTL recovery screen instead of a white screen.
 * Does NOT: handle in-page route errors — that's app/[locale]/error.js. This
 *           boundary replaces the root layout entirely, so it owns <html>/<body>
 *           and cannot use next-intl (provider lives in the layout it replaces).
 * Related:  frontend/app/[locale]/error.js (sibling, route-level boundary).
 * History:  MEH-873 (creation).
 */

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Hardcoded Hebrew — next-intl is unavailable at this boundary (it replaces
// the root layout, so no NextIntlClientProvider). Copy mirrors errors.boundary.
const PRIMARY = "#2e6853"; // brand primary token
const PRIMARY_DARK = "#234f3f";

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    Sentry.captureException(error);
    if (process.env.NODE_ENV === "development") {
      console.error("[global error]", error);
    }
  }, [error]);

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
          <h1
            style={{
              fontSize: "2rem",
              fontWeight: 700,
              margin: "0 0 0.75rem",
              color: PRIMARY,
            }}
          >
            משהו השתבש — נסו שוב
          </h1>
          <p
            style={{
              fontSize: "1.125rem",
              lineHeight: 1.6,
              margin: "0 0 2rem",
              color: "#4a554e",
            }}
          >
            הדף לא הצליח להיטען הפעם. לרוב זה עובד בפעם השנייה.
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem",
              justifyContent: "center",
            }}
          >
            <button
              type="button"
              onClick={() => reset()}
              style={{
                background: PRIMARY,
                color: "#fff",
                border: "none",
                padding: "0.75rem 1.5rem",
                borderRadius: "9999px",
                fontSize: "1rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = PRIMARY_DARK;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = PRIMARY;
              }}
            >
              נסו שוב
            </button>
            {/* Plain <a>, not next/link: the App Router context is gone at the
                global-error boundary, and a full document reload is the correct
                full-recovery path. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
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
              חזרי לדף הבית
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
