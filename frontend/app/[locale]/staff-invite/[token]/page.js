// @ts-check
import StaffInviteClient from "../StaffInviteClient";
import { staffInviteMetadata } from "../staff-invite-metadata";

// MEH-3526: the link the invite email carries (producer_staff.py). The client
// stashes the token and replaces this address with /staff-invite at once.
// Rendered per request, never cached: the HTML carries the token as a prop
// (same reason as owner-invite/[token]/page.js).
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  return staffInviteMetadata(params);
}

export default async function StaffInviteTokenPage({ params }) {
  const { token } = await params;
  return <StaffInviteClient tokenFromPath={token} />;
}
