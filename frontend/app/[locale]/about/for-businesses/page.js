import { getTranslations, setRequestLocale } from "next-intl/server";
import { BRAND_NAME } from "@/lib/constants";
import { SITE_URL } from "@/lib/seo";
import { buildAlternates, OG_LOCALE } from "@/lib/i18n-seo";

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
    <main className="min-h-screen bg-background text-text">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <header className="mb-10 sm:mb-14">
          <p className="text-xs sm:text-sm mb-3 text-accent tracking-[0.12em] uppercase">
            {t("eyebrow")}
          </p>
          <h1 className="font-headline-lg mb-4 text-primary-dark text-[clamp(28px,6vw,44px)] leading-[1.15] font-black">
            {t("heading")}
          </h1>
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
                      className="group rounded-lg border border-border bg-white transition-colors"
                    >
                      <summary className="cursor-pointer list-none flex items-start justify-between gap-4 px-5 py-4 font-headline-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg text-text text-[17px] font-semibold">
                        <span>{t(`faq.${item.key}.q`)}</span>
                        <span
                          aria-hidden="true"
                          className="shrink-0 transition-transform group-open:rotate-45 text-2xl leading-none text-primary"
                        >
                          +
                        </span>
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

        <footer className="mt-14 sm:mt-16 border-t border-border pt-8">
          <p className="text-base mb-4 text-text/90">
            {t("footer_intro_prefix")}{" "}
            <a
              href="https://www.instagram.com/meha_makor"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-primary"
            >
              @meha_makor
            </a>{" "}
            {t("footer_intro_suffix")}
          </p>
          <a
            href="/register/producer"
            className="inline-flex items-center gap-2 font-medium transition hover:opacity-90 bg-primary text-white rounded-lg px-[22px] py-3"
          >
            {t("cta")}
          </a>
        </footer>
      </div>
    </main>
  );
}
