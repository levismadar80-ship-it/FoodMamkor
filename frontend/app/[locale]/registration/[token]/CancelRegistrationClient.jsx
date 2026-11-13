"use client";

/**
 * MEH-2768 — «ביטול הרשמה ל-"{title}"». Loads what the token points at
 * (GET /registrations/{token}) and cancels on one explicit tap
 * (POST /registrations/{token}/cancel) — never on page load, so a mail
 * scanner that pre-fetches the link cannot cancel anyone. Both routes are
 * idempotent; an already-cancelled sign-up just reads «ההרשמה בוטלה.»
 */

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import api from "@/lib/api";
import { formatEventDate } from "@/lib/format-date";
import BackLink from "@/components/ui/BackLink";

const BTN =
  "flex items-center justify-center min-h-[48px] w-full bg-primary text-white px-6 rounded-full font-semibold hover:bg-primary-dark transition focus-ring disabled:opacity-60";

export default function CancelRegistrationClient({ token }) {
  const t = useTranslations("registration.cancel");
  const locale = useLocale();
  const [info, setInfo] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | missing | cancelling | error
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get(`/registrations/${encodeURIComponent(token)}`)
      .then((r) => {
        if (!alive) return;
        setInfo(r.data);
        setState("ready");
      })
      .catch((err) => alive && setState(err.response?.status === 404 ? "missing" : "error"));
    return () => {
      alive = false;
    };
  }, [token]);

  const cancel = async () => {
    setFailed(false);
    setState("cancelling");
    try {
      const r = await api.post(`/registrations/${encodeURIComponent(token)}/cancel`);
      setInfo(r.data);
    } catch {
      setFailed(true);
    } finally {
      setState("ready");
    }
  };

  const itemHref = info ? `/${info.kind === "event" ? "events" : "experiences"}/${info.item_id}` : null;

  return (
    // The layout already renders <main id="main-content"> (layout.js) — one landmark.
    <section className="max-w-md mx-auto px-4 py-12" data-testid="registration-cancel">
      {state === "loading" && <div className="h-6 w-48 rounded bg-border/60 animate-pulse" aria-busy="true" />}
      {(state === "missing" || state === "error") && (
        <p role="alert" className="text-text" data-testid="registration-cancel-missing">
          {state === "missing" ? t("not_found") : t("generic")}
        </p>
      )}
      {info && (state === "ready" || state === "cancelling") && (
        <div className="space-y-5">
          <h1 className="font-headline-lg text-2xl font-bold text-text">{t("title", { title: info.title })}</h1>
          <p className="text-fg-muted numeric">
            {formatEventDate(info.event_date, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
          {info.status === "cancelled" ? (
            <p role="status" className="font-semibold text-text" data-testid="registration-cancel-done">
              {t("done")}
            </p>
          ) : (
            <>
              {failed && (
                <p role="alert" className="text-sm text-danger-700">
                  {t("generic")}
                </p>
              )}
              <button
                type="button"
                onClick={cancel}
                disabled={state === "cancelling"}
                className={BTN}
                data-testid="registration-cancel-confirm"
              >
                {state === "cancelling" ? t("cancelling") : t("confirm")}
              </button>
            </>
          )}
          <BackLink href={itemHref} label={info.kind === "event" ? t("back_event") : t("back_experience")} />
        </div>
      )}
    </section>
  );
}
