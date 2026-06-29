import Link from "next/link";
import { Heart, MapPin, ChatCircle } from "@phosphor-icons/react/ssr";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BRAND_NAME } from "@/lib/constants";
import { buildAlternates, OG_LOCALE } from "@/lib/i18n-seo";

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations("sweep_tail.messages");
  return {
    title: { absolute: t("meta_title") },
    description: t("meta_description"),
    openGraph: {
      title: t("meta_title"),
      description: t("meta_description"),
      type: "website",
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
    },
    alternates: buildAlternates("/messages", locale),
  };
}

export default async function MessagesPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "sweep_tail.messages" });
  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <ChatCircle size={64} className="mx-auto mb-4 text-primary" aria-hidden="true" />
      <h1 className="font-headline-md text-2xl font-bold text-text mb-3">
        {t("heading")}
      </h1>
      <p className="text-fg-muted leading-relaxed mb-6">
        {t("intro")}
      </p>
      <div className="bg-background border border-border rounded-[16px] p-5 text-start mb-8">
        <h2 className="font-semibold text-text mb-2">{t("why_heading")}</h2>
        <ul className="text-sm text-fg-muted space-y-2">
          <li>{t("why_item_no_middlemen")}</li>
          <li>{t("why_item_direct_terms")}</li>
          <li>{t("why_item_trust")}</li>
        </ul>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          href="/map"
          className="bg-primary text-white px-6 py-3 rounded-full hover:bg-primary-dark transition font-medium focus-visible:ring-2 focus-visible:ring-primary/40 inline-flex items-center justify-center gap-1"
        >
          <MapPin size={14} className="text-current" />
          {t("cta_map")}
        </Link>
        <Link
          href="/favorites"
          className="border border-primary text-primary px-6 py-3 rounded-full hover:bg-green-50 transition font-medium inline-flex items-center justify-center gap-1"
        >
          <Heart size={14} className="text-current" />
          {t("cta_favorites")}
        </Link>
      </div>
    </div>
  );
}
