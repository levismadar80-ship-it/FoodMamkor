import { getTranslations } from "next-intl/server";
import RegisterProducerClient from "./RegisterProducerClient";
import { buildAlternates } from "@/lib/i18n-seo";

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
  return {
    // title.absolute prevents the layout brand-suffix template appending
    // (the key already carries the per-locale brand suffix).
    title: { absolute: t("title") },
    description: t("description"),
    alternates: buildAlternates("/register/producer", locale),
  };
}

export default function RegisterProducerPage() {
  return <RegisterProducerClient />;
}
