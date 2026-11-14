// @ts-check
"use client";

import { useEffect, useState } from "react";
import { LinkBreak } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import StatusPage from "@/components/StatusPage";
import api from "@/lib/api";
import BrandLoader from "@/components/BrandLoader";

/**
 * MEH-3079: stop the weekly owner summary email.
 *
 * REUSES: app/[locale]/newsletter/unsubscribe/UnsubscribeClient.jsx — POSTs
 * the signed token on mount (POST, not a server-render GET, so an email
 * client's link prefetcher cannot opt a business out silently). The backend
 * is idempotent, so a second click lands on the same calm success state; an
 * invalid token shows a gentle error, never a stack trace.
 *
 * @param {{ token: string }} props
 */
export default function UnsubscribeClient({ token }) {
  const t = useTranslations("weekly_summary_unsubscribe");
  // no token → straight to the error state (nothing to unsubscribe).
  const [status, setStatus] = useState(token ? "loading" : "error");

  useEffect(() => {
    if (!token) return;
    let alive = true;
    api
      .post("/weekly-summary/unsubscribe", { token })
      .then(() => alive && setStatus("success"))
      .catch(() => alive && setStatus("error"));
    return () => {
      alive = false;
    };
  }, [token]);

  if (status === "loading") {
    return (
      <StatusPage>
        <BrandLoader label={t("loading")} className="min-h-0" />
      </StatusPage>
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
