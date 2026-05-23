import { getTranslations } from "next-intl/server";
import RegisterClient from "./RegisterClient";
import { BRAND_NAME } from "@/lib/constants";
import { buildAlternates, OG_LOCALE } from "@/lib/i18n-seo";

// MEH-658: server-wrapper pattern (MEH-476 Wave 6 precedent) — client
// components can't export metadata; the wrapper supplies SEO while
// RegisterClient.jsx keeps the "use client" signup flow untouched.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo.register" });

  return {
    // title.absolute prevents layout's `%s | ${BRAND_NAME}` template appending
    // (seo.register.title already includes the brand suffix).
    title: { absolute: t("title") },
    description: t("description"),
    openGraph: {
      title: t("og_title"),
      description: t("og_description"),
      type: "website",
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
      images: ["/og-image.png"],
    },
    alternates: buildAlternates("/register", locale),
    // MEH-641: auth chrome — not indexable, but hreflang preserved for cross-locale signal
    robots: { index: false, follow: false },
  };
}

export default function RegisterPage() {
  return <RegisterClient />;
}
