import { getTranslations } from "next-intl/server";
import RouteMessagesProvider from "@/components/i18n/RouteMessagesProvider";
import { registerProducerMessages } from "@/lib/client-messages";
import RegisterProducerClient from "../producer/RegisterProducerClient";

// MEH-2773: the markets / events organizer's own sign-up link (ADR-036). Same
// wizard as /register/producer with kind="organizer" — the route, not a control
// on the business page, chooses the flow. Sapir sends this link to organizers
// directly, so it is not a public landing page: noindex, and no sitemap entry.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo.register_producer" });
  return {
    title: { absolute: t("title") },
    robots: { index: false, follow: false },
  };
}

export default function RegisterOrganizerPage() {
  return (
    <RouteMessagesProvider pick={registerProducerMessages}>
      <RegisterProducerClient kind="organizer" />
    </RouteMessagesProvider>
  );
}
