// @ts-check
"use client";

/**
 * Module:   AuthUnreachableState
 * Purpose:  What a signed-in area (/admin, /producer/dashboard) shows when a
 *           token is stored but /auth/me never answered: a network error with
 *           a retry, in place. Not a redirect to /login.
 * Does NOT: decide anything. lib/auth-context.js sets `authUnreachable` (only
 *           on a failure that is not a 401/403) and owns `retrySession`.
 * Why:      before MEH-3172 both layouts read `!loading && !user` as "signed
 *           out" and pushed /login, so a logged-in admin whose /auth/me was cut
 *           off (a 502, a Railway redeploy, a request aborted by a navigation)
 *           landed on the login page. The copy is the site's existing network
 *           error and retry strings, unchanged.
 * Related:  app/[locale]/admin/AdminLayoutClient.jsx ·
 *           app/[locale]/producer/dashboard/DashboardLayoutClient.jsx
 * History:  MEH-3172 (creation)
 */
import { WifiSlash } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import EmptyState from "@/components/ui/EmptyState";
import { useAuth } from "@/lib/auth-context";

// EmptyState is not @ts-check'd: its destructured props read as required.
const Empty = /** @type {any} */ (EmptyState);

/** @param {{ className?: string }} props */
export default function AuthUnreachableState({ className = "max-w-3xl mx-auto px-4" }) {
  const t = useTranslations("error");
  const { retrySession } = useAuth();
  return (
    <div data-testid="auth-unreachable" className={className}>
      <Empty
        icon={WifiSlash}
        title={t("mapper.network")}
        ctaLabel={t("retry")}
        ctaOnClick={retrySession}
      />
    </div>
  );
}
