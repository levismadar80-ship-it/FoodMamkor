// @ts-check
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  BellRinging,
  Check,
  HandCoins,
  ListChecks,
  Prohibit,
} from "@phosphor-icons/react/ssr";
import SeedMark from "@/components/brand/SeedMark";
import { Link } from "@/i18n/navigation";
import BusinessCtaLink from "@/components/BusinessCtaLink";
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

/** @param {{ children: import("react").ReactNode, onDark?: boolean }} props */
function StepBadge({ children, onDark = false }) {
  const tone = onDark ? "bg-background/15 text-background" : "bg-primary/10 text-primary";
  return (
    <span
      aria-hidden="true"
      className={`numeric mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full text-base font-bold leading-none ${tone}`}
    >
      {children}
    </span>
  );
}

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
    <div className={`${CARD} flex flex-col gap-3 border-t-4 border-t-primary`} data-testid={testId}>
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
          <SeedMark size={56} className="mx-auto mb-4" />
          <p className="mb-3 text-sm font-medium text-accent">{t("eyebrow")}</p>
          <h1 className="mb-5 font-headline-lg text-[clamp(30px,6.5vw,48px)] font-black leading-[1.15] text-primary-dark text-balance">
            {t("h1")}
          </h1>
          <p className="mx-auto max-w-xl leading-relaxed text-text/85">{t("lead")}</p>
          <p className="mt-6">
            <BusinessCtaLink
              href="/register/producer"
              data-testid="pricing-hero-cta"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-3.5 font-medium text-white transition hover:bg-primary-dark"
            >
              {t("cta")}
            </BusinessCtaLink>
          </p>
        </header>

        {/* ── Today → results → your choice. Step 1 is the launch period: the
            one thing a business must not miss, so it is the filled card. ── */}
        <section className="mb-10 sm:mb-14" data-testid="pricing-steps" aria-labelledby="pricing-steps-heading">
          <h2 id="pricing-steps-heading" className="sr-only">
            {t("steps_label")}
          </h2>
          <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            <li className="rounded-lg bg-primary p-5 text-background" data-testid="pricing-launch">
              <StepBadge onDark>1</StepBadge>
              <h3 className="font-headline-md text-xl font-bold">{t("launch_title")}</h3>
              <p className="mt-1 leading-relaxed text-background/95">{t("launch_body")}</p>
              <p className="mt-3">
                <Link
                  href="/join#tools"
                  className="rounded-sm font-semibold text-background underline underline-offset-4 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-on-dark"
                  data-testid="pricing-tools-link"
                >
                  {t("tools_link")}
                </Link>
              </p>
            </li>
            {["step2", "step3"].map((key, index) => (
              <li key={key} className={CARD}>
                <StepBadge>{index + 2}</StepBadge>
                <h3 className="font-headline-md text-xl font-bold text-primary-dark">{t(`${key}_title`)}</h3>
                <p className="mt-1 leading-relaxed text-text/85">{t(`${key}_body`, v)}</p>
              </li>
            ))}
          </ol>
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
              <p className="leading-relaxed text-text">{t("sub_fee", v)}</p>
              <div className="mt-auto border-t border-border pt-3">
                <p className="font-medium text-text">{t("sub_fit", v)}</p>
                <p className="mt-1 text-sm leading-relaxed text-fg-muted" data-testid="pricing-subscription-example">
                  {t("sub_example", v)}
                </p>
              </div>
            </OptionCard>
            <p className="self-center text-center font-headline-md text-lg font-bold text-fg-muted" aria-hidden="true">
              {t("or")}
            </p>
            <OptionCard label={t("fee_title")} price={t("fee_price")} testId="pricing-commission">
              <CheckList items={FEE_ITEMS.map((key) => t(key, v))} />
              <p className="rounded bg-background-alt px-3 py-2 text-sm leading-relaxed text-text">{t("fee_example", v)}</p>
              <div className="mt-auto border-t border-border pt-3">
                <p className="font-medium text-text">{t("fee_fit")}</p>
                <p className="mt-1 text-sm leading-relaxed text-fg-muted">{t("fee_note")}</p>
              </div>
            </OptionCard>
          </div>
          <div
            className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-dashed border-border px-5 py-4 sm:mt-4"
            data-testid="pricing-stay-free"
          >
            <p className="font-headline-md text-lg font-bold text-primary-dark">
              {t("stay_title")}: {t("stay_price")}
            </p>
            <p className="leading-relaxed text-text/85">{t("stay_body")}</p>
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
