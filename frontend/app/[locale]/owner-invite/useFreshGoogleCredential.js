// @ts-check
"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Module:   useFreshGoogleCredential
 * Purpose:  Hold the Google credential from a sign-in made on the owner-invite
 *           page, for the existing-account form to send instead of an email
 *           code (MEH-3675).
 * Does NOT: decide whether it still counts — the server takes it only while it
 *           is ≤ 5 minutes old and of this account's Google identity
 *           (backend/app/services/owner_invite_google.py).
 * History:  MEH-3675 (creation).
 *
 * The credential belongs to whoever was signed in when it arrived. Signing
 * out, or another account's session appearing in the same tab, drops it, so
 * it is never sent on behalf of a different account.
 *
 * @param {string|null|undefined} userId the signed-in account's id
 * @returns {[string|null, (credential: string|null) => void]}
 */
export default function useFreshGoogleCredential(userId) {
  const [credential, setCredential] = useState(
    /** @type {string|null} */ (null),
  );
  const lastUser = useRef(userId ?? null);
  useEffect(() => {
    const previous = lastUser.current;
    lastUser.current = userId ?? null;
    // Signed out → in (the Google sign-in itself) keeps it; any other change
    // of account, including signing out, drops it.
    if (previous !== null && previous !== (userId ?? null)) setCredential(null);
  }, [userId]);
  return [credential, setCredential];
}
