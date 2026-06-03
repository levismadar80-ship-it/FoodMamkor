import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildAlternates } from "@/lib/i18n-seo";
import { CONTACT_EMAIL } from "@/lib/env.client";

// MEH-475 PR-C4b/chunk-3: privacy policy i18n. SECTIONS-array shape
// matches accessibility (chunk 2). Operator section (MEH-630) preserved
// verbatim via dedicated leaf keys; double-geresh ״ + en-dash – + numeric
// IDs intact in translation values.
// MEH-476 PR 3b2: per-page hreflang via buildAlternates.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations("privacy");
  return {
    // title.absolute prevents layout's `%s | ${BRAND_NAME}` template appending.
    title: { absolute: t("meta_title") },
    description: t("meta_description"),
    alternates: buildAlternates("/privacy", locale),
  };
}

// MEH-653: CONTACT_EMAIL imported from lib/env.client (Vercel env var with fallback).
// Operator-block contact uses CONTACT_EMAIL (was noreply@; PII/contact fix, refs MEH-720).

const SECTION_IDS = [
  "operator",
  "who",
  "data",
  "why",
  "third-parties",
  "rights",
  "cookies",
  "retention",
  "minors",
  "changes",
  "contact",
];

const DATA_ITEMS = ["identity", "business", "technical", "location", "cookies", "ugc"];
const WHY_ITEMS = ["service", "analytics", "notifications", "compliance"];
const THIRD_PARTY_ITEMS = ["cloudinary", "google", "anthropic", "twilio", "infra"];
const RIGHTS_ITEMS = ["access", "rectify", "erase", "object", "portability"];

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
            <MailLink email={CONTACT_EMAIL} />
          </p>
        </>
      );
    case "who":
      return t("sections.who.body");
    case "data":
      return (
        <ul className="list-disc ps-6 space-y-2">
          {DATA_ITEMS.map((k) => (
            <li key={k}>
              <strong>{t(`sections.data.items.${k}.label`)}</strong>{" "}
              {t(`sections.data.items.${k}.value`)}
            </li>
          ))}
        </ul>
      );
    case "why":
      return (
        <ul className="list-disc ps-6 space-y-2">
          {WHY_ITEMS.map((k) => (
            <li key={k}>
              <strong>{t(`sections.why.items.${k}.label`)}</strong>{" "}
              {t(`sections.why.items.${k}.value`)}
            </li>
          ))}
        </ul>
      );
    case "third-parties":
      return (
        <>
          <p className="mb-3">{t("sections.third_parties.intro")}</p>
          <ul className="list-disc ps-6 space-y-2">
            {THIRD_PARTY_ITEMS.map((k) => (
              <li key={k}>
                {t.rich(`sections.third_parties.items.${k}`, {
                  b: (chunks) => <strong>{chunks}</strong>,
                })}
              </li>
            ))}
          </ul>
          <p className="mt-3">
            {t.rich("sections.third_parties.outro", {
              b: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
        </>
      );
    case "rights":
      return (
        <>
          <p className="mb-3">
            {t.rich("sections.rights.intro", {
              email: () => <MailLink email={CONTACT_EMAIL} />,
            })}
          </p>
          <ul className="list-disc ps-6 space-y-2">
            {RIGHTS_ITEMS.map((k) => (
              <li key={k}>
                <strong>{t(`sections.rights.items.${k}.label`)}</strong>{" "}
                {t(`sections.rights.items.${k}.value`)}
              </li>
            ))}
          </ul>
          <p className="mt-3">{t("sections.rights.outro")}</p>
        </>
      );
    case "cookies":
      return t("sections.cookies.body");
    case "retention":
      return t("sections.retention.body");
    case "minors":
      return t("sections.minors.body");
    case "changes":
      return t("sections.changes.body");
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
export default async function PrivacyPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "privacy" });
  return (
    <main className="min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="font-headline-display text-5xl font-bold text-text mb-2">
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
              <h2 className="font-headline-md text-2xl font-bold text-text mb-3">
                {t(`sections.${id === "third-parties" ? "third_parties" : id}.title`)}
              </h2>
              <div className="text-text/85 leading-relaxed">
                {renderBody(id, t)}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
