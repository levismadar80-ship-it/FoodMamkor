/**
 * Module:   about-why-local
 * Purpose:  /about/why-local — static editorial page making the reader-facing
 *           case for choosing local food (5 reasons + "where to start" → CTA).
 *           Copy locked by Sapir (MEH-1289); body namespace `about_why_local`.
 * Touches:  none (server-rendered presentation only).
 * Does NOT: own the footer nav-link (that lives in components/Footer.jsx) nor
 *           the /about cross-link (app/[locale]/about/AboutClient.jsx).
 * Related:  frontend/app/[locale]/about/for-businesses/page.js (same page
 *           pattern — metadata + OG + max-w-3xl container),
 *           frontend/components/GuideArticle.jsx (same prose typography).
 * History:  MEH-1289 (creation, 2026-07-17).
 */
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { BRAND_NAME } from "@/lib/constants";
import { buildAlternates, urlForLocalePath, OG_LOCALE } from "@/lib/i18n-seo";

// MEH-1289: external evidence link (body) + the two bottom "sources" links.
const NEF_URL = "https://www.sustainweb.org/blogs/jul25-what-is-local-food/";
const COLLECTIVECROP_URL =
  "https://collectivecrop.com/guides/fresh-picked-vs-supermarket-produce-does-it-matter";

// MEH-476 pattern: per-page generateMetadata (title.absolute + OG + twitter +
// per-page hreflang via buildAlternates; og:locale per locale).
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about_why_local" });
  return {
    // title.absolute prevents layout's `%s | ${BRAND_NAME}` template appending.
    title: { absolute: t("meta_title") },
    description: t("meta_description"),
    openGraph: {
      title: t("og_title"),
      description: t("og_description"),
      type: "article",
      url: urlForLocalePath("/about/why-local", locale),
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
      images: ["/og-image.png"],
    },
    twitter: {
      card: "summary_large_image",
      title: t("og_title"),
      description: t("og_description"),
      images: ["/og-image.png"],
    },
    alternates: buildAlternates("/about/why-local", locale),
  };
}

// The five reasons, in locked order. `rich` marks the one section whose body
// carries the inline evidence link (<nef> → New Economics Foundation study).
const SECTIONS = [
  { heading: "taste_h", body: "taste_body" },
  { heading: "money_h", body: "money_body", rich: true },
  { heading: "fairness_h", body: "fairness_body" },
  { heading: "provenance_h", body: "provenance_body" },
  { heading: "env_h", body: "env_body" },
  { heading: "start_h", body: "start_body" },
];

// MEH-476 PR 3b2: async + setRequestLocale + getTranslations enables ● SSG.
export default async function WhyLocalPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "about_why_local" });

  return (
    <section className="min-h-screen bg-background text-text">
      <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <header className="mb-8 sm:mb-10">
          <h1 className="font-headline-lg mb-5 text-primary-dark text-[clamp(28px,6vw,44px)] leading-[1.15] font-black">
            {t("h1")}
          </h1>
          <p className="text-[17px] sm:text-[19px] leading-[1.8] text-text/90">
            {t("intro")}
          </p>
        </header>

        <div>
          {SECTIONS.map((s) => (
            <section key={s.heading}>
              <h2 className="font-headline-md mt-10 mb-3 sm:mt-12 text-primary text-[22px] font-bold">
                {t(s.heading)}
              </h2>
              <p className="mb-4 text-[16px] sm:text-[17px] leading-[1.8] text-text/90">
                {s.rich
                  ? t.rich(s.body, {
                      nef: (chunks) => (
                        <a
                          href={NEF_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline text-primary hover:opacity-90 focus-ring rounded-sm"
                        >
                          {chunks}
                        </a>
                      ),
                    })
                  : t(s.body)}
              </p>
            </section>
          ))}
        </div>

        <div className="mt-12 sm:mt-14">
          <Link
            href="/producers"
            className="inline-flex items-center gap-2 font-medium transition hover:opacity-90 bg-primary text-white rounded-sm px-6 py-3 focus-ring"
          >
            {t("cta")}
          </Link>
        </div>

        <footer className="mt-12 sm:mt-14 border-t border-border pt-6">
          <p className="text-[13px] leading-relaxed text-fg-muted">
            {t("sources_prefix")}{" "}
            <a
              href={NEF_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-primary focus-ring rounded-sm"
            >
              {t("source_sustain")}
            </a>{" "}
            (2025) <span aria-hidden="true">·</span>{" "}
            <a
              href={COLLECTIVECROP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-primary focus-ring rounded-sm"
            >
              {t("source_collectivecrop")}
            </a>{" "}
            (2026)
          </p>
        </footer>
      </article>
    </section>
  );
}
