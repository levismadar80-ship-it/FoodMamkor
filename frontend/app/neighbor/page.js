import NeighborClient from "./NeighborClient";

export const metadata = {
  title: "מהמטבח של השכן",
  description:
    "מוצרים ביתיים מהשכנות שלך — ישירות מהמטבח. לחם מחמצת, מותססים, מאפים, סבונים ועוד. סנני לפי עיר וגלי מה יש אצלך ברובע.",
  openGraph: {
    title: "מהמטבח של השכן | מהמקור",
    description:
      "מוצרים ביתיים מהשכנות שלך — ישירות מהמטבח.",
    type: "website",
  },
  alternates: { canonical: "/neighbor" },
};

export default function NeighborPage() {
  return <NeighborClient />;
}
