import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { ArrowLeft, ChatCircleDots, ListChecks, Quotes } from "@phosphor-icons/react/ssr";
import BusinessCtaLink from "@/components/BusinessCtaLink";
import EditorialPhoto from "@/components/EditorialPhoto";
import { BRAND_NAME } from "@/lib/constants";
import { buildAlternates, OG_LOCALE } from "@/lib/i18n-seo";

/**
 * /join — producer recruitment landing (MEH-995).
 *
 * Purpose:  The canonical door for recruiting business owners — one URL that
 *           bundles the scattered assets (/about/process, /about/for-businesses,
 *           the wizard) into a single persuasion sequence with ONE CTA to
 *           /register/producer. Etsy-/sell / Wolt-merchant template.
 * Does NOT: own the tier taxonomy (lives in the wizard + producer page,
 *           MEH-758), mention premium/fees outside the FAQ answer (MEH-617
 *           model undecided — "no-fees" sits in the FAQ like Etsy, not the
 *           headline), or carry a real testimonial yet (Template-10 verbatim
 *           intake pre-launch — MEH-931; the slot is render-gated OFF, MEH-2419).
 * Related:  frontend/components/Footer.jsx:77 (nav entry) ·
 *           docs/COPY_BANK.md § /join (locked strings) ·
 *           RegisterPreflight.jsx (sister surface, MEH-994)
 * History:  MEH-995 (creation — positioning-FINAL port)
 */

// MEH-2419: testimonial slot render-gated OFF until a real quote exists — the
// same rule as /about (MEH-1112): real social proof or nothing, no empty shelf
// on a persuasion page. JSX + i18n keys kept intact; flip to true when it lands.
const SHOW_TESTIMONIAL = false;

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo.join" });
  return {
    title: { absolute: t("title") },
    description: t("description"),
    openGraph: {
      title: t("og_title"),
      description: t("og_description"),
      type: "website",
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
      images: ["/og-image.png"],
    },
    alternates: buildAlternates("/join", locale),
  };
}

// MEH-995 drew these as 5xl gold Cormorant "01–04", louder than the step
// titles. MEH-2564 keeps the numbers (this IS an ordered process) but as a
// small green timeline badge in the body font, below the title in weight.
function StepNumeral({ children }) {
  return (
    <div
      data-testid="join-step-numeral"
      className="numeric inline-flex items-center justify-center w-9 h-9 rounded-full bg-primary/10 text-primary font-bold text-base leading-none mb-3"
    >
      {children}
    </div>
  );
}

export default async function JoinPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "join" });

  const steps = ["1", "2", "3", "4"].map((n) => ({
    numeral: n,
    title: t(`how.step${n}_title`),
    text: t(`how.step${n}_text`),
  }));

  return (
    <div className="min-h-screen bg-background text-text">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* ── Hero — single CTA of the page (positioning-FINAL order:
               eyebrow → H1 → subhead → CTA → trust hint) ── */}
        <header className="text-center mb-8 sm:mb-10" data-testid="join-hero">
          <p className="text-sm font-medium text-accent mb-3">{t("eyebrow")}</p>
          <h1 className="font-headline-lg font-black text-primary-dark leading-[1.15] mb-5 text-[clamp(32px,7vw,52px)]">
            {t("h1")}
          </h1>
          <p className="text-text/85 leading-relaxed max-w-xl mx-auto mb-8">{t("subhead")}</p>
          {/* MEH-1489: auth-state-aware — producer sees a dashboard link,
              admin sees nothing; guest keeps the join-cta testid. */}
          <BusinessCtaLink
            href="/register/producer"
            data-testid="join-cta"
            className="inline-flex items-center gap-2 bg-primary text-white rounded-lg px-8 py-3.5 font-medium transition hover:bg-primary-dark"
          >
            {t("cta")}
          </BusinessCtaLink>
          <p className="text-sm text-fg-muted mt-3">{t("trust_hint")}</p>
        </header>

        {/* MEH-2597: a person at work, under the CTA so the CTA stays in the
            first screen at 375. The hero's bottom margin is the gap above the
            photo; the photo carries the section gap below. Swap for a Wave 1 business photo when one lands. */}
        <EditorialPhoto
          src="https://res.cloudinary.com/dfzpscjks/image/upload/login/hero-produce-crate.jpg"
          testId="join-photo"
          className="mb-14 sm:mb-20"
        />

        {/* ── How it works — 4 numbered spreads ── */}
        <section className="mb-14 sm:mb-20" data-testid="join-how">
          <p className="text-sm font-medium text-fg-muted text-center mb-2">
            {t("how.eyebrow")}
          </p>
          <h2 className="font-headline-lg font-bold text-text text-center mb-10 text-[clamp(26px,3.5vw,38px)]">
            {t("how.heading")}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-10">
            {steps.map((step) => (
              <div key={step.numeral}>
                <StepNumeral>{step.numeral}</StepNumeral>
                <h3 className="font-headline-md text-xl font-bold mb-2">{step.title}</h3>
                <p className="text-text/85 leading-relaxed">{step.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center">
            <Link
              href="/about/process"
              className="inline-flex items-center gap-2 text-primary font-semibold hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {t("how.process_link")}
              <ArrowLeft size={16} aria-hidden="true" />
            </Link>
          </p>
        </section>

        {/* ── What to prepare — mirrors the MEH-994 pre-flight checklist ── */}
        <section className="mb-14 sm:mb-20" data-testid="join-prepare">
          <div className="bg-background border border-primary/20 rounded-md px-5 py-4">
            <p className="font-medium text-text flex items-center gap-2 mb-3">
              <ListChecks size={20} className="text-primary shrink-0" aria-hidden="true" />
              {t("prepare.title")}
            </p>
            <ul className="space-y-2 text-text list-disc ps-5">
              <li>{t("prepare.item_story")}</li>
              <li>{t("prepare.item_photos")}</li>
              <li>{t("prepare.item_license")}</li>
            </ul>
          </div>
        </section>

        {/* ── Reassurance card — positive framing, no "not-bureaucracy" ── */}
        <section className="mb-14 sm:mb-20" data-testid="join-card">
          <div className="bg-background border border-primary/20 rounded-md px-5 py-4">
            <p className="font-medium text-text flex items-center gap-2 mb-2">
              <ChatCircleDots size={20} className="text-primary shrink-0" aria-hidden="true" />
              {t("card.title")}
            </p>
            <p className="text-text/85 leading-relaxed">{t("card.body")}</p>
          </div>
        </section>

        {/* ── Testimonial slot — gated OFF by SHOW_TESTIMONIAL (MEH-2419) until a
               real Template-10 verbatim quote exists. DO NOT fill with invented
               business copy (COPY_BANK §8 guardrail). ── */}
        {SHOW_TESTIMONIAL && (
          <section className="mb-14 sm:mb-20 text-center" data-testid="join-testimonial">
            <Quotes size={28} className="text-accent mx-auto mb-3" aria-hidden="true" />
            <p className="text-sm font-medium text-fg-muted mb-3">
              {t("testimonial.eyebrow")}
            </p>
            <blockquote className="font-headline-md text-xl text-text/70 leading-relaxed max-w-xl mx-auto italic">
              {t("testimonial.quote")}
            </blockquote>
          </section>
        )}

        {/* ── FAQ teaser — the price answer lives here (Etsy pattern), not in
               the hero. Answer string is LOCKED (BRAND no-fees LOCK). ── */}
        <section className="text-center" data-testid="join-faq">
          <p className="text-sm font-medium text-fg-muted mb-2">
            {t("faq.eyebrow")}
          </p>
          <h2 className="font-headline-md text-2xl font-bold text-text mb-3">{t("faq.q_cost")}</h2>
          <p className="text-text/85 leading-relaxed max-w-xl mx-auto mb-6">{t("faq.a_cost")}</p>
          <Link
            href="/about/for-businesses"
            className="inline-flex items-center gap-2 text-primary font-semibold hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {t("faq.all_link")}
            <ArrowLeft size={16} aria-hidden="true" />
          </Link>
        </section>
      </div>
    </div>
  );
}
