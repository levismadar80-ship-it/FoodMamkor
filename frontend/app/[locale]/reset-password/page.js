import { getTranslations } from "next-intl/server";
import ResetPasswordClient from "./ResetPasswordClient";
import { BRAND_NAME } from "@/lib/constants";
import { buildAlternates, OG_LOCALE } from "@/lib/i18n-seo";

// MEH-641 PR-B: server-wrapper pattern (MEH-658 precedent) — client
// components can't export metadata; the wrapper supplies SEO while
// ResetPasswordClient.jsx keeps the "use client" token flow (useSearchParams
// inside its own <Suspense>) untouched — same shape as /search.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo.reset_password" });

  return {
    // title.absolute prevents layout's `%s | ${BRAND_NAME}` template appending
    // (seo.reset_password.title already includes the brand suffix).
    title: { absolute: t("title") },
    description: t("description"),
    openGraph: {
      title: t("og_title"),
      description: t("og_description"),
      type: "website",
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
      images: ["/og-image.jpg"],
    },
    alternates: buildAlternates("/reset-password", locale),
    // MEH-641: auth chrome — not indexable, but hreflang preserved for cross-locale signal
    robots: { index: false, follow: false },
  };
}

export default function ResetPasswordPage() {
  return <ResetPasswordClient />;
}
