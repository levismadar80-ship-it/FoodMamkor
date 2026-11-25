// @ts-check
"use client";

/**
 * Module:   StaffInviteClient
 * Purpose:  What someone a business invited to its order team opens from the
 *           email (MEH-3526): sign in with the invited address, tap once,
 *           land on the business's orders tab.
 * Touches:  POST /staff-invites/accept (lib/staff.js). sessionStorage via
 *           lib/claim-token.js.
 * Does NOT: check the address or the link — the server does, and its Hebrew
 *           reason is shown as is. Does not create accounts (/login and
 *           /register do, and send her back here).
 * Related:  app/[locale]/claim/ClaimClient.jsx (same token swap and the same
 *           token-less redirect) · components/dashboard/staff/StaffCard.jsx.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { LinkBreak, UsersThree } from "@phosphor-icons/react";
import { getPathname, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth-context";
import { detailToMessage } from "@/lib/errors";
import { acceptStaffInvite } from "@/lib/staff";
import { clearStaffInviteToken, readStaffInviteToken, stashStaffInviteToken } from "@/lib/claim-token";
import StatusPage from "@/components/StatusPage";
import BrandLoader from "@/components/BrandLoader";
import InlineMessage from "@/components/ui/InlineMessage";

const ORDERS = "/producer/dashboard/orders";

const noSubscription = () => () => {};

/**
 * The token: moved out of the address on first load, then read from the tab.
 * `undefined` on the server (nothing to read yet). If storage refused it, the
 * one in the path is used — signing in on the way then loses it, so that case
 * only works for someone already signed in.
 */
function useInviteToken(tokenFromPath) {
  const router = useRouter();
  const routerRef = useRef(router);
  const token = useSyncExternalStore(
    noSubscription,
    () => readStaffInviteToken() ?? tokenFromPath ?? null,
    () => undefined,
  );
  useEffect(() => {
    if (tokenFromPath && stashStaffInviteToken(tokenFromPath)) routerRef.current.replace("/staff-invite");
  }, [tokenFromPath]);
  return token;
}

/** @param {{ tokenFromPath?: string | null }} props */
export default function StaffInviteClient({ tokenFromPath = null }) {
  const t = useTranslations("staff_invite");
  const tA11y = useTranslations("a11y");
  const tNav = useTranslations("nav");
  const locale = useLocale();
  const router = useRouter();
  const { user, loading, refreshUser } = useAuth();
  const token = useInviteToken(tokenFromPath);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));

  if (token === undefined || loading) return <BrandLoader label={tA11y("loading")} testId="staff-invite-loading" />;
  if (!token) {
    return <StatusPage testid="staff-invite-invalid" icon={LinkBreak} title={t("invalid_title")} body={t("invalid_body")} />;
  }

  // Back to the token-less address after signing in (ClaimClient.jsx:145-149).
  const backHere = encodeURIComponent(getPathname({ href: "/staff-invite", locale }));
  if (!user) {
    return (
      <StatusPage
        testid="staff-invite-guest"
        icon={UsersThree}
        title={t("title")}
        body={`${t("intro")} ${t("guest")}`}
        primary={{ label: tNav("login"), href: `/login?redirect=${backHere}`, testid: "staff-invite-login" }}
        secondary={{ label: t("register"), href: `/register?redirect=${backHere}`, testid: "staff-invite-register" }}
      />
    );
  }

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await acceptStaffInvite(token);
      clearStaffInviteToken();
      await refreshUser();
      router.replace(ORDERS);
    } catch (err) {
      setError(detailToMessage(/** @type {any} */ (err)?.response?.data?.detail) || t("error"));
      setBusy(false);
    }
  };

  return (
    <StatusPage
      testid="staff-invite-signed-in"
      icon={UsersThree}
      title={t("title")}
      body={t("intro")}
      primary={{ label: t("accept"), onClick: busy ? undefined : accept, testid: "staff-invite-accept" }}
    >
      {error && (
        <div className="mt-4" data-testid="staff-invite-error">
          <InlineMessage tone="error">{error}</InlineMessage>
        </div>
      )}
    </StatusPage>
  );
}
