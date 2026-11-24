// @ts-check
import { getTranslations } from "next-intl/server";

// MEH-3526: shared by /staff-invite and /staff-invite/[token]. Never indexed,
// no alternates, no referrer: on /staff-invite/[token] the path IS the
// credential. REUSES: owner-invite/owner-invite-metadata.js — same reasoning.
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
