// @ts-check
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  BellRinging,
  Check,
  HandCoins,
  ListChecks,
  Prohibit,
  Sparkle,
} from "@phosphor-icons/react/ssr";
import { Link } from "@/i18n/navigation";
import ClosingCtaBand from "@/components/ClosingCtaBand";
import BackLink from "@/components/ui/BackLink";
import SectionHeading from "@/components/ui/SectionHeading";
import { BRAND_NAME } from "@/lib/constants";
import { buildAlternates, buildEntityTitle, OG_LOCALE } from "@/lib/i18n-seo";
import { PRICING_PATH, pricingCopyValues } from "@/lib/pricing";

/**
 * Module:   join/pricing/page
 * Purpose:  The public price list for businesses (MEH-3166, ADR-042 §2:
 *           prices are published from day one). Order: what the page is →
 *           the launch-period band (nothing is charged today) → what is free
 *           → the two ways to pay once there are results → three short
 *           answers (what counts, the notice, whose money) → what is never
 *           for sale → the join band.
 * Touches:  nothing — a static server page, no fetch.
 * Does NOT: hold a single number. Every figure is an ICU value from
 *           lib/pricing.js; PricingCopyGuard.test.js fails on a number
 *           written into the copy. Does NOT take payment or show a per-business
 *           state — the «תוכנית וחיוב» dashboard screen is MEH-3165.
 * Related:  lib/pricing.js (numbers) · docs/PRICING.md (the same list for
 *           people) · app/[locale]/join/page.js (the FAQ that links here).
 * History:  MEH-3166 (creation, 2026-11-14).
 *
 * DO NOT link this page from the header or the home page — readers do not
 * need it (placement, MEH-3166). Entry points: the cost question on /join,
 * the same question on /about/for-businesses, the registration hint.
 */

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo.pricing" });
  return {
    title: t("title"),
    description: t("description"),
    openGraph: {
      title: buildEntityTitle(t("og_title"), locale),
      description: t("og_description"),
      type: "website",
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
      images: ["/og-image.png"],
    },
    alternates: buildAlternates(PRICING_PATH, locale),
  };
}

const CARD = "rounded-lg border border-border bg-surface-card p-5 sm:p-6";
const FREE_ITEMS = ["free_item_page", "free_item_found", "free_item_verified"];
const FEE_ITEMS = ["fee_item_booking", "fee_item_group", "fee_item_bag", "fee_item_free"];
const NOTES = [
  { key: "counted", Icon: ListChecks },
  { key: "notice", Icon: BellRinging },
  { key: "money", Icon: HandCoins },
];

/** @param {{ items: string[] }} props */
function CheckList({ items }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((text) => (
        <li key={text} className="flex items-start gap-2.5 leading-relaxed text-text">
          <Check size={18} weight="bold" className="mt-1 shrink-0 text-primary" aria-hidden="true" />
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}

/** @param {{ label: string, price: string, children: import("react").ReactNode, testId: string }} props */
function OptionCard({ label, price, children, testId }) {
  return (
    <div className={`${CARD} flex flex-col gap-3`} data-testid={testId}>
      <p className="text-sm font-medium text-fg-muted">{label}</p>
      <p className="font-headline-lg text-3xl font-black leading-tight text-primary-dark">{price}</p>
      {children}
    </div>
  );
}

export default async function PricingPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "pricing.page" });
  const tJoin = await getTranslations({ locale, namespace: "join" });
  const v = pricingCopyValues();

  return (
    <div className="min-h-screen bg-background text-text" data-testid="pricing-page">
      <div className="mx-auto max-w-3xl px-4 pt-12 sm:px-6 sm:pt-16">
        <header className="mb-8 text-center sm:mb-10">
          <p className="mb-3 text-sm font-medium text-accent">{t("eyebrow")}</p>
          <h1 className="mb-5 font-headline-lg text-[clamp(32px,7vw,52px)] font-black leading-[1.15] text-primary-dark">
            {t("h1")}
          </h1>
          <p className="mx-auto max-w-xl leading-relaxed text-text/85">{t("lead")}</p>
        </header>

        {/* ── Launch period: the one thing a business must not miss ── */}
        <section
          className="mb-10 flex items-start gap-4 rounded-lg bg-primary px-5 py-5 text-background sm:mb-14 sm:px-7 sm:py-6"
          data-testid="pricing-launch"
        >
          <Sparkle size={24} className="mt-1 shrink-0" aria-hidden="true" />
          <div>
            <SectionHeading size="content" className="text-background">{t("launch_title")}</SectionHeading>
            <p className="mt-1 text-lg leading-relaxed text-background/95">{t("launch_body")}</p>
            <p className="mt-2">
              <Link
                href="/join#tools"
                className="rounded-sm font-semibold text-background underline underline-offset-4 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-on-dark"
                data-testid="pricing-tools-link"
              >
                {t("tools_link")}
              </Link>
            </p>
          </div>
        </section>

        {/* ── Free ── */}
        <section className="mb-12 sm:mb-16" data-testid="pricing-free">
          <SectionHeading className="mb-3">{t("free_title")}</SectionHeading>
          <p className="mb-5 leading-relaxed text-text/85">{t("free_lead")}</p>
          <div className={CARD}>
            <CheckList items={FREE_ITEMS.map((key) => t(key))} />
          </div>
        </section>

        {/* ── Once there are results: two ways ── */}
        <section className="mb-12 sm:mb-16" data-testid="pricing-results">
          <SectionHeading className="mb-3">{t("results_title")}</SectionHeading>
          <p className="mb-5 leading-relaxed text-text/85">{t("results_lead", v)}</p>
          <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr] sm:gap-4">
            <OptionCard label={t("sub_title")} price={t("sub_price", v)} testId="pricing-subscription">
              <p className="leading-relaxed text-text/85">{t("sub_note", v)}</p>
              <p className="mt-auto border-t border-border pt-3 font-medium text-text">{t("sub_fit")}</p>
            </OptionCard>
            <p className="self-center text-center font-headline-md text-lg font-bold text-fg-muted" aria-hidden="true">
              {t("or")}
            </p>
            <OptionCard label={t("fee_title")} price={t("fee_price")} testId="pricing-commission">
              <CheckList items={FEE_ITEMS.map((key) => t(key, v))} />
              <p className="rounded bg-background-alt px-3 py-2 text-sm leading-relaxed text-text">{t("fee_example", v)}</p>
              <p className="font-medium text-text">{t("fee_cap", v)}</p>
              <p className="mt-auto border-t border-border pt-3 font-medium text-text">{t("fee_fit")}</p>
            </OptionCard>
          </div>
        </section>

        {/* ── Three short answers ── */}
        <section className="mb-12 grid grid-cols-1 gap-4 sm:mb-16 sm:grid-cols-3" data-testid="pricing-notes">
          {NOTES.map(({ key, Icon }) => (
            <div key={key} className={CARD}>
              <Icon size={24} className="mb-3 text-primary" aria-hidden="true" />
              <h3 className="mb-2 font-headline-md text-lg font-bold text-primary-dark">{t(`${key}_title`)}</h3>
              <p className="leading-relaxed text-text/85">{t(`${key}_body`, v)}</p>
            </div>
          ))}
        </section>

        {/* ── Never for sale (ADR-042 §7) ── */}
        <section
          className="mb-10 flex items-start gap-4 rounded-lg border border-primary/20 bg-background-alt px-5 py-5 sm:px-7"
          data-testid="pricing-never"
        >
          <Prohibit size={24} className="mt-1 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <SectionHeading size="content" className="mb-1 text-primary-dark">{t("never_title")}</SectionHeading>
            <p className="leading-relaxed text-text/85">{t("never_body")}</p>
          </div>
        </section>

        <p className="mb-6 text-center text-sm text-fg-muted" data-testid="pricing-as-of">
          {t("as_of", v)}
        </p>

        <p className="pb-14 text-center sm:pb-20">
          <BackLink href="/join" label={t("back_link")} data-testid="pricing-back" />
        </p>
      </div>

      <ClosingCtaBand
        data-testid="pricing-closing"
        title={t("closing_heading")}
        body={t("closing_line")}
        ctaHref="/register/producer"
        ctaLabel={tJoin("cta")}
        ctaTestId="pricing-closing-cta"
        contact
      />
    </div>
  );
}
