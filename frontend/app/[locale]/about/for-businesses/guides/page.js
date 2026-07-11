/**
 * Module:   guides-index
 * Purpose:  Index page for the 3 onboarding guides linked from the
 *           Day-2 / Day-5 / Day-10 follow-up emails (MEH-539). Each
 *           card links to /about/for-businesses/guides/{slug}.
 * Touches:  none.
 * Does NOT: render guide bodies (each guide has its own page.js).
 * Related:  backend/app/services/onboarding_followup.py (the email
 *           bodies that link here), frontend/components/GuideArticle.jsx.
 * History:  MEH-539 (creation, 2026-05-16) — Phase 2D of MEH-615.
 *           MEH-475 PR-C4b/chunk-5 (i18n, 2026-05-20) — GUIDES + chrome
 *           wired to `guides.index.*` + per-guide title keys.
 */
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BRAND_NAME } from "@/lib/constants";
import { buildAlternates, OG_LOCALE } from "@/lib/i18n-seo";

// MEH-476 PR 3b2: per-page hreflang via buildAlternates; og:locale per locale.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations("guides.index");
  const title = t("meta_title");
  return {
    // title.absolute prevents layout's `%s | ${BRAND_NAME}` template appending.
    title: { absolute: title },
    description: t("meta_description"),
    openGraph: {
      title,
      description: t("og_description"),
      type: "website",
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
    },
    alternates: buildAlternates("/about/for-businesses/guides", locale),
  };
}

// MEH-821: brand colors via canonical ADR-019 token classes (text-primary,
// text-primary-dark, text-text, text-accent, bg-background, border-border) —
// was module-scope hex consts + inline style props.

const GUIDES = [
  { slug: "business-story", nsKey: "business_story", readMinutes: 4 },
  { slug: "product-photography", nsKey: "product_photography", readMinutes: 5 },
  { slug: "customer-messages", nsKey: "customer_messages", readMinutes: 6 },
];

// MEH-476 PR 3b2: async + setRequestLocale + getTranslations enables ● SSG.
export default async function GuidesIndexPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "guides" });
  const ti = await getTranslations({ locale, namespace: "guides.index" });
  return (
    <section className="min-h-screen bg-background text-text">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <header className="mb-10 sm:mb-14">
          <p className="text-xs sm:text-sm mb-3 text-accent">
            {ti("eyebrow")}
          </p>
          <h1 className="font-headline-lg mb-4 text-primary-dark text-[clamp(28px,6vw,44px)] leading-[1.15] font-black">
            {ti("heading")}
          </h1>
          <p className="text-[17px] sm:text-[18px] leading-relaxed text-text/90">
            {ti("intro")}
          </p>
        </header>

        <ul className="flex flex-col gap-5">
          {GUIDES.map((g) => (
            <li key={g.slug}>
              <Link
                href={`/about/for-businesses/guides/${g.slug}`}
                className="block rounded-lg border border-border bg-white p-5 sm:p-6 transition focus-visible:outline-none focus-visible:ring-2"
              >
                <p className="text-[11px] sm:text-[12px] mb-2 text-accent">
                  {ti("minutes_label", { minutes: g.readMinutes })}
                </p>
                <h2 className="font-headline-md mb-2 text-primary-dark text-[20px] font-bold">
                  {t(`${g.nsKey}.title`)}
                </h2>
                <p className="text-[15px] sm:text-[16px] leading-relaxed mb-3 text-text/90">
                  {ti(`card_previews.${g.nsKey}`)}
                </p>
                <span className="inline-flex items-center gap-2 text-[14px] text-primary font-semibold">
                  {ti("cta")}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <footer className="mt-14 sm:mt-16 border-t border-border pt-8">
          <p className="text-[15px] text-text/90">
            {ti("footer_prefix")}{" "}
            <a
              href="https://www.instagram.com/meha_makor"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-primary"
            >
              @meha_makor
            </a>
            {ti("footer_suffix")}
          </p>
        </footer>
      </div>
    </section>
  );
}
