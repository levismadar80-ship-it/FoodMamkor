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
 * MEH-3079: stop the weekly owner summary email.
 *
 * REUSES: app/[locale]/newsletter/unsubscribe/UnsubscribeClient.jsx — POSTs
 * the signed token on mount (POST, not a server-render GET, so an email
 * client's link prefetcher cannot opt a business out silently). The backend
 * is idempotent, so a second click lands on the same calm success state.
 *
 * States: loading · success · invalid (no token, or the backend's 400/422 —
 * the link itself is bad, retrying cannot help) · retry (429, 5xx, network:
 * the link may be fine, so offer «נסו שוב» — the generic `error.*` keys).
 *
 * The token is dropped from the address bar once read, so it does not stay
 * in history, a shared screenshot or a copied URL (path + locale are kept).
 *
 * @param {{ token: string }} props
 */
export default function UnsubscribeClient({ token }) {
  const t = useTranslations("weekly_summary_unsubscribe");
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
      .post("/weekly-summary/unsubscribe", { token })
      .then(() => alive && setStatus("success"))
      .catch((/** @type {any} */ error) => {
        if (!alive) return;
        setStatus(INVALID_LINK_STATUSES.has(error?.response?.status) ? "invalid" : "retry");
      });
    return () => {
      alive = false;
    };
  }, [token, attempt]);

  if (status === "loading") {
    return (
      <StatusPage>
        <BrandLoader label={t("loading")} className="min-h-0" />
      </StatusPage>
    );
  }
  if (status === "retry") {
    return (
      <StatusPage
        icon={LinkBreak}
        title={tErr("generic")}
        primary={{
          label: tErr("retry"),
          testid: "weekly-unsubscribe-retry",
          onClick: () => {
            setStatus("loading");
            setAttempt((count) => count + 1);
          },
        }}
        secondary={{ href: "/", label: t("cta_home") }}
      />
    );
  }
  const ok = status === "success";
  return (
    <StatusPage
      icon={ok ? "seed" : LinkBreak}
      title={ok ? t("success_title") : t("error_title")}
      body={ok ? t("success_body") : t("error_body")}
      primary={
        ok
          ? { href: "/producer/dashboard/insights", label: t("cta_insights") }
          : { href: "/", label: t("cta_home") }
      }
    />
  );
}
