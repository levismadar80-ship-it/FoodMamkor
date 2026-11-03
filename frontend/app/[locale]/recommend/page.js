import { getTranslations } from "next-intl/server";
import RecommendClient from "./RecommendClient";
import { BRAND_NAME } from "@/lib/constants";
import { buildAlternates, urlForLocalePath, OG_LOCALE } from "@/lib/i18n-seo";

// MEH-2633 chunk B: server-wrapper pattern (contact/page.js precedent) — a
// client component cannot export metadata, so the wrapper supplies SEO while
// RecommendClient.jsx keeps the "use client" form untouched.
//
// Every string here REUSES seo.recommend, which is itself the approved
// <hebrew_copy> title + subtitle — no metadata copy was written for this page.
// Note the absence of `title.absolute`: the layout template appends
// "| <brand>" so no hand-written brand suffix is needed (contact/page.js has
// to use `absolute` only because its seo string already carries one).
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo.recommend" });

  return {
    title: t("title"),
    description: t("description"),
    openGraph: {
      title: t("og_title"),
      description: t("og_description"),
      type: "website",
      url: urlForLocalePath("/recommend", locale),
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
      images: ["/og-image.png"],
    },
    alternates: buildAlternates("/recommend", locale),
    // Deliberately NO `robots: { index: false }`, unlike contact/page.js: that
    // page is noindex as auth chrome, while this one is a public acquisition
    // page that should be findable. Flagged in the PR as a choice, not a
    // default — the card does not rule on it.
  };
}

export default function RecommendPage() {
  return <RecommendClient />;
}
