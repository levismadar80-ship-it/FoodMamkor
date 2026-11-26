// @ts-check
import ClaimClient from "../../claim/ClaimClient";
import { claimMetadata } from "../../claim/claim-metadata";

/**
 * Route:    /c/<code>
 * Purpose:  The SHORT owner-claim link (MEH-3896): mehamakor.co.il/c/<12
 *           characters> instead of /claim/<JWT>. Same flow as claim/[token]:
 *           ClaimClient stashes the code in this tab and swaps the address to
 *           /claim at once, so login, register and analytics never carry it.
 * Does NOT: resolve the code — the backend does (services/share_links.py).
 *           /claim/<jwt> stays for the links sent before MEH-3896.
 */

// Per request, never cached: the HTML carries the code as a prop.
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }) {
  return claimMetadata(params);
}

export default async function ShortClaimPage({ params }) {
  const { token } = await params;
  return <ClaimClient tokenFromPath={token} />;
}
