import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArrowLeft, ListChecks, PencilSimple } from "@phosphor-icons/react/ssr";
import BusinessCtaLink from "@/components/BusinessCtaLink";
import EditorialPhoto from "@/components/EditorialPhoto";
import JoinFeatures from "@/components/join/JoinFeatures";
import JoinStickyBar from "@/components/join/JoinStickyBar";
import { BRAND_NAME } from "@/lib/constants";
import { buildAlternates, OG_LOCALE } from "@/lib/i18n-seo";

/**
 * /join — producer recruitment landing (MEH-995; rebuilt to the approved
 * 07/11 design in MEH-2799).
 *
 * Purpose:  The canonical door for recruiting business owners. Order (SPEC §1):
 *           hero → photo → draft card → page video → features → four steps +
 *           signup video → what to prepare → FAQ → closing band (full brand
 *           green, meets the footer). A sticky «מצטרפים» bar covers the middle,
 *           and only the middle — never two «מצטרפים» on screen at once.
 * Does NOT: own the tool list (lib/business-features.js does — JoinFeatures
 *           renders it), mention premium/fees outside the FAQ (the price
 *           answer lives there, Etsy pattern), or carry a testimonial — the
 *           placeholder slot was removed in MEH-2799; real social proof gets
 *           its own card when it exists (COPY_BANK §8).
 * Related:  components/join/JoinFeatures.jsx · components/join/JoinStickyBar.jsx ·
 *           docs/COPY_BANK.md § /join v2 (the strings) · docs/BRAND.md §6 (the
 *           pattern row) · RegisterPreflight.jsx (sister surface, MEH-994).
 * History:  MEH-995 (creation) · MEH-2564 (step badges) · MEH-2597 (photo) ·
 *           MEH-2799 (v2 rebuild).
 *
 * Media: same-origin files under /images/join/ (CSP default-src 'self',
 * next.config.js:82 — no header change). Both videos are click-to-play with
 * the browser's own controls and preload="none", so the page loads posters only.
 */

const MEDIA_DIR = "/images/join";
const LOGO_MARK_PX = 56;
const VIDEO_WIDTH = 1080;
const VIDEO_HEIGHT = 1350;

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

/** A click-to-play portrait video (4:5) with the «עסק לדוגמה» corner label. */
function JoinVideo({ name, ariaLabel, sampleLabel, testId }) {
  return (
    <div
      className="relative mx-auto aspect-[4/5] w-full max-w-[360px] overflow-hidden rounded-md border border-border bg-border"
      data-testid={testId}
    >
      <video
        className="h-full w-full object-cover"
        src={`${MEDIA_DIR}/${name}.mp4`}
        poster={`${MEDIA_DIR}/${name}-poster.jpg`}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
        aria-label={ariaLabel}
        controls
        playsInline
        preload="none"
      />
      <span
        data-testid="join-sample-label"
        className="pointer-events-none absolute top-2 start-2 rounded-sm bg-background/90 px-2 py-0.5 text-2xs font-medium text-fg-muted"
      >
        {sampleLabel}
      </span>
    </div>
  );
}

const LINK_CLASS =
  "inline-flex items-center gap-2 text-primary font-semibold hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
const CARD_CLASS = "bg-background border border-primary/20 rounded-md px-5 py-4";
const FAQ_KEYS = ["cost", "google", "revenue", "customers"];

export default async function JoinPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "join" });
  const sample = t("features.sample_label");

  const steps = ["1", "2", "3", "4"].map((n) => ({
    numeral: n,
    title: t(`how.step${n}_title`),
    text: t(`how.step${n}_text`),
  }));

  return (
    <div className="min-h-screen bg-background text-text">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-12 sm:pt-16">
        {/* ── Hero (unchanged copy; MEH-2799 adds only the marker the sticky bar observes) ── */}
        <header className="text-center mb-8 sm:mb-10" data-testid="join-hero">
          <p className="text-sm font-medium text-accent mb-3">{t("eyebrow")}</p>
          <h1 className="font-headline-lg font-black text-primary-dark leading-[1.15] mb-5 text-[clamp(32px,7vw,52px)]">
            {t("h1")}
          </h1>
          <p className="text-text/85 leading-relaxed max-w-xl mx-auto mb-8">{t("subhead")}</p>
          {/* MEH-1489: auth-state-aware — producer sees a dashboard link,
              admin sees nothing; guest keeps the join-cta testid. */}
          <span data-join-hero-cta className="inline-block">
            <BusinessCtaLink
              href="/register/producer"
              data-testid="join-cta"
              className="inline-flex items-center gap-2 bg-primary text-white rounded-lg px-8 py-3.5 font-medium transition hover:bg-primary-dark"
            >
              {t("cta")}
            </BusinessCtaLink>
          </span>
          <p className="text-sm text-fg-muted mt-3">{t("trust_hint")}</p>
        </header>

        {/* MEH-2597: a person at work, under the CTA so the CTA stays in the
            first screen at 375. Swap for a Wave 1 business photo when one lands. */}
        <EditorialPhoto
          src="https://res.cloudinary.com/dfzpscjks/image/upload/login/hero-produce-crate.jpg"
          testId="join-photo"
          className="mb-10 sm:mb-14"
        />

        {/* ── Draft card: "no time for forms? we'll draft it" ── */}
        <section className="mb-14 sm:mb-20" data-testid="join-draft">
          <div className={CARD_CLASS}>
            <p className="font-medium text-text flex items-center gap-2 mb-2">
              <PencilSimple size={20} className="text-primary shrink-0" aria-hidden="true" />
              {t("draft.title")}
            </p>
            <p className="text-text/85 leading-relaxed mb-3">{t("draft.body")}</p>
            <Link href="/contact" className={LINK_CLASS}>
              {t("draft.cta")}
              <ArrowLeft size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>

        {/* ── One page video, click-to-play (MEH-2310's /join half) ── */}
        <section className="mb-14 sm:mb-20 text-center" data-testid="join-video">
          <p className="text-sm font-medium text-fg-muted mb-2">{t("video.eyebrow")}</p>
          <h2 className="font-headline-lg font-bold text-text mb-6 text-[clamp(26px,3.5vw,38px)]">
            {t("video.heading")}
          </h2>
          <JoinVideo name="video-page" ariaLabel={t("video.aria")} sampleLabel={sample} testId="join-page-video" />
        </section>
      </div>

      {/* ── Features: full-bleed background-alt band ── */}
      <JoinFeatures />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-14 sm:pt-20">
        {/* ── How it works — 4 numbered spreads, then the signup video ── */}
        <section className="mb-14 sm:mb-20" data-testid="join-how">
          <p className="text-sm font-medium text-fg-muted text-center mb-2">{t("how.eyebrow")}</p>
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
          <div className="mt-10">
            <JoinVideo
              name="video-signup"
              ariaLabel={t("how.signup_video_aria")}
              sampleLabel={sample}
              testId="join-signup-video"
            />
          </div>
          <p className="mt-8 text-center">
            <Link href="/about/process" className={LINK_CLASS}>
              {t("how.process_link")}
              <ArrowLeft size={16} aria-hidden="true" />
            </Link>
          </p>
        </section>

        {/* ── What to prepare — mirrors the MEH-994 pre-flight checklist ── */}
        <section className="mb-14 sm:mb-20" data-testid="join-prepare">
          <div className={CARD_CLASS}>
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

        {/* ── FAQ — the price answer lives here (Etsy pattern), not in the
               hero. a_cost is LOCKED (ADR-030 §5 — the one sanctioned «לעולם»). ── */}
        <section className="pb-14 sm:pb-20" data-testid="join-faq">
          <p className="text-sm font-medium text-fg-muted text-center mb-2">{t("faq.eyebrow")}</p>
          <h2 className="font-headline-lg font-bold text-text text-center mb-8 text-[clamp(26px,3.5vw,38px)]">
            {t("faq.heading")}
          </h2>
          <div className="space-y-6">
            {FAQ_KEYS.map((key) => (
              <div key={key} data-testid="join-faq-item">
                <h3 className="font-headline-md text-lg font-bold text-text mb-1.5">{t(`faq.q_${key}`)}</h3>
                <p className="text-text/85 leading-relaxed">{t(`faq.a_${key}`)}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center">
            <Link href="/about/for-businesses" className={LINK_CLASS}>
              {t("faq.all_link")}
              <ArrowLeft size={16} aria-hidden="true" />
            </Link>
          </p>
        </section>
      </div>

      {/* ── Closing band: full brand green, runs into the footer (MEH-2487 marker) ── */}
      <section
        data-testid="join-closing"
        data-join-closing
        data-meets-footer
        className="bg-primary text-background py-14 md:py-20"
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <Image
            src="/logo-inverted.svg"
            alt=""
            aria-hidden="true"
            width={LOGO_MARK_PX}
            height={LOGO_MARK_PX}
            unoptimized
            className="mx-auto mb-5"
          />
          <h2 className="font-headline-lg font-black text-background text-[clamp(28px,6vw,44px)] leading-tight text-balance">
            {t("closing.heading")}
          </h2>
          <p className="mt-3.5 text-base leading-relaxed text-background/90 max-w-[46ch] mx-auto">
            {t("closing.line")}
          </p>
          <div className="mt-7">
            {/* Same target as the hero CTA. MEH-1489: auth-state-aware. */}
            <BusinessCtaLink
              href="/register/producer"
              data-testid="join-closing-cta"
              className="inline-flex items-center gap-2 min-h-[52px] px-8 py-3.5 bg-background text-primary rounded-lg font-semibold text-base hover:bg-background-alt transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-on-dark focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
            >
              {t("cta")}
            </BusinessCtaLink>
          </div>
          <p className="mt-3 text-sm text-background/90">{t("meta_line")}</p>
          <p className="mt-4 text-sm text-background">
            {t("closing.question")}{" "}
            <Link
              href="/contact"
              className="underline underline-offset-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-on-dark"
            >
              {t("draft.cta")}
            </Link>
          </p>
        </div>
      </section>

      <JoinStickyBar />
    </div>
  );
}
