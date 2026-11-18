// @ts-check
"use client";

import { useEffect, useState } from "react";
import { LinkBreak } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import StatusPage from "@/components/StatusPage";
import api from "@/lib/api";

// The backend's verdict that the link is dead (404) or malformed (422):
// retrying cannot help. Anything else (429, 5xx, network) may pass on retry.
const DEAD_LINK_STATUSES = new Set([404, 422]);

/**
 * Page freshness: the owner confirms her page is still correct.
 *
 * Unlike the weekly unsubscribe page this does NOT post on mount: some mail
 * scanners render pages with JavaScript, and a confirmation nobody pressed
 * would hide exactly the stale page this exists to find. She presses the
 * button. States: ask · sending · done · dead (no token, 404/422) · retry.
 *
 * The token is dropped from the address bar once read (kept in state).
 *
 * @param {{ token: string }} props
 */
export default function ConfirmClient({ token }) {
  const t = useTranslations("page_freshness");
  const tErr = useTranslations("error");
  const [status, setStatus] = useState(token ? "ask" : "dead");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("token")) return;
    url.searchParams.delete("token");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, []);

  const send = () => {
    setStatus("sending");
    api
      .post("/page-freshness/confirm", { token })
      .then(() => setStatus("done"))
      .catch((/** @type {any} */ error) => {
        setStatus(DEAD_LINK_STATUSES.has(error?.response?.status) ? "dead" : "retry");
      });
  };

  const update = { href: "/producer/dashboard", label: t("cta_update"), testid: "freshness-update" };

  if (status === "done") {
    return <StatusPage icon="seed" title={t("done_title")} testid="freshness-done" />;
  }
  if (status === "dead") {
    return (
      <StatusPage icon={LinkBreak} title={t("dead_title")} primary={update} testid="freshness-dead" />
    );
  }
  if (status === "retry") {
    return (
      <StatusPage
        icon={LinkBreak}
        title={tErr("generic")}
        primary={{ label: tErr("retry"), onClick: send, testid: "freshness-retry" }}
        secondary={update}
      />
    );
  }
  return (
    <StatusPage
      icon="seed"
      title={t("ask_title")}
      body={t("ask_body")}
      primary={{
        label: status === "sending" ? t("sending") : t("cta_yes"),
        onClick: status === "sending" ? undefined : send,
        testid: "freshness-yes",
      }}
      secondary={update}
      testid="freshness-ask"
    />
  );
}
