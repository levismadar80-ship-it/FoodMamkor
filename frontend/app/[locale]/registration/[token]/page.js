import { getTranslations } from "next-intl/server";
import CancelRegistrationClient from "./CancelRegistrationClient";

// MEH-2768: the cancel link in the sign-up confirmation email
// (routers/registrations.py → {frontend_url}/registration/{token}). The token
// is the visitor's only credential, so the page is never indexed, never
// followed, sends no referrer, and prints no alternates (they would carry it).
// Rendered per request so one render never sits in the cache per token.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "registration.cancel" });
  return {
    // MEH-2853: plain title — the layout template `%s | <brand>` adds the brand.
    title: t("page_title"),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default async function CancelRegistrationPage({ params }) {
  const { token } = await params;
  return <CancelRegistrationClient token={token} />;
}
