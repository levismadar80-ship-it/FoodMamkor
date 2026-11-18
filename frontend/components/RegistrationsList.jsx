// @ts-check
"use client";

/**
 * Module:   RegistrationsList
 * Purpose:  The owner's list of on-site sign-ups for one event / workshop
 *           (MEH-2766), as a closed-by-default disclosure on the manage page.
 *           The summary carries the active count straight from the list
 *           payload (registered_count), so nothing is fetched until she opens
 *           it; opening loads GET /{kind}/{id}/registrations once.
 * States:   closed: summary «הרשמות באתר (N)» — 0 / 1 / many alike.
 *           open:   loading → skeleton line; error → one line;
 *                   0 rows → «עוד אין הרשמות באתר»; 1 / many → one row each,
 *                   cancelled rows kept (struck name + «בוטלה») so she can see
 *                   who dropped out.
 * Does NOT: render for items whose method isn't the on-site form (the caller
 *           decides), or let her edit / remove a sign-up (post-launch).
 * Related:  backend/app/routers/registrations.py (list_*_registrations),
 *           app/[locale]/producer/dashboard/{events,experiences}/page.js
 * History:  MEH-2766 (creation).
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CaretDown } from "@phosphor-icons/react";
import api from "@/lib/api";
import InlineMessage from "@/components/ui/InlineMessage";
import { SkeletonBlock } from "@/components/Skeleton";

/**
 * @param {object} props
 * @param {"events"|"experiences"} props.kind
 * @param {string} props.itemId
 * @param {number} [props.count]  active sign-ups (registered_count from the list route)
 */
export default function RegistrationsList({ kind, itemId, count = 0 }) {
  const t = useTranslations("registration.list");
  const [rows, setRows] = useState(null); // null = not loaded yet
  const [failed, setFailed] = useState(false);

  const onToggle = (e) => {
    if (!e.currentTarget.open || rows !== null) return;
    setFailed(false);
    api
      // Literal paths, so the API-contract audit can resolve both routes.
      .get(kind === "events" ? `/events/${itemId}/registrations` : `/experiences/${itemId}/registrations`)
      .then((r) => setRows(Array.isArray(r.data) ? r.data : []))
      .catch(() => setFailed(true));
  };

  const waiting = (rows ?? []).filter((r) => r.status === "waitlisted");
  const signups = (rows ?? []).filter((r) => r.status !== "waitlisted");

  return (
    <details
      className="group mt-3 pt-3 border-t border-border text-sm"
      data-testid="registrations-list"
      onToggle={onToggle}
    >
      <summary className="cursor-pointer min-h-touch flex items-center gap-2 font-medium text-text list-none [&::-webkit-details-marker]:hidden">
        <span className="numeric">{t("summary", { count })}</span>
        <CaretDown size={16} aria-hidden="true" className="transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-2">
        {failed ? (
          <InlineMessage size="inherit">
            {t("load_error")}
          </InlineMessage>
        ) : rows === null ? (
          <SkeletonBlock as="div" className="h-5 w-40 rounded" aria-busy="true" />
        ) : rows.length === 0 ? (
          <p className="text-fg-muted" data-testid="registrations-empty">
            {t("empty")}
          </p>
        ) : (
          <>
            {signups.length > 0 ? (
              <RowList rows={signups} cancelledLabel={t("cancelled")} />
            ) : (
              <p className="text-fg-muted" data-testid="registrations-empty">
                {t("empty")}
              </p>
            )}
            {/* MEH-3314: the waitlist sits apart from the sign-ups, in the order
                it is offered spots (the route sorts by created_at). */}
            {waiting.length > 0 && (
              <div className="mt-3" data-testid="registrations-waitlist">
                <h4 className="font-medium text-text numeric">{t("waitlist", { count: waiting.length })}</h4>
                <RowList rows={waiting} cancelledLabel={t("cancelled")} ordered />
              </div>
            )}
          </>
        )}
      </div>
    </details>
  );
}

/** One block of rows; `ordered` numbers them (the waitlist's queue order). */
function RowList({ rows, cancelledLabel, ordered = false }) {
  const List = ordered ? "ol" : "ul";
  return (
    <List className={`divide-y divide-border ${ordered ? "list-decimal list-inside" : ""}`}>
      {rows.map((r) => {
        const cancelled = r.status === "cancelled";
        return (
          <li
            key={r.id}
            data-testid={ordered ? "waitlist-row" : "registration-row"}
            className={`py-2 ${ordered ? "" : "flex flex-col gap-0.5"} ${cancelled ? "text-fg-muted" : "text-text"}`}
          >
            <span className="font-medium">
              <span className={cancelled ? "line-through" : undefined}>{r.name}</span>
              {cancelled && <span className="ms-2 text-xs">{cancelledLabel}</span>}
            </span>
            <span className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
              <a href={`tel:${r.phone}`} dir="ltr" className="underline underline-offset-2 numeric">
                {r.phone}
              </a>
              <a href={`mailto:${r.email}`} dir="ltr" className="underline underline-offset-2 break-all">
                {r.email}
              </a>
            </span>
          </li>
        );
      })}
    </List>
  );
}
