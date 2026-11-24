// @ts-check
import StaffInviteClient from "./StaffInviteClient";
import { staffInviteMetadata } from "./staff-invite-metadata";

// MEH-3526: the token-less address the client swaps to; the token is in this
// tab's sessionStorage (lib/claim-token.js).
export async function generateMetadata({ params }) {
  return staffInviteMetadata(params);
}

export default function StaffInvitePage() {
  return <StaffInviteClient />;
}
