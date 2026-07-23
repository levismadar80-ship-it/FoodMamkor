import { getTranslations, setRequestLocale } from "next-intl/server";
import UnsubscribeClient from "./UnsubscribeClient";

// MEH-1330: utility page reached only from an email link — keep it out of the
// index (no SEO value, carries a token in the query string).
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "newsletter_unsubscribe" });
  return {
    title: { absolute: t("meta_title") },
    robots: { index: false, follow: false },
  };
}

export default async function NewsletterUnsubscribePage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const token = typeof sp?.token === "string" ? sp.token : "";
  return <UnsubscribeClient token={token} />;
}
