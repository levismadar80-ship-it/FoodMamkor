import EventsClient from "./EventsClient";

export const metadata = {
  title: "אירועים בחוות ואצל בתי עסק",
  description:
    "סדנאות, סיורים, ימים פתוחים וטעימות אצל בתי עסק מקומיים בישראל. גלי אירועים קרובים לפי עיר, קטגוריה ותאריך.",
  openGraph: {
    title: "אירועים בחוות ואצל בתי עסק | מהמקור",
    description:
      "סדנאות, סיורים, ימים פתוחים וטעימות אצל בתי עסק מקומיים בישראל.",
    type: "website",
    siteName: "מהמקור",
    locale: "he_IL",
    // Next.js replaces openGraph object on override — re-declare image.
    images: ["/og-image.jpg"],
  },
  alternates: { canonical: "/events" },
};

export default function EventsPage() {
  return <EventsClient />;
}
