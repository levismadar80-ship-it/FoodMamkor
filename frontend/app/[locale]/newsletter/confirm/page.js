// @ts-check
import { getTranslations, setRequestLocale } from "next-intl/server";
import ConfirmClient from "./ConfirmClient";

// MEH-3300 (D13): reached only from the confirmation email — keep it out of
// the index (no SEO value, carries a token in the query string).
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "newsletter_confirm" });
  return {
    title: t("meta_title"),
    robots: { index: false, follow: false },
  };
}

export default async function NewsletterConfirmPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const token = typeof sp?.token === "string" ? sp.token : "";
  return <ConfirmClient token={token} />;
}
