import OwnerInviteClient from "../OwnerInviteClient";
import { ownerInviteMetadata } from "../owner-invite-metadata";

// MEH-2974: the link the invite email carries
// (producer_owner_invite.py `_invite_url`). The client stashes the token and
// replaces this address with /owner-invite at once.

// Rendered per request, never cached: the HTML carries the token as a prop,
// and the layout's `revalidate` would otherwise let one render sit in the
// cache for an hour, with one entry per random token. Same reason, same
// directive, as claim/[token]/page.js.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  return ownerInviteMetadata(params);
}

export default async function OwnerInviteTokenPage({ params }) {
  const { token } = await params;
  return <OwnerInviteClient tokenFromPath={token} />;
}
