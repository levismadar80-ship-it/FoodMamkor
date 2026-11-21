// @ts-check
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import GoogleAuthButton from "@/components/GoogleAuthButton";
import InlineMessage from "@/components/ui/InlineMessage";
import { env } from "@/lib/env";

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
  const t = useTranslations();
  const [error, setError] = useState("");
  if (!env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) return null;

  return (
    <div className="grid gap-2.5 mb-4" data-testid="login-prompt-google">
      <GoogleAuthButton termsAccepted onSuccess={onSuccess} onError={(msg) => setError(msg)} />
      <p data-testid="login-prompt-oauth-terms" className="text-xs leading-relaxed text-fg-muted">
        {t.rich("auth.login.oauth_terms_google", {
          tos: (chunks) => (
            <Link href="/terms" target="_blank" className="text-primary underline">
              {chunks}
            </Link>
          ),
          privacy: (chunks) => (
            <Link href="/privacy" target="_blank" className="text-primary underline">
              {chunks}
            </Link>
          ),
        })}
      </p>
      {error && <InlineMessage data-testid="login-prompt-oauth-error">{error}</InlineMessage>}
      <div className="relative my-1" aria-hidden="true">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="px-3 bg-surface text-fg-muted">{t("auth.register.consumer.oauth_divider")}</span>
        </div>
      </div>
    </div>
  );
}
