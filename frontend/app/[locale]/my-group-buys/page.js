// @ts-check
import { getTranslations } from "next-intl/server";
import MyGroupBuysClient from "./MyGroupBuysClient";
import { buildAlternates } from "@/lib/i18n-seo";

// MEH-3609: server wrapper for metadata (the /my-orders pattern). A signed-in
// page: not indexed.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "my_group_buys" });
  return {
    title: t("title"),
    alternates: buildAlternates("/my-group-buys", locale),
    robots: { index: false, follow: false },
  };
}

export default function MyGroupBuysPage() {
  return <MyGroupBuysClient />;
}
