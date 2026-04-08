import MapClient from "./MapClient";

export const metadata = {
  title: "מפת בתי עסק",
  description:
    "מצאי בתי עסק מקומיים לאוכל בריא על המפה. סינון לפי עיר וקטגוריה, לחיצה על כרטיסייה מציגה את המיקום.",
  openGraph: {
    title: "מפת בתי עסק | מהמקור",
    description: "מצאי בתי עסק מקומיים לאוכל בריא על המפה.",
    type: "website",
    siteName: "מהמקור",
    locale: "he_IL",
    // Include the shared OG image — Next.js REPLACES (not merges) the
    // openGraph object when overridden, so we have to re-declare the
    // image here or social previews will have no image.
    images: ["/og-image.jpg"],
  },
  alternates: { canonical: "/map" },
};

export default function MapPage() {
  return <MapClient />;
}
