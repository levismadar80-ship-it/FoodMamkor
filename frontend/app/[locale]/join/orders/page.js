// @ts-check
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Check } from "@phosphor-icons/react/ssr";
import SeedMark from "@/components/brand/SeedMark";
import { Link } from "@/i18n/navigation";
import BackLink from "@/components/ui/BackLink";
import Heading from "@/components/ui/Heading";
import SectionHeading from "@/components/ui/SectionHeading";
import { ORDERS_GUIDE_NUMBERS, ORDERS_GUIDE_PATH } from "@/lib/orders-guide";
import { PRICING_PATH, pricingCopyValues } from "@/lib/pricing";
import { buildSeoPageMetadata } from "@/lib/seo-page-metadata";

/**
 * Module:   join/orders/page
 * Purpose:  «איך מקבלים הזמנות דרך מהמקור» — how a business takes orders
 *           through the site, for people who are not technical (MEH-3981,
 *           mockup v4 approved by Sapir 27/11). Order: what it is + three
 *           short answers (cost, no answer, stopping) → what the customer
 *           does → what the business gets → after approving → 5 setup
 *           steps → telling customers → questions → CTAs.
 * Touches:  nothing — a static server page, no fetch. Screenshots are
 *           frontend/public/join/orders/*.webp (Hebrew UI, 27/11).
 * Does NOT: state a number of its own. Hours and the staff cap come from
 *           lib/orders-guide.js, the notice days from lib/pricing.js.
 * Related:  app/[locale]/join/pricing/page.js (the sibling page) ·
 *           docs/features/product-orders.md.
 * History:  MEH-3981 (creation, 2026-11-27).
 *
 * DO NOT link this page from the header or the footer (placement, Sapir
 * 27/11). Entry points: the «הזמנות» tab in the dashboard, OrdersIntroCard,
 * the product_orders row on /join, and outreach message 2.
 */

export async function generateMetadata({ params }) {
  const { locale } = await params;
  return buildSeoPageMetadata(locale, { namespace: "seo.orders_guide", path: ORDERS_GUIDE_PATH });
}

const CARD = "rounded-lg border border-border bg-surface-card p-4 sm:p-5";
const LINK = "font-medium text-action-primary underline underline-offset-4 hover:no-underline focus-ring rounded-sm";
const CTA = "inline-flex min-h-touch items-center justify-center rounded-full bg-primary px-8 py-3 font-medium text-white transition hover:bg-primary-dark focus-ring";
const DASHBOARD_ORDERS = "/producer/dashboard/orders";

/** @type {Record<string, { src: string, width: number, height: number }>} */
const SHOTS = {
  customer_1: { src: "/join/orders/customer-1-page.webp", width: 780, height: 1158 },
  customer_2: { src: "/join/orders/customer-2-bar.webp", width: 780, height: 808 },
  customer_3: { src: "/join/orders/customer-3-form.webp", width: 780, height: 1328 },
  owner_nav: { src: "/join/orders/owner-nav.webp", width: 780, height: 180 },
  owner_order: { src: "/join/orders/owner-order.webp", width: 716, height: 712 },
  setup_1: { src: "/join/orders/setup-1-business-id.webp", width: 716, height: 250 },
  setup_2: { src: "/join/orders/setup-2-windows.webp", width: 716, height: 860 },
  setup_3: { src: "/join/orders/setup-3-products.webp", width: 716, height: 1000 },
  setup_4: { src: "/join/orders/setup-4-enable.webp", width: 716, height: 110 },
  setup_5: { src: "/join/orders/setup-5-preview.webp", width: 780, height: 720 },
};
const FAQ = ["no_show", "cancel", "delivery", "shabbat", "friday", "receipts", "staff"];
const ACTIONS = ["confirm", "propose", "decline"];

/** @param {{ id: string, alt: string }} props */
function Shot({ id, alt }) {
  const shot = SHOTS[id];
  return (
    <div className="max-h-[22rem] overflow-hidden rounded-md border border-border bg-surface-card">
      <Image src={shot.src} width={shot.width} height={shot.height} alt={alt} sizes="(max-width: 640px) 100vw, 600px" className="block h-auto w-full" />
    </div>
  );
}

/** @param {{ n?: number, title: string, children?: import("react").ReactNode, testId?: string }} props */
function Step({ n, title, children, testId }) {
  return (
    <li className={`${CARD} flex flex-col gap-3`} data-testid={testId}>
      <Heading level={3} className="flex items-center gap-2">
        {n ? (
          <span aria-hidden="true" className="numeric inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
            {n}
          </span>
        ) : null}
        <span>{title}</span>
      </Heading>
      {children}
    </li>
  );
}

/** @param {{ label: string, text: string, testId: string }} props */
function Message({ label, text, testId }) {
  return (
    <figure className="max-w-md rounded-lg rounded-es-none bg-primary/10 px-4 py-3" data-testid={testId}>
      <figcaption className="mb-1 text-xs text-fg-muted">{label}</figcaption>
      <p className="whitespace-pre-line text-sm leading-relaxed text-text">{text}</p>
    </figure>
  );
}

export default async function OrdersGuidePage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "orders_guide" });
  // The button names and the cost question are the ones the business already
  // reads in the dashboard and on /join, so they cannot drift apart.
  const tActions = await getTranslations({ locale, namespace: "dashboard.producer.orders.actions" });
  const tFaq = await getTranslations({ locale, namespace: "join.faq" });
  const tBusiness = await getTranslations({ locale, namespace: "about_business" });
  const v = { ...pricingCopyValues(), ...ORDERS_GUIDE_NUMBERS };
  /** @param {string} href @param {string} testId */
  const linkTo = (href, testId) =>
    function RichLink(/** @type {import("react").ReactNode} */ chunks) {
      return <Link href={href} className={LINK} data-testid={testId}>{chunks}</Link>;
    };
  /** @param {import("react").ReactNode} chunks */
  const bold = (chunks) => <b className="font-semibold text-text">{chunks}</b>;
  /** @param {string} key */
  const see = (key) => (
    <p className="text-sm leading-relaxed text-text/85">
      <b className="font-semibold text-text">{t("see")}</b> {t(key)}
    </p>
  );
  /** @param {string} key */
  const after = (key) => <p className="text-sm leading-relaxed text-text/85">{t(key)}</p>;

  return (
    <div className="min-h-screen bg-background text-text" data-testid="orders-guide-page">
      <div className="mx-auto max-w-2xl px-4 pb-16 pt-12 sm:px-6 sm:pt-16">
        <header className="mb-8 text-center">
          <SeedMark size={48} className="mx-auto mb-4" />
          <p className="mb-3 text-sm font-medium text-accent">{tBusiness("eyebrow")}</p>
          <Heading level={1} variant="hero" className="mb-4 text-balance">
            {t("h1")}
          </Heading>
          <p className="mx-auto max-w-xl leading-relaxed text-text/85">{t("lead")}</p>
          <ul className="mt-5 flex flex-wrap justify-center gap-2" data-testid="orders-guide-chips">
            {["chip_pay", "chip_approve", "chip_off"].map((key) => (
              <li key={key} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-card px-3 py-1 text-sm">
                <Check size={14} weight="bold" className="text-primary" aria-hidden="true" />
                {t(key)}
              </li>
            ))}
          </ul>
          <p className="mt-5 text-sm text-text/85">{t.rich("fit", { link: linkTo("/register/producer", "orders-guide-register") })}</p>
          <p className="mt-5">
            <Link href={DASHBOARD_ORDERS} className={CTA} data-testid="orders-guide-cta">{t("cta")}</Link>
          </p>
        </header>

        <section aria-label={t("answers_label")} className={`${CARD} mb-12 flex flex-col gap-3 leading-relaxed`} data-testid="orders-guide-answers">
          <p><b className="font-semibold">{tFaq("q_cost")}</b> {t.rich("cost_body", { ...v, link: linkTo(PRICING_PATH, "orders-guide-pricing") })}</p>
          <p><b className="font-semibold">{t("late_title")}</b> {t("late_body", v)}</p>
          <p><b className="font-semibold">{t("stop_title")}</b> {t("stop_body")}</p>
        </section>

        <section className="mb-12" data-testid="orders-guide-customer">
          <SectionHeading className="mb-4">{t("customer_title")}</SectionHeading>
          <ol className="flex flex-col gap-4">
            <Step n={1} title={t("customer_1")}><Shot id="customer_1" alt={t("customer_1_alt")} /></Step>
            <Step n={2} title={t("customer_2")}><Shot id="customer_2" alt={t("customer_2_alt")} /></Step>
            <Step n={3} title={t("customer_3")}>
              <Shot id="customer_3" alt={t("customer_3_alt")} />
              {after("customer_3_after")}
            </Step>
          </ol>
        </section>

        <section className="mb-12" data-testid="orders-guide-owner">
          <SectionHeading className="mb-4">{t("owner_title")}</SectionHeading>
          <div className="mb-4 flex flex-col gap-2">
            <Message label={t("owner_wa_label")} text={t("owner_wa")} testId="orders-guide-owner-message" />
            {after("owner_wa_after")}
          </div>
          <ul className="flex flex-col gap-4">
            <Step title={t("owner_nav")}>
              <Shot id="owner_nav" alt={t("owner_nav_alt")} />
              {after("owner_nav_after")}
            </Step>
            <Step title={t("owner_order")}>
              <Shot id="owner_order" alt={t("owner_order_alt")} />
              <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                {ACTIONS.map((key) => (
                  <div key={key} className="rounded-md border border-border px-3 py-2">
                    <dt className="font-semibold text-action-primary">{tActions(key)}</dt>
                    <dd className="text-text/85">{t(`action_${key}_body`)}</dd>
                  </div>
                ))}
              </dl>
              {after("owner_estimate")}
            </Step>
          </ul>
        </section>

        <section className="mb-12 flex flex-col gap-4" data-testid="orders-guide-after">
          <SectionHeading>{t("after_title")}</SectionHeading>
          <p className="leading-relaxed text-text/85">{t.rich("after_body", { b: bold })}</p>
          <Message label={t("after_wa_label")} text={t("after_wa")} testId="orders-guide-customer-message" />
        </section>

        <section id="setup" className="mb-12 scroll-mt-24" data-testid="orders-guide-setup">
          <SectionHeading className="mb-2">{t("setup_title")}</SectionHeading>
          <p className="mb-4 leading-relaxed text-text/85">{t("setup_lead")}</p>
          <ol className="flex flex-col gap-4">
            <Step n={1} title={t("setup_1")}>
              <Shot id="setup_1" alt={t("setup_1_alt")} />
              <p className="text-sm leading-relaxed text-text/85">{t.rich("setup_1_body", { link: linkTo("/contact", "orders-guide-contact-inline") })}</p>
            </Step>
            <Step n={2} title={t("setup_2")}>
              <Shot id="setup_2" alt={t("setup_2_alt")} />
              {after("setup_2_body")}
              {see("setup_2_see")}
            </Step>
            <Step n={3} title={t("setup_3")}>
              <Shot id="setup_3" alt={t("setup_3_alt")} />
              {after("setup_3_body")}
              {see("setup_3_see")}
            </Step>
            <Step n={4} title={t("setup_4")}>
              <Shot id="setup_4" alt={t("setup_4_alt")} />
              {after("setup_4_body")}
              {see("setup_4_see")}
            </Step>
            <Step n={5} title={t("setup_5")}>
              <Shot id="setup_5" alt={t("setup_5_alt")} />
              {after("setup_5_body")}
            </Step>
          </ol>
        </section>

        <section className="mb-12" data-testid="orders-guide-share">
          <SectionHeading className="mb-2">{t("share_title")}</SectionHeading>
          <p className="leading-relaxed text-text/85">{t("share_body")}</p>
        </section>

        <section className="mb-12" data-testid="orders-guide-faq">
          <SectionHeading className="mb-4">{t("faq_title")}</SectionHeading>
          <div className="flex flex-col gap-2">
            {FAQ.map((key) => (
              <details key={key} className={`${CARD} group`} data-testid="orders-guide-faq-item">
                <summary className="cursor-pointer font-semibold text-text focus-ring rounded-sm">{t(`faq_${key}_q`)}</summary>
                <p className="mt-2 leading-relaxed text-text/85">{t(`faq_${key}_a`, v)}</p>
              </details>
            ))}
          </div>
        </section>

        <div className="mb-10 flex flex-col items-center gap-3">
          <Link href={DASHBOARD_ORDERS} className={CTA} data-testid="orders-guide-cta-bottom">{t("cta")}</Link>
          <p className="text-text/85">{t.rich("contact_line", { link: linkTo("/contact", "orders-guide-contact") })}</p>
        </div>

        <p className="text-center">
          <BackLink href="/join" label={t("back_link")} data-testid="orders-guide-back" />
        </p>
      </div>
    </div>
  );
}
