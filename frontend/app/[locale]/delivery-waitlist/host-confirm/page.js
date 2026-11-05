import { getTranslations, setRequestLocale } from "next-intl/server";
import HostConfirmClient from "./HostConfirmClient";

// MEH-2674: utility page reached only from the «אישור: נקודת מסירה» email
// link (MEH-2673). Same shape as ../unsubscribe: out of the index, token in
// the query string, POSTed from the client so a prefetching GET cannot
// confirm on her behalf.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "delivery_waitlist_host_confirm",
  });
  return {
    title: { absolute: t("meta_title") },
    robots: { index: false, follow: false },
  };
}

export default async function DeliveryWaitlistHostConfirmPage({
  params,
  searchParams,
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const token = typeof sp?.token === "string" ? sp.token : "";
  return <HostConfirmClient token={token} />;
}
