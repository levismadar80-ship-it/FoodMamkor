import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  Camera,
  BookOpen,
  CaretDown,
  SealCheck,
  Basket,
  Truck,
  ChatCircleText,
} from "@phosphor-icons/react/ssr";
import { Link } from "@/i18n/navigation";
import { BRAND_NAME } from "@/lib/constants";
import { SITE_URL, serializeJsonLd } from "@/lib/seo";
import { buildAlternates, OG_LOCALE } from "@/lib/i18n-seo";
// MEH-1113: unify inbound routing — the bottom line points business owners at
// the contact form + email instead of an Instagram DM (untracked, no record).
import { CONTACT_EMAIL } from "@/lib/env.client";

// MEH-475 PR-C4b/chunk-4: for-businesses FAQ i18n. First production
// pattern for JSON-LD that consumes translation keys via a t() pass.
// FAQPage schema shape unchanged: name + acceptedAnswer.text built from
// the same source keys the visible <details> rendering uses.
// MEH-476 PR 3b2: per-page hreflang via buildAlternates; og:locale per locale.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations("about_business");
  return {
    // title.absolute prevents layout's `%s | ${BRAND_NAME}` template appending.
    title: { absolute: t("meta_title") },
    description: t("meta_description"),
    openGraph: {
      title: t("og_title"),
      description: t("og_description"),
      type: "article",
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
      images: ["/og-image.png"],
    },
    alternates: buildAlternates("/about/for-businesses", locale),
  };
}

const CATEGORIES = [
  {
    key: "money_value",
    items: [
      { key: "cost", open: true },
      { key: "value" },
    ],
  },
  {
    key: "time_effort",
    items: [
      { key: "time" },
      { key: "writing" },
    ],
  },
  {
    key: "trust",
    items: [
      { key: "founder" },
      { key: "leads" },
    ],
  },
  {
    key: "control",
    items: [
      { key: "visibility" },
      { key: "control" },
    ],
  },
];

const ALL_ITEM_KEYS = CATEGORIES.flatMap((c) => c.items.map((i) => i.key));

function buildFaqJsonLd(t) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${SITE_URL}/about/for-businesses#faq`,
    mainEntity: ALL_ITEM_KEYS.map((k) => ({
      "@type": "Question",
      name: t(`faq.${k}.q`),
      acceptedAnswer: {
        "@type": "Answer",
        text: t(`faq.${k}.a`).replace(/\*\*/g, ""),
      },
    })),
  };
}

function renderInline(text, keyBase) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${keyBase}-${i}`}>{part.slice(2, -2)}</strong>;
    }
    return <span key={`${keyBase}-${i}`}>{part}</span>;
  });
}

function renderAnswer(text) {
  const paragraphs = text.split("\n\n");
  return paragraphs.map((para, i) => (
    <p key={i} className={i === paragraphs.length - 1 ? "" : "mb-3"}>
      {renderInline(para, `p${i}`)}
    </p>
  ));
}

// MEH-476 PR 3b2: async + setRequestLocale + getTranslations enables ● SSG.
export default async function FaqForBusinessesPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "about_business" });
  const jsonLd = buildFaqJsonLd(t);
  return (
    <section className="min-h-screen bg-background text-text">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <header className="mb-10 sm:mb-14">
          <p className="text-xs sm:text-sm mb-3 text-fg-muted">
            {t("eyebrow")}
          </p>
          <h1 className="font-headline-lg mb-4 text-primary-dark text-[clamp(28px,6vw,44px)] leading-[1.15] font-black">
            {t("heading")}
          </h1>
          {/* MEH-923: surface the existing footer register CTA here in the header,
              above the FAQ, so the primary action isn't gated behind 8 accordion
              items. Same string t("cta") + markup as the footer CTA below — no
              new he.json key (MEH-840 freeze). Footer CTA stays as-is. */}
          <Link
            href="/register/producer"
            className="inline-flex items-center gap-2 font-medium transition hover:opacity-90 bg-primary text-white rounded-sm px-6 py-3 focus-ring"
          >
            {t("cta")}
          </Link>
        </header>

        <div className="flex flex-col gap-10 sm:gap-12">
          {CATEGORIES.map((cat) => (
            <section key={cat.key}>
              <h2 className="font-headline-md mb-4 text-primary text-[20px] font-bold">
                {t(`categories.${cat.key}`)}
              </h2>
              <ul className="flex flex-col gap-3">
                {cat.items.map((item) => (
                  <li key={item.key}>
                    <details
                      open={item.open || undefined}
                      className="group rounded-lg border border-border bg-surface transition-colors"
                    >
                      <summary className="cursor-pointer list-none flex items-start justify-between gap-4 px-5 py-4 font-headline-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg text-text text-[17px] font-semibold">
                        <span>{t(`faq.${item.key}.q`)}</span>
                        <CaretDown
                          aria-hidden="true"
                          size={20}
                          weight="bold"
                          className="shrink-0 mt-1 transition-transform group-open:rotate-180 text-primary"
                        />
                      </summary>
                      <div className="px-5 pb-5 pt-1 text-[15px] leading-relaxed text-text/90">
                        {renderAnswer(t(`faq.${item.key}.a`))}
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {/* MEH-1074 Wave 3: "sample perfect listing" showcase — annotated
            anatomy of a complete profile, clearly labeled as an example
            (no live-profile link on purpose: MEH-409 swaps the demo for a
            real business after first-10, and a hardcoded slug would rot). */}
        <section aria-labelledby="showcase-heading" className="mt-14 sm:mt-16">
          <div className="flex items-center gap-3 mb-4">
            <h2
              id="showcase-heading"
              className="font-headline-md text-primary text-[20px] font-bold"
            >
              {t("showcase.heading")}
            </h2>
            <span className="shrink-0 rounded-full border border-accent/50 bg-accent/10 px-3 py-0.5 text-xs font-semibold text-primary-dark">
              {t("showcase.label")}
            </span>
          </div>
          <p className="text-[15px] leading-relaxed text-text/90 mb-6">
            {t("showcase.intro")}
          </p>
          <figure className="rounded-lg border border-border bg-surface p-6 sm:p-7">
            <figcaption className="mb-5">
              <p className="font-headline-md text-[17px] font-bold text-text">
                {t("showcase.example_name")}{" "}
                <span className="ms-1 align-middle rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-fg-muted">
                  {t("showcase.label")}
                </span>
              </p>
              <p className="text-[14px] text-fg-muted">
                {t("showcase.example_tagline")}
              </p>
            </figcaption>
            <ul className="grid gap-4 sm:grid-cols-2">
              {[
                ["photos", Camera],
                ["story", BookOpen],
                ["verified", SealCheck],
                ["products", Basket],
                ["delivery", Truck],
                ["reviews", ChatCircleText],
              ].map(([key, Icon]) => (
                <li key={key} className="flex items-start gap-3">
                  <Icon
                    size={22}
                    weight="duotone"
                    className="mt-0.5 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-[15px] font-semibold text-text">
                      {t(`showcase.items.${key}.title`)}
                    </p>
                    <p className="text-[14px] leading-relaxed text-text/80">
                      {t(`showcase.items.${key}.desc`)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-6 border-t border-border pt-4 text-[14px] text-fg-muted">
              {t("showcase.nudge")}
            </p>
          </figure>
        </section>

        <footer className="mt-14 sm:mt-16 border-t border-border pt-8">
          {/* MEH-1113: Instagram-DM routing replaced with the form + visible email
              (every inbound path → ContactMessage + notification). Neutral-plural
              voice per ADR-024. Site-wide footer Instagram link is untouched. */}
          <p className="text-base mb-4 text-text/90">
            {t("footer_questions_prefix")}{" "}
            <a
              href="/about?topic=business#contact"
              className="underline text-primary"
            >
              {t("footer_form_link")}
            </a>{" "}
            {t("footer_or_email")}{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="underline text-primary break-all"
              dir="ltr"
            >
              <bdi>{CONTACT_EMAIL}</bdi>
            </a>
          </p>
          <Link
            href="/register/producer"
            className="inline-flex items-center gap-2 font-medium transition hover:opacity-90 bg-primary text-white rounded-sm px-6 py-3 focus-ring"
          >
            {t("cta")}
          </Link>
        </footer>
      </div>
    </section>
  );
}
