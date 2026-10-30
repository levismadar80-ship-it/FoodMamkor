"use client";

import { useEffect, useState } from "react";
import { LinkBreak, Leaf } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import StatusPage from "@/components/StatusPage";
import api from "@/lib/api";
import BrandLoader from "@/components/BrandLoader";

/**
 * MEH-2618: one-click removal from a business's delivery waitlist.
 *
 * Mirrors newsletter/unsubscribe/UnsubscribeClient.jsx (MEH-1330): POST the
 * signed token on mount, idempotent backend, calm success, gentle error.
 */
export default function UnsubscribeClient({ token }) {
  const t = useTranslations("delivery_waitlist_unsubscribe");
  const [status, setStatus] = useState(token ? "loading" : "error");

  useEffect(() => {
    if (!token) return;
    let alive = true;
    api
      .post("/delivery-waitlist/unsubscribe", { token })
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
      icon={ok ? Leaf : LinkBreak}
      title={ok ? t("success_title") : t("error_title")}
      body={ok ? t("success_body") : t("error_body")}
      primary={{ href: "/", label: t("cta_home") }}
    />
  );
}
