import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildAlternates } from "@/lib/i18n-seo";
import { CONTACT_EMAIL } from "@/lib/env.client";

// MEH-475 PR-C4b/chunk-3: terms of use i18n. SECTIONS-array shape
// matches accessibility + privacy. Operator section (MEH-630) preserved
// verbatim. Double-geresh (התשכ״ח, אביב–יפו en-dash) intact in
// translation values.
// MEH-476 PR 3b2: per-page hreflang via buildAlternates.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations("terms");
  return {
    // title.absolute prevents layout's `%s | ${BRAND_NAME}` template appending.
    title: { absolute: t("meta_title") },
    description: t("meta_description"),
    alternates: buildAlternates("/terms", locale),
  };
}

// MEH-653: CONTACT_EMAIL imported from lib/env.client (Vercel env var with fallback).
const OPERATOR_EMAIL = "noreply@mehamakor.co.il";

const SECTION_IDS = [
  "operator",
  "service",
  "licensing",
  "age",
  "responsibility",
  "verified",
  "report",
  "ip",
  "changes",
  "law",
  "privacy",
  "contact",
];

function MailLink({ email }) {
  return (
    <a
      href={`mailto:${email}`}
      className="text-primary hover:underline"
      dir="ltr"
    >
      {email}
    </a>
  );
}

function renderBody(id, t) {
  switch (id) {
    case "operator":
      return (
        <>
          <p className="mb-3">
            <strong>{t("sections.operator.operator_label")}</strong>{" "}
            {t("sections.operator.operator_value")}
          </p>
          <p className="mb-3">
            <strong>{t("sections.operator.trade_label")}</strong>{" "}
            {t("sections.operator.trade_value")}
          </p>
          <p>
            <strong>{t("sections.operator.contact_label")}</strong>{" "}
            <MailLink email={OPERATOR_EMAIL} />
          </p>
        </>
      );
    case "service":
      return t.rich("sections.service.body", {
        b: (chunks) => <strong>{chunks}</strong>,
      });
    case "licensing":
      return (
        <>
          <p className="mb-3">
            {t.rich("sections.licensing.intro", {
              b: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
          <p>
            {t.rich("sections.licensing.outro", {
              b: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
        </>
      );
    case "age":
      return t.rich("sections.age.body", {
        b: (chunks) => <strong>{chunks}</strong>,
      });
    case "responsibility":
      return t("sections.responsibility.body");
    case "verified":
      return t.rich("sections.verified.body", {
        b: (chunks) => <strong>{chunks}</strong>,
      });
    case "report":
      return (
        <>
          <p className="mb-3">{t("sections.report.intro")}</p>
          <ul className="list-disc ps-6 space-y-2">
            <li>{t("sections.report.item_button")}</li>
            <li>
              {t.rich("sections.report.item_email", {
                email: () => <MailLink email={CONTACT_EMAIL} />,
              })}
            </li>
            <li>
              {t.rich("sections.report.item_form", {
                contactlink: (chunks) => (
                  <a href="/contact" className="text-primary hover:underline">
                    {chunks}
                  </a>
                ),
              })}
            </li>
          </ul>
          <p className="mt-3">
            {t.rich("sections.report.outro", {
              b: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
        </>
      );
    case "ip":
      return t("sections.ip.body");
    case "changes":
      return t("sections.changes.body");
    case "law":
      return t.rich("sections.law.body", {
        b: (chunks) => <strong>{chunks}</strong>,
      });
    case "privacy":
      return t.rich("sections.privacy.body", {
        privacylink: (chunks) => (
          <a href="/privacy" className="text-primary hover:underline">
            {chunks}
          </a>
        ),
      });
    case "contact":
      return (
        <>
          {t("sections.contact.intro")}
          <br />
          📧 <MailLink email={CONTACT_EMAIL} />
        </>
      );
    default:
      return null;
  }
}

// MEH-476 PR 3b2: async + setRequestLocale + getTranslations enables ● SSG.
export default async function TermsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "terms" });
  return (
    <main className="min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="font-headline text-5xl font-bold text-site-text mb-2">
          {t("heading")}
        </h1>
        <p className="text-fg-muted mb-12">{t("date_label")}</p>

        <div className="space-y-4">
          {SECTION_IDS.map((id) => (
            <section
              key={id}
              id={id}
              className="bg-white rounded-[16px] p-7 border border-border shadow-[0_2px_12px_rgba(46,104,83,0.04)]"
            >
              <h2 className="font-headline text-2xl font-bold text-site-text mb-3">
                {t(`sections.${id}.title`)}
              </h2>
              <div className="text-site-text/85 leading-relaxed">
                {renderBody(id, t)}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
