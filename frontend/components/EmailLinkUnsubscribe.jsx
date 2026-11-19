// @ts-check
"use client";

import { useEffect, useState } from "react";
import { LinkBreak } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import StatusPage from "@/components/StatusPage";
import api from "@/lib/api";
import BrandLoader from "@/components/BrandLoader";

// The backend's verdict that the TOKEN is bad (400 = refused, 422 = malformed):
// retrying cannot help. Anything else (429, 5xx, network) may pass on retry.
const INVALID_LINK_STATUSES = new Set([400, 422]);

/**
 * Module:   EmailLinkUnsubscribe
 * Purpose:  The one landing for an «unsubscribe» link in an email: newsletter,
 *           delivery waitlist, weekly owner summary. Each page passes a translator
 *           bound to its namespace (a literal, so ClientMessagesScope can see it)
 *           and its endpoint; the behaviour is the same everywhere.
 * Touches:  POST <endpoint> { token } — idempotent on the backend.
 * Does NOT: confirm a sign-up (newsletter/confirm is a button CLICK, never on
 *           mount — ConfirmClient.jsx), or know what list it removes from.
 * Related:  app/[locale]/newsletter/unsubscribe/ · delivery-waitlist/unsubscribe/ ·
 *           unsubscribe/weekly/ (the three callers).
 * History:  MEH-1330 (newsletter) · MEH-2618 (waitlist, a copy) · MEH-3079
 *           (weekly, a copy that added retry + token stripping) · MEH-3464
 *           (one component; the first two gain retry + token stripping).
 *
 * POSTs the signed token on mount — POST, not a server-render GET, so an email
 * client's link prefetcher (which issues GETs) cannot unsubscribe silently. A
 * second click lands on the same calm success state.
 *
 * States: loading · success · invalid (no token, or the backend's 400/422 —
 * the link itself is bad) · retry (429, 5xx, network: the link may be fine, so
 * offer «נסו שוב» — the generic `error.*` keys).
 *
 * The token is dropped from the address bar once read, so it does not stay in
 * history, a shared screenshot or a copied URL (path + locale are kept).
 *
 * @param {{
 *   token: string,
 *   t: (key: string, values?: object) => string,
 *   endpoint: string,
 *   successCta?: { href: string, labelKey: string },
 *   retryTestid?: string,
 * }} props
 */
export default function EmailLinkUnsubscribe({ token, t, endpoint, successCta, retryTestid }) {
  const tErr = useTranslations("error");
  // no token → straight to the invalid state (nothing to unsubscribe).
  const [status, setStatus] = useState(token ? "loading" : "invalid");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("token")) return;
    url.searchParams.delete("token");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, []);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    api
      .post(endpoint, { token })
      .then(() => alive && setStatus("success"))
      .catch((/** @type {any} */ error) => {
        if (!alive) return;
        setStatus(INVALID_LINK_STATUSES.has(error?.response?.status) ? "invalid" : "retry");
      });
    return () => {
      alive = false;
    };
  }, [token, attempt, endpoint]);

  if (status === "loading") {
    // MEH-2599: brand mark inside the same StatusPage frame the verdict
    // renders in, so nothing shifts on resolve.
    return (
      <StatusPage>
        <BrandLoader label={t("loading")} className="min-h-0" />
      </StatusPage>
    );
  }
  const home = { href: "/", label: t("cta_home") };
  if (status === "retry") {
    return (
      <StatusPage
        icon={LinkBreak}
        title={tErr("generic")}
        primary={{
          label: tErr("retry"),
          testid: retryTestid ?? "unsubscribe-retry",
          onClick: () => {
            setStatus("loading");
            setAttempt((count) => count + 1);
          },
        }}
        secondary={home}
      />
    );
  }
  const ok = status === "success";
  return (
    <StatusPage
      icon={ok ? "seed" : LinkBreak}
      title={ok ? t("success_title") : t("error_title")}
      body={ok ? t("success_body") : t("error_body")}
      primary={ok && successCta ? { href: successCta.href, label: t(successCta.labelKey) } : home}
    />
  );
}
