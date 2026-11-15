// @ts-check
"use client";

import { useEffect, useState } from "react";
import { LinkBreak } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import StatusPage from "@/components/StatusPage";
import api from "@/lib/api";

// The backend's verdict that the TOKEN is bad (400 = refused or expired,
// 422 = malformed): retrying cannot help. 429 / 5xx / network may pass on retry.
const INVALID_LINK_STATUSES = new Set([400, 422]);

/**
 * MEH-3300 (D13): newsletter double opt-in landing.
 *
 * REUSES: app/[locale]/unsubscribe/weekly/UnsubscribeClient.jsx (states,
 * retry, token dropped from the address bar). One difference on purpose:
 * confirmation is a POST sent from a button CLICK, never on mount. Mail
 * scanners and link prefetchers open the URL, and an open must not sign
 * anyone up. The backend is idempotent, so a second click is still success.
 *
 * States: idle (button) · sending · success · invalid · retry.
 *
 * @param {{ token: string }} props
 */
export default function ConfirmClient({ token }) {
  const t = useTranslations("newsletter_confirm");
  const tu = useTranslations("newsletter_unsubscribe");
  const tErr = useTranslations("error");
  const [status, setStatus] = useState(token ? "idle" : "invalid");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("token")) return;
    url.searchParams.delete("token");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, []);

  const confirm = () => {
    setStatus("sending");
    api
      .post("/newsletter/confirm", { token })
      .then(() => setStatus("success"))
      .catch((/** @type {any} */ error) => {
        setStatus(INVALID_LINK_STATUSES.has(error?.response?.status) ? "invalid" : "retry");
      });
  };

  if (status === "success") {
    return (
      <StatusPage
        icon="seed"
        title={t("success_title")}
        body={t("success_body")}
        primary={{ href: "/", label: tu("cta_home") }}
        testid="newsletter-confirm-success"
      />
    );
  }
  if (status === "invalid") {
    return (
      <StatusPage
        icon={LinkBreak}
        title={tu("error_title")}
        body={tu("error_body")}
        primary={{ href: "/", label: tu("cta_home") }}
        testid="newsletter-confirm-invalid"
      />
    );
  }
  if (status === "retry") {
    return (
      <StatusPage
        icon={LinkBreak}
        title={tErr("generic")}
        primary={{ label: tErr("retry"), onClick: confirm, testid: "newsletter-confirm-retry" }}
        secondary={{ href: "/", label: tu("cta_home") }}
        testid="newsletter-confirm-retry-page"
      />
    );
  }
  return (
    <StatusPage
      icon="seed"
      title={t("title")}
      primary={{
        label: t("button"),
        // A double tap while the request is in flight sends nothing more.
        onClick: status === "sending" ? () => {} : confirm,
        testid: "newsletter-confirm-button",
      }}
      testid="newsletter-confirm"
    />
  );
}
