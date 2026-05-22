import { getTranslations } from "next-intl/server";
import ContactClient from "./ContactClient";
import { BRAND_NAME } from "@/lib/constants";
import { buildAlternates, OG_LOCALE } from "@/lib/i18n-seo";

// MEH-658: server-wrapper pattern (MEH-476 Wave 6 precedent) — client
// components can't export metadata; the wrapper supplies SEO while
// ContactClient.jsx keeps the "use client" form submission untouched.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo.contact" });

  return {
    // title.absolute prevents layout's `%s | ${BRAND_NAME}` template appending
    // (seo.contact.title already includes the brand suffix).
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
    alternates: buildAlternates("/contact", locale),
  };
}

export default function ContactPage() {
  return <ContactClient />;
}
