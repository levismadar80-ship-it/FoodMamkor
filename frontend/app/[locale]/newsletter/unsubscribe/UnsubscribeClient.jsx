"use client";

import { useEffect, useState } from "react";
import { EnvelopeSimple, LinkBreak, Leaf } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import StatusPage from "@/components/StatusPage";
import api from "@/lib/api";

/**
 * MEH-1330: one-click newsletter unsubscribe landing.
 *
 * POSTs the signed token (from the email link) on mount — POST, not a
 * server-render GET, so email-client link prefetchers (which issue GETs)
 * can't unsubscribe silently. The backend is idempotent, so a second click
 * still lands on the calm success state; an invalid/expired token → a gentle
 * error, never a stack trace.
 */
export default function UnsubscribeClient({ token }) {
  const t = useTranslations("newsletter_unsubscribe");
  // idle token → straight to the error state (nothing to unsubscribe).
  const [status, setStatus] = useState(token ? "loading" : "error");

  useEffect(() => {
    if (!token) return;
    let alive = true;
    api
      .post("/newsletter/unsubscribe", { token })
      .then(() => alive && setStatus("success"))
      .catch(() => alive && setStatus("error"));
    return () => {
      alive = false;
    };
  }, [token]);

  // MEH-2567: shared StatusPage layout; copy unchanged.
  if (status === "loading") {
    return <StatusPage icon={EnvelopeSimple} body={t("loading")} bodyRole="status" />;
  }
  const ok = status === "success";
  return (
    <StatusPage
      icon={ok ? Leaf : LinkBreak}
      title={ok ? t("success_title") : t("error_title")}
      body={ok ? t("success_body") : t("error_body")}
      primary={{ href: "/", label: t("cta_home") }}
    />
  );
}
