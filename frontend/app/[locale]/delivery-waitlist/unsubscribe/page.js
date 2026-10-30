import { getTranslations, setRequestLocale } from "next-intl/server";
import UnsubscribeClient from "./UnsubscribeClient";

// MEH-2618: utility page reached only from the «תודיעו לי» email link — same
// shape as /newsletter/unsubscribe (MEH-1330): out of the index, token in the
// query string, POSTed from the client so a prefetching GET cannot act on it.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "delivery_waitlist_unsubscribe",
  });
  return {
    title: { absolute: t("meta_title") },
    robots: { index: false, follow: false },
  };
}

export default async function DeliveryWaitlistUnsubscribePage({
  params,
  searchParams,
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const token = typeof sp?.token === "string" ? sp.token : "";
  return <UnsubscribeClient token={token} />;
}
