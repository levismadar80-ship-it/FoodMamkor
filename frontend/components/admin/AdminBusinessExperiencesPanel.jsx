// @ts-check
"use client";

/**
 * Module:   AdminBusinessExperiencesPanel
 * Purpose:  On a business's admin edit page: its experiences (workshops), and
 *           the owner's own ExperienceForm to add one or edit one on the
 *           business's behalf, with the «בית העסק אישר» box on every save
 *           (MEH-3876; the events twin is AdminBusinessEventsPanel, MEH-3873).
 * Touches:  GET /admin/producers/{id}/experiences; the form posts to
 *           /admin/producers/{id}/experiences and PUT /admin/experiences/{id}.
 * Does NOT: hold any rule about a valid experience — ExperienceForm and the
 *           server's shared path do (routers/experiences.py
 *           submit_experience_for, update_experience_row). Does NOT approve:
 *           an admin-written experience waits in /admin/experiences like the
 *           owner's. Does NOT delete (DELETE /experiences/{id} already admits
 *           an admin and is not offered here).
 * Related:  components/admin/AdminBusinessEventsPanel.jsx (same shape),
 *           components/ExperienceForm.jsx (`adminProducerId`, `onCancel`),
 *           backend/app/routers/admin_business_content.py.
 * History:  MEH-3876 (creation).
 *
 * States: no owner account (`hasOwner === false`, or not hydrated: the
 * explanation instead of «הוספת חוויה», since the server answers 409) ·
 * loading · load error · 0 experiences · 1 / many (one row each, newest
 * first, with its status badge and «מבוטלת» / «הסתיימה») — each with the form
 * closed, or open for a new one, for editing one row, or for «שכפול» of one
 * row (every field kept, the date and the listed dates cleared — the same
 * seed as the owner's duplicate, lib/use-duplicate-source.js).
 */

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatDate } from "@/lib/format-date";
import { useUserApi } from "@/lib/use-api";
import { showToast } from "@/lib/toast";
import useIsraelToday from "@/lib/use-israel-today";
import ExperienceForm from "@/components/ExperienceForm";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import InlineMessage from "@/components/ui/InlineMessage";
import SectionHeading from "@/components/ui/SectionHeading";

/** @typedef {null | { kind: "new" | "edit" | "copy", ex?: Record<string, any> }} OpenState */

/** @param {OpenState} open */
function seedFor(open) {
  if (open?.kind === "edit") return open.ex;
  // REUSES: lib/use-duplicate-source.js:53 — the owner's «שכפול» seed.
  if (open?.kind === "copy") return { ...open.ex, id: undefined, event_date: "", sessions: [] };
  return null;
}

/** @param {{ ex: Record<string, any>, busy: boolean, onOpen: (open: OpenState) => void }} props */
function BusinessExperienceRow({ ex, busy, onOpen }) {
  const t = useTranslations("dashboard.producer.manage_experiences");
  const tCommon = useTranslations("admin.common");
  const locale = useLocale();
  const today = useIsraelToday();
  const past = !ex.is_recurring && today && ex.event_date && ex.event_date < today;
  return (
    <li className="py-3 flex flex-wrap items-center gap-3">
      <span className="font-medium">{ex.title}</span>
      {ex.event_date && <span className="text-sm text-text-muted">{formatDate(ex.event_date, locale)}</span>}
      <Badge>{t(`status_${ex.status}`)}</Badge>
      {ex.is_active === false && <Badge>{t("badge_inactive")}</Badge>}
      {ex.is_active !== false && past && <Badge>{t("badge_past")}</Badge>}
      <span className="ms-auto flex gap-2">
        <Button type="button" variant="outlined" size="sm" disabled={busy} onClick={() => onOpen({ kind: "copy", ex })} data-testid="admin-business-experience-copy">
          {t("action_duplicate")}
        </Button>
        <Button type="button" variant="outlined" size="sm" disabled={busy} onClick={() => onOpen({ kind: "edit", ex })} data-testid="admin-business-experience-edit">
          {tCommon("edit")}
        </Button>
      </span>
    </li>
  );
}

/** @param {{ producerId: string, hasOwner?: boolean | null }} props */
export default function AdminBusinessExperiencesPanel({ producerId, hasOwner = null }) {
  const t = useTranslations("admin.business_experiences");
  const tEvents = useTranslations("admin.business_events");
  const tCommon = useTranslations("admin.common");
  const { data, error, isLoading, mutate } = useUserApi(`/admin/producers/${producerId}/experiences`);
  const [open, setOpen] = useState(/** @type {OpenState} */ (null));
  const experiences = Array.isArray(data) ? data : [];
  const isEdit = open?.kind === "edit";

  // An edit that changed the content sends the experience back to the queue
  // (experiences.py update_experience_row, `content_changed`); the toast says
  // so only when the server answered with `pending`.
  /** @param {{ status?: string } | undefined} saved */
  const onSaved = async (saved) => {
    const editMsg = saved?.status === "pending" ? t("updated") : tEvents("updated");
    showToast.success(isEdit ? editMsg : t("created"));
    setOpen(null);
    await mutate();
  };

  return (
    <section className="bg-surface rounded-md border border-border p-6 my-6" data-testid="admin-business-experiences">
      <SectionHeading>{t("title")}</SectionHeading>
      <p className="text-sm text-text-muted mb-4">{t("intro")}</p>
      {isLoading && <p className="text-sm text-text-muted">{tCommon("loading")}</p>}
      {error && !data && (
        <InlineMessage as="div" variant="box" className="rounded-sm p-3 mb-4">
          {t("load_error")}
        </InlineMessage>
      )}
      {!isLoading && !error && experiences.length === 0 && hasOwner === true && (
        <p className="text-sm mb-4" data-testid="admin-business-experiences-empty">{t("empty")}</p>
      )}
      {experiences.length > 0 && (
        <ul className="divide-y divide-border mb-4" data-testid="admin-business-experiences-list">
          {experiences.map((ex) => (
            <BusinessExperienceRow key={ex.id} ex={ex} busy={open !== null} onOpen={setOpen} />
          ))}
        </ul>
      )}
      <PanelAction producerId={producerId} hasOwner={hasOwner} open={open} setOpen={setOpen} onSaved={onSaved} />
    </section>
  );
}

/**
 * The bottom of the panel: the explanation (no owner), the add button, or
 * the open form. Editing a listed row works with or without the flag — a row
 * can only be listed when an account of the business hosts it.
 * @param {{ producerId: string, hasOwner: boolean | null, open: OpenState, setOpen: (o: OpenState) => void, onSaved: (saved?: { status?: string }) => Promise<void> }} props
 */
function PanelAction({ producerId, hasOwner, open, setOpen, onSaved }) {
  const t = useTranslations("admin.business_experiences");
  if (open !== null) {
    return (
      <ExperienceForm
        key={`${open.kind}-${open.ex?.id ?? "new"}`}
        mode={open.kind === "edit" ? "edit" : "create"}
        initial={seedFor(open)}
        adminProducerId={producerId}
        onSuccess={onSaved}
        onCancel={() => setOpen(null)}
      />
    );
  }
  // `=== true` and not truthy: null means the page did not hydrate the field,
  // and null hides the button (fail closed, the MEH-2495 rule on the edit page).
  if (hasOwner !== true) {
    return (
      <p className="text-sm text-text-muted" data-testid="admin-business-experiences-no-owner">
        {t("no_owner")}
      </p>
    );
  }
  return (
    <Button type="button" variant="primary" onClick={() => setOpen({ kind: "new" })} data-testid="admin-business-experience-add">
      {t("add")}
    </Button>
  );
}
