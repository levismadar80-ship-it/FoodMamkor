import { getTranslations } from "next-intl/server";
import VerifyEmailClient from "./VerifyEmailClient";
import { BRAND_NAME } from "@/lib/constants";
import { buildAlternates, OG_LOCALE } from "@/lib/i18n-seo";

// MEH-2878: stays per-request on purpose. Its client body reads
// useSearchParams() inside <Suspense>; on a cached (static) route Next renders
// that subtree only in the browser, so the cached HTML would lose the page's
// H1 and body (measured: production has the H1 in its HTML, a cached build
// did not). Per-request keeps today's server-rendered HTML. Remove this only
// together with moving the H1 out of the Suspense subtree.
export const dynamic = "force-dynamic";

// MEH-641 PR-B: server-wrapper pattern (MEH-658 precedent) — client
// components can't export metadata; the wrapper supplies SEO while
// VerifyEmailClient.jsx keeps the "use client" token flow (useSearchParams
// inside its own <Suspense>) untouched — the shape the old /search page used (MEH-819 removed it).
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo.verify_email" });

  return {
    // MEH-2853: plain title — the layout template `%s | <brand>` adds the brand.
    title: t("title"),
    description: t("description"),
    openGraph: {
      title: t("og_title"),
      description: t("og_description"),
      type: "website",
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
      images: ["/og-image.png"],
    },
    alternates: buildAlternates("/verify-email", locale),
    // MEH-641: auth chrome — not indexable, but hreflang preserved for cross-locale signal
    robots: { index: false, follow: false },
  };
}

export default function VerifyEmailPage() {
  return <VerifyEmailClient />;
}
