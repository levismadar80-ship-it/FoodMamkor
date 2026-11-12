import { getTranslations } from "next-intl/server";
import RouteMessagesProvider from "@/components/i18n/RouteMessagesProvider";
import { registerProducerMessages } from "@/lib/client-messages";
import RegisterProducerClient from "../producer/RegisterProducerClient";
import { buildAlternates, buildEntityTitle, OG_LOCALE } from "@/lib/i18n-seo";
import { BRAND_NAME } from "@/lib/constants";

// MEH-2773: the markets / events organizer's own sign-up link (ADR-036). Same
// wizard as /register/producer with kind="organizer" — the route, not a control
// on the business page, chooses the flow. Sapir sends this link to organizers
// directly, so it is not a public landing page: noindex, and no sitemap entry.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  // MEH-2988: its own title — the tab and a shared link used to read «רישום
  // בית עסק» (the business route's). The share description reuses the
  // approved organizer heading; no new sentence.
  const t = await getTranslations({ locale, namespace: "seo.register_organizer" });
  const tForm = await getTranslations({ locale, namespace: "auth.register.producer" });
  const title = t("title");
  const description = tForm("organizer_heading");
  const alternates = buildAlternates("/register/organizer", locale);
  return {
    // MEH-2853: plain title — the layout template `%s | <brand>` adds the brand.
    title,
    description,
    robots: { index: false, follow: false },
    // REUSES: register/producer/page.js — MEH-2594 share preview. Sapir sends
    // this link in WhatsApp, so the preview must name the organizer flow.
    openGraph: {
      type: "website",
      title: buildEntityTitle(title, locale),
      description,
      url: alternates.canonical,
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
      images: ["/og-image.png"],
    },
    twitter: {
      card: "summary_large_image",
      title: buildEntityTitle(title, locale),
      description,
      images: ["/og-image.png"],
    },
    alternates,
  };
}

export default function RegisterOrganizerPage() {
  return (
    <RouteMessagesProvider pick={registerProducerMessages}>
      <RegisterProducerClient kind="organizer" />
    </RouteMessagesProvider>
  );
}
