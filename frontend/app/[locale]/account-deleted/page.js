// @ts-check
import { getTranslations } from "next-intl/server";
import AccountDeletedClient from "./AccountDeletedClient";

// MEH-3248 (B3): where the browser lands after POST /auth/me/delete. Public
// and outside the auth gate on purpose — /settings redirects a signed-out
// visitor to /login, so a confirmation rendered there never showed. Not for
// search engines: it says nothing to anyone who did not just delete.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account_deleted" });
  return {
    title: t("heading"),
    robots: { index: false, follow: false },
  };
}

export default function AccountDeletedPage() {
  return <AccountDeletedClient />;
}
