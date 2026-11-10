"use client";

import { useEffect, useState } from "react";
import { EnvelopeSimple, LinkBreak } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import StatusPage from "@/components/StatusPage";
import api from "@/lib/api";
import BrandLoader from "@/components/BrandLoader";

/**
 * MEH-2674: «מאשרים, אפשר להעביר» — the click that turns a waitlist row
 * into a confirmed pickup host (server: POST /delivery-waitlist/host-confirm,
 * MEH-2673). Mirrors ../unsubscribe/UnsubscribeClient.jsx.
 *
 * Four end states, one line each (copy approved 05/11):
 *   200          → success with the business name
 *   410 resent   → the link expired, a fresh one was just mailed
 *   410 !resent  → the link expired, a newer one is already in her inbox
 *   anything else→ invalid / unsubscribed (400) or network
 * The 410 body is validated before `resent` is trusted (rule 19); a body we
 * do not recognise reads as "not resent", the line that promises nothing.
 */
const SuccessSchema = z.object({ producer_name: z.string() });
const GoneSchema = z.object({ resent: z.boolean().optional() });

export default function HostConfirmClient({ token }) {
  const t = useTranslations("delivery_waitlist_host_confirm");
  const [state, setState] = useState(() =>
    token ? { kind: "loading" } : { kind: "error" },
  );

  useEffect(() => {
    if (!token) return;
    let alive = true;
    api
      .post("/delivery-waitlist/host-confirm", { token })
      .then((r) => {
        if (!alive) return;
        const ok = SuccessSchema.safeParse(r.data);
        setState(
          ok.success
            ? { kind: "success", producer: ok.data.producer_name }
            : { kind: "error" },
        );
      })
      .catch((err) => {
        if (!alive) return;
        if (err?.response?.status === 410) {
          const gone = GoneSchema.safeParse(err.response.data);
          setState({
            kind: "expired",
            resent: gone.success && gone.data.resent === true,
          });
        } else {
          setState({ kind: "error" });
        }
      });
    return () => {
      alive = false;
    };
  }, [token]);

  if (state.kind === "loading") {
    return (
      <StatusPage testid="host-confirm-loading">
        <BrandLoader label={t("loading")} className="min-h-0" />
      </StatusPage>
    );
  }
  if (state.kind === "success") {
    return (
      <StatusPage
        icon="seed"
        title={t("success_title", { producer: state.producer })}
        primary={{ href: "/", label: t("cta_home") }}
        testid="host-confirm-success"
      />
    );
  }
  if (state.kind === "expired") {
    return (
      <StatusPage
        icon={EnvelopeSimple}
        title={state.resent ? t("expired_resent_title") : t("expired_title")}
        primary={{ href: "/", label: t("cta_home") }}
        testid={state.resent ? "host-confirm-expired-resent" : "host-confirm-expired"}
      />
    );
  }
  return (
    <StatusPage
      icon={LinkBreak}
      title={t("error_title")}
      primary={{ href: "/", label: t("cta_home") }}
      testid="host-confirm-error"
    />
  );
}
