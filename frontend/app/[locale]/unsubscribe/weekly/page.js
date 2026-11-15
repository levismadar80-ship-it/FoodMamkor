// @ts-check
import { getTranslations, setRequestLocale } from "next-intl/server";
import UnsubscribeClient from "./UnsubscribeClient";

// MEH-3079: landing for the «להפסקת הסיכום השבועי» link in the weekly owner
// summary email. REUSES: app/[locale]/newsletter/unsubscribe/page.js — a
// utility page reached only from an email, kept out of the index (no SEO
// value, carries a token in the query string).

/** @param {{ params: Promise<{ locale: string }> }} props */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "weekly_summary_unsubscribe" });
  return {
    // MEH-2853: plain title — the layout template `%s | <brand>` adds the brand.
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
export default async function WeeklySummaryUnsubscribePage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const token = typeof sp?.token === "string" ? sp.token : "";
  return <UnsubscribeClient token={token} />;
}
