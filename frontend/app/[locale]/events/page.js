import { Suspense } from "react";
import EventsClient from "./EventsClient";
import { BRAND_NAME } from "@/lib/constants";
import { buildAlternates } from "@/lib/i18n-seo";

// MEH-739: per-locale hreflang + self canonical via buildAlternates (was a
// hand-built single-canonical entry with no hreflang languages map). Refs MEH-476.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  return {
    title: "אירועים בחוות ואצל בתי עסק",
    description:
      "סדנאות, סיורים, ימים פתוחים וטעימות אצל בתי עסק מקומיים בישראל. גלי אירועים קרובים לפי עיר, קטגוריה ותאריך.",
    openGraph: {
      title: "אירועים בחוות ואצל בתי עסק | מהמקור",
      description:
        "סדנאות, סיורים, ימים פתוחים וטעימות אצל בתי עסק מקומיים בישראל.",
      type: "website",
      siteName: BRAND_NAME,
      locale: "he_IL",
      // Next.js replaces openGraph object on override — re-declare image.
      images: ["/og-image.png"],
    },
    alternates: buildAlternates("/events", locale),
  };
}

// EventsClient uses useSearchParams() to keep the ?tab=experiences
// deep-link in the URL. Next.js 14 requires a Suspense boundary
// around any component that reads search params in the App Router.
export default function EventsPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-5xl mx-auto px-4 py-16 text-center text-fg-muted">
          טוענת אירועים...
        </div>
      }
    >
      <EventsClient />
    </Suspense>
  );
}
