// @ts-check
import { getTranslations, setRequestLocale } from "next-intl/server";
import ConfirmClient from "./ConfirmClient";

// Page freshness: landing for the «כן, הכול נכון» link in the monthly owner
// email. REUSES: app/[locale]/unsubscribe/weekly/page.js — a utility page
// reached only from an email, kept out of the index (it carries a token).

/** @param {{ params: Promise<{ locale: string }> }} props */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "page_freshness" });
  return {
    title: t("meta_title"),
    robots: { index: false, follow: false },
  };
}

/**
 * @param {{
 *   params: Promise<{ locale: string }>,
 *   searchParams: Promise<Record<string, string | string[] | undefined>>,
 * }} props
 */
export default async function PageFreshnessConfirmPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const token = typeof sp?.token === "string" ? sp.token : "";
  return <ConfirmClient token={token} />;
}
