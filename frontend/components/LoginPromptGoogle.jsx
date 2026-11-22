// @ts-check
"use client";

import { useState } from "react";
import GoogleAuthButton from "@/components/GoogleAuthButton";
import InlineMessage from "@/components/ui/InlineMessage";
import { env } from "@/lib/env";
import { OAuthTermsLine, OrDivider } from "@/components/OAuthTermsLine";

/**
 * Module:   LoginPromptGoogle
 * Purpose:  Sign in with Google from inside LoginPromptModal, so a guest who
 *           tapped «שמירה» / «עדכונים» / a star stays on the page (MEH-3661).
 * Does NOT: finish the guest's action — the button that opened the modal
 *           does that from lib/pending-action once `user` is set; or offer
 *           Apple (its flow is not checked inside a modal; /login has it).
 * Related:  app/[locale]/register/RegisterClient.jsx (same button + the same
 *           locked consent line, auth.login.oauth_terms_google, single owner);
 *           components/GoogleAuthButton.jsx.
 * History:  MEH-3661 (creation).
 *
 * @param {{ onSuccess: () => void }} props
 */
export default function LoginPromptGoogle({ onSuccess }) {
  const [error, setError] = useState("");
  if (!env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) return null;

  return (
    <div className="grid gap-2.5 mb-4" data-testid="login-prompt-google">
      <GoogleAuthButton termsAccepted onSuccess={onSuccess} onError={(msg) => setError(msg)} />
      <OAuthTermsLine
        termsKey="oauth_terms_google"
        testId="login-prompt-oauth-terms"
        className="text-xs leading-relaxed text-fg-muted"
      />
      {error && <InlineMessage data-testid="login-prompt-oauth-error">{error}</InlineMessage>}
      <OrDivider className="my-1" labelClassName="bg-surface" />
    </div>
  );
}
