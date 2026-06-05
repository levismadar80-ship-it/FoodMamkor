import RegisterProducerClient from "./RegisterProducerClient";
import { buildAlternates } from "@/lib/i18n-seo";

// MEH-739: server-wrapper pattern (MEH-658 login precedent). The client
// form moved verbatim to RegisterProducerClient.jsx so this page can export
// metadata — previously this route was a client component, so it inherited
// the layout fallback (canonical = root, default title; production-verified
// 2026-06-05). Refs MEH-214 / MEH-476 / MEH-679.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  return {
    // title.absolute prevents the layout brand-suffix template appending.
    title: { absolute: "רישום בית עסק | מהמקור" },
    description:
      "הצטרפו למהמקור — רישום בית עסק מקומי מתחום המזון. כל בית עסק נבחר אישית.",
    alternates: buildAlternates("/register/producer", locale),
  };
}

export default function RegisterProducerPage() {
  return <RegisterProducerClient />;
}
