// @ts-check
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Envelope } from "@phosphor-icons/react/ssr";
import { CONTACT_EMAIL } from "@/lib/env.client";
import LegalPage from "@/components/legal/LegalPage";
import { buildLegalPageMetadata } from "@/lib/legal-page-metadata";
import CookieSettingsButton from "@/components/CookieSettingsButton";

// MEH-475 PR-C4b/chunk-3: privacy policy i18n. SECTIONS-array shape
// matches accessibility (chunk 2). Operator section (MEH-630) preserved
// verbatim via dedicated leaf keys; double-geresh ״ + en-dash – + numeric
// IDs intact in translation values.
// MEH-476 PR 3b2: per-page hreflang via buildAlternates.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  return buildLegalPageMetadata(locale, { namespace: "privacy", path: "/privacy" });
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

// MEH-2777: `registrations` is the on-site event / workshop sign-up
// (RegistrationCta.jsx). It is the one collection point whose data leaves us
// for a third party the visitor chose — the business hosting the date — so it
// gets its own line rather than hiding inside `identity`.
// MEH-3299 (MEH-2208 option א): `outreach` = the leads list — contact details
// of businesses that have not joined, taken from public sources for outreach.
const DATA_ITEMS = ["identity", "business", "outreach", "technical", "location", "cookies", "ugc", "registrations"];
const WHY_ITEMS = ["service", "analytics", "notifications", "compliance"];
// MEH-1058 (Amendment 13 disclosure duty): full live sub-processor list —
// twilio was STALE (WhatsApp ships via Meta Cloud API, services/whatsapp.py);
// added resend (email.py), sentry (lib/api.js), clarity (ClarityScript.jsx,
// consent-gated). Keep 1:1 with what actually runs.
// MEH-1981: `posthog` added after an Amendment-13 collection-point audit found
// it was the one processor wired in code (`lib/analytics.js:10`) but absent
// from this list. An enumeration that names eight and omits a live ninth is
// worse than a general statement, because it presents itself as complete.
const THIRD_PARTY_ITEMS = ["cloudinary", "google", "osm", "anthropic", "meta", "resend", "sentry", "clarity", "posthog", "infra"];
const RIGHTS_ITEMS = ["access", "rectify", "erase", "object", "portability"];

function MailLink({ email }) {
  return (
    <a
      href={`mailto:${email}`}
      className="text-primary underline break-all"
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
        <>
          <ul className="list-disc ps-6 space-y-2">
            {DATA_ITEMS.map((k) => (
              <li key={k}>
                <strong>{t(`sections.data.items.${k}.label`)}</strong>{" "}
                {t(`sections.data.items.${k}.value`)}
              </li>
            ))}
          </ul>
          {/* MEH-1058: Amendment-13 disclosure duty — voluntary provision +
              consequence of refusal. */}
          <p className="mt-3">{t("sections.data.voluntary")}</p>
        </>
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
          {/* MEH-3196: transfers abroad (Privacy Protection Regulations,
              transfer of data abroad, 2001) — the providers above. */}
          <p className="mt-3">{t("sections.third_parties.transfer")}</p>
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
      // MEH-3196: the withdrawal control also lives here, so it is reachable
      // from routes without the site footer (/map, the dashboards).
      return (
        <>
          <p>{t("sections.cookies.body")}</p>
          <CookieSettingsButton
            testId="privacy-cookie-settings"
            variant="outlined"
            className="mt-3"
          />
        </>
      );
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
          <Envelope size={16} className="inline align-[-2px] text-primary" aria-hidden="true" /> <MailLink email={CONTACT_EMAIL} />
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
    <LegalPage
      testId="privacy-page"
      heading={t("heading")}
      dateLines={[t("date_label")]}
      sections={SECTION_IDS.map((x) => ({
        id: x,
        title: t(`sections.${x === "third-parties" ? "third_parties" : x}.title`),
        body: renderBody(x, t),
      }))}
    />
  );
}
