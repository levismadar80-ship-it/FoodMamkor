import { getTranslations } from "next-intl/server";
import RouteMessagesProvider from "@/components/i18n/RouteMessagesProvider";
import { registerProducerMessages } from "@/lib/client-messages";
import RegisterProducerClient from "./RegisterProducerClient";
import { buildAlternates, OG_LOCALE } from "@/lib/i18n-seo";
import { BRAND_NAME } from "@/lib/constants";

// MEH-739: server-wrapper pattern (MEH-658 login precedent). The client
// form moved verbatim to RegisterProducerClient.jsx so this page can export
// metadata — previously this route was a client component, so it inherited
// the layout fallback (canonical = root, default title; production-verified
// 2026-06-05).
// MEH-475 Wave 6: metadata strings → seo.register_producer.* (was hardcoded
// HE). Refs MEH-214 / MEH-476 / MEH-679.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo.register_producer" });
  const alternates = buildAlternates("/register/producer", locale);
  return {
    // title.absolute prevents the layout brand-suffix template appending
    // (the key already carries the per-locale brand suffix).
    title: { absolute: t("title") },
    description: t("description"),
    // MEH-2594: without its own openGraph/twitter this page inherited the
    // layout's — a shared sign-up link previewed as the homepage (og:title and
    // og:url both the root). This is the link outreach sends to businesses.
    openGraph: {
      type: "website",
      title: t("title"),
      description: t("description"),
      url: alternates.canonical,
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
      images: ["/og-image.png"],
    },
    twitter: {
      card: "summary_large_image",
      title: t("title"),
      description: t("description"),
      images: ["/og-image.png"],
    },
    alternates,
  };
}

// MEH-2233: the form reuses admin.producers.form.fields, which the root client
// provider omits — re-provide just that subtree.
export default function RegisterProducerPage() {
  return (
    <RouteMessagesProvider pick={registerProducerMessages}>
      <RegisterProducerClient />
    </RouteMessagesProvider>
  );
}
