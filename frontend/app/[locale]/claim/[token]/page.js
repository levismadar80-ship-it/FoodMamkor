import ClaimClient from "../ClaimClient";
import { claimMetadata } from "../claim-metadata";

// MEH-2324: the link the admin sends (producer_claim.py create_claim_link).
// The client stashes the token and replaces this address with /claim at once.
export async function generateMetadata({ params }) {
  return claimMetadata(params);
}

export default async function ClaimTokenPage({ params }) {
  const { token } = await params;
  return <ClaimClient tokenFromPath={token} />;
}
