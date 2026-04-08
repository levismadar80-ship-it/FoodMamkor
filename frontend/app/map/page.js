import MapClient from "./MapClient";

export const metadata = {
  title: "מפת בתי עסק",
  description:
    "מצאי בתי עסק מקומיים לאוכל בריא על המפה. סינון לפי עיר וקטגוריה, לחיצה על כרטיסייה מציגה את המיקום.",
  openGraph: {
    title: "מפת בתי עסק | מהמקור",
    description: "מצאי בתי עסק מקומיים לאוכל בריא על המפה.",
    type: "website",
  },
  alternates: { canonical: "/map" },
};

export default function MapPage() {
  return <MapClient />;
}
