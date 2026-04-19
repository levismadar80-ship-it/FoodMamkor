import GroupBuysClient from "./GroupBuysClient";

export const metadata = {
  title: "קבוצות רכש | מהמקור",
  description: "קנו ביחד וחסכו — קבוצות רכש מיצרנים מקומיים בישראל",
  openGraph: {
    title: "קבוצות רכש | מהמקור",
    description: "קנו ביחד וחסכו — קבוצות רכש מיצרנים מקומיים",
    type: "website",
    siteName: "מהמקור",
    locale: "he_IL",
  },
  alternates: { canonical: "/group-buys" },
};

export default function GroupBuysPage() {
  return <GroupBuysClient />;
}
