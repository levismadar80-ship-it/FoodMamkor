// @ts-check
import DraftPreviewClient from "../../draft-preview/[token]/DraftPreviewClient";
import { generateMetadata as draftPreviewMetadata } from "../../draft-preview/[token]/page";

/**
 * Route:    /v/<code>
 * Purpose:  The SHORT draft-preview link (MEH-3896): mehamakor.co.il/v/<12
 *           characters> instead of /draft-preview/<~250-character JWT>, which
 *           read like phishing in a WhatsApp message. Same page, same client.
 * Touches:  nothing itself — DraftPreviewClient reads GET /producer-preview/<code>.
 * Does NOT: decide anything: the backend resolves the code (services/share_links.py)
 *           and answers the same 404 for an unknown, expired or claim code.
 *           /draft-preview/<jwt> stays for the links sent before MEH-3896.
 */

// Per request, never cached: the HTML carries the code as a prop.
export const dynamic = "force-dynamic";

// The same noindex / no-referrer metadata as /draft-preview.
export const generateMetadata = draftPreviewMetadata;

export default async function ShortDraftPreviewPage({ params }) {
  const { token } = await params;
  return <DraftPreviewClient token={token} />;
}
