// @ts-check
"use client";

/**
 * Module:   AdminBusinessEventsPanel
 * Purpose:  On a business's admin edit page: its events, and the owner's own
 *           EventForm to add one or edit one on the business's behalf, with
 *           the «בית העסק אישר» box on every save (MEH-3873).
 * Touches:  GET /admin/producers/{id}/events; the form posts to
 *           /admin/producers/{id}/events and PUT /admin/events/{id}.
 * Does NOT: hold any rule about a valid event — EventForm and the server's
 *           shared create/update path do (routers/events.py create_event_for,
 *           update_event_row). Does NOT delete: DELETE /events/{id} already
 *           admits an admin and is not offered here.
 * Related:  components/EventForm.jsx (`adminProducerId`, `onCancel`),
 *           backend/app/routers/admin_business_content.py.
 * History:  MEH-3873 (creation).
 *
 * States: loading · load error · 0 events (empty line + «הוספת אירוע») ·
 * 1 / many (one row each, newest first, «בוטל» / «התאריך עבר» badges) — each
 * with the form closed, or open for a new event, for editing one row, or for
 * «שכפול» of one row (every field kept, the date cleared — the same seed as
 * the owner's duplicate, lib/use-duplicate-source.js; the way to renew a
 * harvest day that already passed).
 */

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatDate } from "@/lib/format-date";
import { useUserApi } from "@/lib/use-api";
import { showToast } from "@/lib/toast";
import useIsraelToday from "@/lib/use-israel-today";
import EventForm from "@/components/EventForm";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import InlineMessage from "@/components/ui/InlineMessage";
import SectionHeading from "@/components/ui/SectionHeading";

/** @param {{ producerId: string }} props */
export default function AdminBusinessEventsPanel({ producerId }) {
  const t = useTranslations("admin.business_events");
  const tCommon = useTranslations("admin.common");
  const tEvents = useTranslations("dashboard.producer.manage_events");
  const tStatus = useTranslations("rescue.dashboard.status");
  const locale = useLocale();
  const today = useIsraelToday();
  const { data, error, isLoading, mutate } = useUserApi(`/admin/producers/${producerId}/events`);
  // null = closed · otherwise what the form is doing, and with which row.
  const [open, setOpen] = useState(
    /** @type {null | { kind: "new" | "edit" | "copy", ev?: Record<string, any> }} */ (null),
  );
  const events = Array.isArray(data) ? data : [];
  const isEdit = open?.kind === "edit";
  // REUSES: lib/use-duplicate-source.js:53 — the owner's «שכפול» seed.
  const seed = open?.kind === "edit" ? open.ev : open?.kind === "copy" ? { ...open.ev, id: undefined, event_date: "" } : null;

  const onSaved = async () => {
    showToast.success(isEdit ? t("updated") : t("created"));
    setOpen(null);
    await mutate();
  };

  return (
    <section className="bg-surface rounded-md border border-border p-6 my-6" data-testid="admin-business-events">
      <SectionHeading>{t("title")}</SectionHeading>
      <p className="text-sm text-text-muted mb-4">{t("intro")}</p>

      {isLoading && <p className="text-sm text-text-muted">{tCommon("loading")}</p>}
      {error && !data && (
        <InlineMessage as="div" variant="box" className="rounded-sm p-3 mb-4">
          {t("load_error")}
        </InlineMessage>
      )}

      {!isLoading && !error && events.length === 0 && (
        <p className="text-sm mb-4" data-testid="admin-business-events-empty">
          {t("empty")}
        </p>
      )}

      {events.length > 0 && (
        <ul className="divide-y divide-border mb-4" data-testid="admin-business-events-list">
          {events.map((ev) => (
            <li key={ev.id} className="py-3 flex flex-wrap items-center gap-3">
              <span className="font-medium">{ev.title}</span>
              <span className="text-sm text-text-muted">{formatDate(ev.event_date, locale)}</span>
              {ev.is_active === false && <Badge>{tStatus("cancelled")}</Badge>}
              {ev.is_active !== false && today && ev.event_date < today && <Badge>{t("past")}</Badge>}
              <span className="ms-auto flex gap-2">
                <Button
                  type="button"
                  variant="outlined"
                  size="sm"
                  onClick={() => setOpen({ kind: "copy", ev })}
                  disabled={open !== null}
                  data-testid="admin-business-event-copy"
                >
                  {tEvents("action_duplicate")}
                </Button>
                <Button
                  type="button"
                  variant="outlined"
                  size="sm"
                  onClick={() => setOpen({ kind: "edit", ev })}
                  disabled={open !== null}
                  data-testid="admin-business-event-edit"
                >
                  {tCommon("edit")}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {open === null ? (
        <Button type="button" variant="primary" onClick={() => setOpen({ kind: "new" })} data-testid="admin-business-event-add">
          {t("add")}
        </Button>
      ) : (
        <EventForm
          key={`${open.kind}-${open.ev?.id ?? "new"}`}
          mode={isEdit ? "edit" : "create"}
          initial={seed}
          adminProducerId={producerId}
          onSuccess={onSaved}
          onCancel={() => setOpen(null)}
        />
      )}
    </section>
  );
}
