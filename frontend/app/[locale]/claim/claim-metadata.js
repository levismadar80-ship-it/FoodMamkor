import { getTranslations } from "next-intl/server";

// MEH-2324: shared by /claim and /claim/[token]. The page is a private
// invitation, so it is never indexed and never followed. It sets no alternates
// of its own, because they would print the path, and on /claim/[token] the
// path is the credential. The layout's (the home page) are inherited, which is
// harmless on a noindex page.
export async function claimMetadata(params) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo.claim" });
  return {
    title: { absolute: t("title") },
    description: t("description"),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}
