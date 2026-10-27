import ClaimClient from "./ClaimClient";
import { claimMetadata } from "./claim-metadata";

// MEH-2324: the owner lands here after /claim/[token] has moved the token into
// sessionStorage, and comes back here from /login and /register. The address
// never carries the token from this point on.
export async function generateMetadata({ params }) {
  return claimMetadata(params);
}

export default function ClaimPage() {
  return <ClaimClient />;
}
