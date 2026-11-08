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
 * History:  MEH-1289 (creation, 2026-07-17); MEH-1810 (adds the "מה שמשתנה
 *           בדרך" three-line block between the sections and the CTA).
 */
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "@phosphor-icons/react/ssr";
import { Link } from "@/i18n/navigation";
import EditorialPhoto from "@/components/EditorialPhoto";
import { BRAND_NAME } from "@/lib/constants";
import { buildAlternates, urlForLocalePath, OG_LOCALE } from "@/lib/i18n-seo";

// MEH-2597: the mid-article photo sits under this (0-based) section.
const PHOTO_AFTER_SECTION = 1;

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

// MEH-1810: closing block — one h2 (sibling of the SECTIONS h2s, so the h1→h2
// hierarchy is unbroken) over three short lines. Copy locked by Sapir.
const CHANGES_LINES = ["changes_1", "changes_2", "changes_3"];

// MEH-2827 (FinalWhyLocal, Sapir 08/11): the five REASONS get a numeral mark
// in the /about Chapter style; «איפה מתחילים» (the last SECTIONS entry) is
// the turn to the answer, not a sixth reason, so it gets none.
const NUMBERED_REASONS = 5;

// MEH-476 PR 3b2: async + setRequestLocale + getTranslations enables ● SSG.
export default async function WhyLocalPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "about_why_local" });

  return (
    <>
    <section className="min-h-screen bg-background text-text">
      <article data-testid="why-local-article" className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <header className="mb-8 sm:mb-10">
          <h1 className="font-headline-lg mb-5 text-primary-dark text-[clamp(28px,6vw,44px)] leading-[1.15] font-black">
            {t("h1")}
          </h1>
          <p className="text-lg sm:text-xl leading-[1.8] text-text/90">
            {t("intro")}
          </p>
        </header>

        <div>
          {SECTIONS.map((s, i) => (
            <section key={s.heading}>
              {i < NUMBERED_REASONS ? (
                <div
                  data-testid="why-local-numeral"
                  aria-hidden="true"
                  className="flex items-center gap-3 mt-10 sm:mt-12 mb-2"
                >
                  <span className="font-body-md text-sm font-semibold text-gold-deep shrink-0">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="h-px flex-1 bg-accent/35" />
                </div>
              ) : null}
              <h2
                className={`font-headline-md mb-3 text-primary text-2xl font-bold ${i < NUMBERED_REASONS ? "" : "mt-10 sm:mt-12"}`}
              >
                {t(s.heading)}
              </h2>
              <p className="mb-4 text-base sm:text-lg leading-[1.8] text-text/90">
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
              {/* MEH-2597: one photo mid-article, after the second reason. */}
              {i === PHOTO_AFTER_SECTION && (
                <EditorialPhoto
                  src="https://res.cloudinary.com/dfzpscjks/image/upload/v1782159035/events/hero-market.jpg"
                  testId="why-local-photo"
                  className="mt-8"
                />
              )}
            </section>
          ))}

          {/* MEH-2827: the three short lines read as a list in one card, not
              three one-line paragraphs. Same keys, same words. */}
          <section>
            <div data-testid="why-local-changes" className="rounded-xl bg-background-alt p-5 mt-10 sm:mt-12">
              <h2 className="font-headline-md mb-3 text-primary text-2xl font-bold">
                {t("changes_h")}
              </h2>
              <ul className="grid gap-2.5">
                {CHANGES_LINES.map((line) => (
                  <li key={line} className="flex gap-2.5 text-base sm:text-lg leading-[1.8] text-text/90">
                    <span aria-hidden="true" className="mt-[0.75em] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <span>{t(line)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>

        <footer data-testid="why-local-sources" className="mt-10 border-t border-border pt-6">
          <p className="text-sm leading-relaxed text-fg-muted">
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
    {/* MEH-2827: the ending is a full-green band with the page's one CTA,
        running straight into the footer (data-meets-footer, MEH-2487) — the
        same cream-on-green button as the /about close. Not ClosingCtaBand:
        that band is for BUSINESS calls to action (title + BusinessCtaLink),
        and this one is a consumer link to /map with no title. MEH-2634: /map,
        not /producers — the copy says «באזור שלכם». */}
    <section data-meets-footer className="bg-primary text-background py-12 text-center">
      <Link
        href="/map"
        data-testid="why-local-cta"
        className="inline-flex items-center gap-2 min-h-[56px] px-9 py-4 bg-background text-primary rounded-lg font-semibold text-lg hover:bg-background-alt transition-colors duration-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-on-dark focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
      >
        {t("cta")}
        <ArrowLeft size={20} aria-hidden="true" />
      </Link>
    </section>
    </>
  );
}
