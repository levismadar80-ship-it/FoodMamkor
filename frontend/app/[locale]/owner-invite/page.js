import OwnerInviteClient from "./OwnerInviteClient";
import { ownerInviteMetadata } from "./owner-invite-metadata";

// MEH-2974: the owner lands here once /owner-invite/[token] has moved the
// token into sessionStorage. The address never carries it from this point on.
export async function generateMetadata({ params }) {
  return ownerInviteMetadata(params);
}

export default function OwnerInvitePage() {
  return <OwnerInviteClient />;
}
