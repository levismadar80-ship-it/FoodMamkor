// @ts-check
import { getTranslations } from "next-intl/server";
import DraftPreviewClient from "./DraftPreviewClient";

/**
 * Route:    /draft-preview/<token>
 * Purpose:  The read-only link an admin sends a business BEFORE its page is
 *           live: the full page we prepared for it, exactly as it will look,
 *           with no account and no sign-in (MEH-3377).
 * Touches:  nothing itself — the client child reads GET /producer-preview/<token>.
 * Does NOT: change what /producer/{id} or /{slug} answer for a draft (still a
 *           real 404 to a stranger, MEH-2101), let the holder do anything (the
 *           token's scope is read-only; taking the page over is /claim), or
 *           fetch on the server — the payload is one unpublished business's,
 *           so it must never sit in a shared cache.
 */

// Per request, never cached: the HTML carries the token as a prop (same
// reason as claim/[token]/page.js).
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo.draft_preview" });
  return {
    title: t("title"),
    description: t("description"),
    // A private link to an unpublished page: never indexed, never followed,
    // and the address (which IS the token) is never sent as a referrer.
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default async function DraftPreviewPage({ params }) {
  const { token } = await params;
  return <DraftPreviewClient token={token} />;
}
