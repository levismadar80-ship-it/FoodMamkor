// @ts-check
import { getTranslations } from "next-intl/server";
import MyOrdersClient from "./MyOrdersClient";
import { buildAlternates } from "@/lib/i18n-seo";

// MEH-3525: server wrapper for metadata (the favorites pattern). A signed-in
// page: not indexed.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "my_orders" });
  return {
    title: t("title"),
    alternates: buildAlternates("/my-orders", locale),
    robots: { index: false, follow: false },
  };
}

export default function MyOrdersPage() {
  return <MyOrdersClient />;
}
