"use client";

import { useEffect, useState } from "react";
import { Leaf } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
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

  return (
    <section className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full bg-white rounded-[16px] p-8 border border-border text-center shadow-[0_2px_12px_rgba(46,104,83,0.04)]">
        <Leaf
          size={56}
          weight="fill"
          className="mx-auto mb-4 text-primary"
          aria-hidden="true"
        />

        {status === "loading" && (
          <p className="text-fg-muted leading-relaxed" role="status">
            {t("loading")}
          </p>
        )}

        {status === "success" && (
          <>
            <h1 className="font-headline-md text-2xl font-bold text-text mb-3">
              {t("success_title")}
            </h1>
            <p className="text-fg-muted leading-relaxed mb-6">
              {t("success_body")}
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <h1 className="font-headline-md text-2xl font-bold text-text mb-3">
              {t("error_title")}
            </h1>
            <p className="text-fg-muted leading-relaxed mb-6">
              {t("error_body")}
            </p>
          </>
        )}

        {status !== "loading" && (
          <Link
            href="/"
            className="inline-flex items-center justify-center bg-primary text-white px-6 py-3 rounded-full hover:bg-primary-dark transition font-medium focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {t("cta_home")}
          </Link>
        )}
      </div>
    </section>
  );
}
