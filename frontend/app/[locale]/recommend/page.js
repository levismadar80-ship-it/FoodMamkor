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
    // MEH-2633 (Sapir 04/11): `noindex, follow` and OUT of the sitemap. It is
    // a form page with no content of its own, and keeping it out of search
    // also keeps bot traffic off an anonymous write endpoint. The way in is
    // the footer link. `follow` is deliberate: the page links to /privacy and
    // those links should still carry.
    //
    // This is exactly the pair sitemap.js:65 already documents for /register,
    // /login and /contact — absent from the sitemap AND noindex on the page,
    // because listing a noindex URL produces GSC "Submitted URL marked
    // 'noindex'". The sitemap's staticDefs is a hand-maintained list that does
    // NOT read lib/static-routes.json, so /recommend is out of it by default;
    // __tests__/RecommendNoindex.test.js asserts both halves so neither can
    // drift back.
    robots: { index: false, follow: true },
  };
}

export default function RecommendPage() {
  return <RecommendClient />;
}
