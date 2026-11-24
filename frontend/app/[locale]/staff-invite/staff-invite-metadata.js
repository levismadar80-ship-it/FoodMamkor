// @ts-check
/**
 * Module:   staff-invite-metadata
 * Purpose:  Page metadata for the order-staff invite page: never indexed, no
 *           alternates, no referrer, because on /staff-invite/[token] the path
 *           IS the credential.
 * History:  MEH-3526 (creation). REUSES: owner-invite/owner-invite-metadata.js.
 */
import { getTranslations } from "next-intl/server";

export async function staffInviteMetadata(params) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo.staff_invite" });
  const tPage = await getTranslations({ locale, namespace: "staff_invite" });
  return {
    // The page's own heading; a second key with the same words would be a copy.
    title: tPage("title"),
    description: t("description"),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}
