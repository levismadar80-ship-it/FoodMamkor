/**
 * Module:   global-not-found
 * Purpose:  App Router global 404 boundary (Next 16 experimental.globalNotFound,
 *           enabled in next.config.js). Returns a REAL HTTP 404 for unmatched
 *           routes and notFound() calls under the [locale] dynamic segment —
 *           fixing the soft-404 (200) that app/[locale]/not-found.js streams.
 * Does NOT: render the full locale layout. This file replaces the root layout
 *           (app/[locale]/layout.js), so it builds its own <html>/<body> and
 *           provider stack — the minimum the site header and footer need
 *           (intl, auth, language). Chat, cookie banner, cursor and analytics
 *           stay out: an error page asks for one decision, not five.
 * Related:  app/[locale]/not-found.js (the message + two links, reused here),
 *           app/global-error.js (sibling top-level boundary).
 * History:  MEH-918 (creation — soft-404 → real HTTP 404 for SEO).
 *           MEH-2422 — the page was a bare standalone document: no header or
 *           footer, its own font and background, and an English line under
 *           the Hebrew. It now wears the site chrome, in the locale of the
 *           path (next-intl's middleware resolves it before this renders).
 */

import "./globals.css";
import { FONT_VARIABLES } from "./fonts";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { AuthProvider } from "@/lib/auth-context";
import { LanguageProvider } from "@/lib/language-context";
import Header from "@/components/Header";
import FooterSlot from "@/components/FooterSlot";
import BottomNav from "@/components/BottomNav";
import NotFound from "./[locale]/not-found";

// Next injects noindex on the global 404 automatically; declare it explicitly
// so crawlers never index this error document even if that behavior changes.
export const metadata = {
  title: "404",
  robots: { index: false, follow: false },
};

export default async function GlobalNotFound() {
  const locale = await getLocale();
  const messages = await getMessages({ locale });
  const dir = locale === "he" ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir} className={FONT_VARIABLES}>
      <body className="font-body-md bg-background text-text min-h-screen flex flex-col pb-[var(--bottom-inset)]">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AuthProvider>
            <LanguageProvider>
              <Header />
              <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
                <NotFound />
              </main>
              <FooterSlot />
              <BottomNav />
            </LanguageProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
