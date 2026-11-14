import { getTranslations } from "next-intl/server";

// MEH-2974: shared by /owner-invite and /owner-invite/[token]. The page is a
// private handover, so it is never indexed and never followed, and it sets no
// alternates of its own — they would print the path, and on
// /owner-invite/[token] the path IS the credential. `referrer: no-referrer`
// stops the token travelling to any origin the page links to or loads from.
// Mirrors claim-metadata.js (MEH-2324) exactly; the reasoning is the same and
// the token here is strictly more powerful.
export async function ownerInviteMetadata(params) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo.owner_invite" });
  return {
    // MEH-2853: plain title — the layout template `%s | <brand>` adds the brand.
    title: t("title"),
    description: t("description"),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}
