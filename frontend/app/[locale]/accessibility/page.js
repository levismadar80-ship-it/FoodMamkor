import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildAlternates, urlForLocalePath, OG_LOCALE } from "@/lib/i18n-seo";
import { BRAND_NAME } from "@/lib/constants";
import { CONTACT_EMAIL } from "@/lib/env.client";

// MEH-475 PR-C4b/chunk-2: accessibility statement i18n. Same pattern as
// PR #736 (getTranslations in generateMetadata + namespace-scoped t())
// extended with t.rich() for bodies that embed <strong>/<a> markup.
// MEH-476 PR 3b2: per-page hreflang via buildAlternates.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "accessibility" });
  return {
    // title.absolute prevents the layout's `%s | ${BRAND_NAME}` template
    // from appending — the meta_title keys already include the brand suffix.
    title: { absolute: t("meta_title") },
    description: t("meta_description"),
    // MEH-740: per-page openGraph + self og:url (was inheriting layout root).
    openGraph: {
      title: t("meta_title"),
      description: t("meta_description"),
      type: "website",
      url: urlForLocalePath("/accessibility", locale),
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
      images: ["/og-image.png"],
    },
    alternates: buildAlternates("/accessibility", locale),
  };
}

const FEATURE_KEYS = [
  "rtl",
  "contrast",
  "alt",
  "keyboard",
  "labels",
  "fonts",
  "semantic",
];

const SECTIONS = [
  {
    id: "commitment",
    renderBody: (t) =>
      t.rich("sections.commitment.body", {
        law: (chunks) => <strong>{chunks}</strong>,
      }),
  },
  {
    id: "standard",
    renderBody: (t) =>
      t.rich("sections.standard.body", {
        standard: (chunks) => <strong>{chunks}</strong>,
        wcag: (chunks) => (
          <a
            href="https://www.w3.org/WAI/WCAG21/quickref/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
            dir="ltr"
          >
            {chunks}
          </a>
        ),
      }),
  },
  {
    id: "features",
    renderBody: (t) => (
      <ul className="list-disc ps-6 space-y-2">
        {FEATURE_KEYS.map((k) => (
          <li key={k}>{t(`sections.features.item_${k}`)}</li>
        ))}
      </ul>
    ),
  },
  {
    id: "gaps",
    renderBody: (t) => t("sections.gaps.body"),
  },
  {
    id: "contact",
    renderBody: (t) => (
      <>
        {t("sections.contact.intro")}
        <br />
        <strong>{t("sections.contact.coordinator_label")}</strong>{" "}
        {t("sections.contact.coordinator_value")}
        <br />
        📧{" "}
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="text-primary hover:underline break-all"
          dir="ltr"
        >
          {CONTACT_EMAIL}
        </a>
        <br />
        📞 {t("sections.contact.phone_placeholder")}
        <br />
        <span className="text-sm text-fg-muted">
          {t("sections.contact.footnote")}
        </span>
      </>
    ),
  },
  {
    id: "authority",
    renderBody: (t) =>
      t.rich("sections.authority.body", {
        link: (chunks) => (
          <a
            href="https://www.gov.il/he/departments/accessibility"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            {chunks}
          </a>
        ),
      }),
  },
];

// MEH-476 PR 3b2: setRequestLocale + getTranslations (async variant) enables
// static rendering with next-intl per official docs. Previously this page
// used useTranslations (sync hook) which forced ƒ Dynamic at the layout level.
export default async function AccessibilityPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "accessibility" });
  return (
    <section className="min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="font-headline-display text-5xl font-bold text-text mb-2">
          {t("heading")}
        </h1>
        <p className="text-fg-muted mb-12">{t("date_label")}</p>

        <div className="space-y-4">
          {SECTIONS.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="bg-white rounded-[16px] p-7 border border-border shadow-[0_2px_12px_rgba(46,104,83,0.04)]"
            >
              <h2 className="font-headline-md text-2xl font-bold text-text mb-3">
                {t(`sections.${section.id}.title`)}
              </h2>
              <div className="text-text/85 leading-relaxed">
                {section.renderBody(t)}
              </div>
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}
