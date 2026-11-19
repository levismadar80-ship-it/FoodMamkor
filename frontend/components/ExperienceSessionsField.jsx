// @ts-check
"use client";

/**
 * Module:   ExperienceSessionsField
 * Purpose:  MEH-3447 (stage 4 of MEH-3264) — the dates of a recurring
 *           workshop, inside the «החוויה חוזרת» block of the owner's form
 *           (placement option א of the MEH-3264 study). Each date has its own
 *           places; the server counts them (MEH-3441).
 * States:   0 dates → the hint and «הוספת מועד» only; 1 / many → one row
 *           each (date · time · ×). 12 rows → the add button gives way to
 *           «אפשר להוסיף עד 12 מועדים קדימה.». Removing a date with sign-ups
 *           asks first (Dialog); one without removes at once.
 * Does NOT: validate past / duplicate dates (the server answers 422 with the
 *           approved copy, shown by ExperienceForm), or save anything — it
 *           edits the list the form sends as `sessions`.
 * Related:  components/ExperienceForm.jsx · backend/app/services/experience_sessions.py
 * History:  MEH-3447 (creation).
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { X, Plus } from "@phosphor-icons/react";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";

// MEH-3022: the server keeps at most 12 upcoming dates.
export const SESSION_MAX = 12;

/** @typedef {{ date: string, time: string, participants_count?: number, registered?: number }} Session */

/**
 * @param {{ sessions: Session[], onChange: (next: Session[]) => void }} props
 */
export default function ExperienceSessionsField({ sessions, onChange }) {
  const t = useTranslations("experiences.new");
  const [asking, setAsking] = useState(/** @type {number | null} */ (null));

  const edit = (i, field) => (e) => onChange(sessions.map((s, j) => (j === i ? { ...s, [field]: e.target.value } : s)));
  const drop = (i) => onChange(sessions.filter((_, j) => j !== i));
  const remove = (i) => ((sessions[i].registered ?? 0) > 0 ? setAsking(i) : drop(i));
  const full = sessions.length >= SESSION_MAX;

  return (
    <div className="mt-3 space-y-2" data-testid="experience-sessions">
      <p className="text-sm font-medium text-text">{t("sessions_title")}</p>
      <p className="text-xs text-fg-muted">{t("sessions_hint")}</p>
      {sessions.map((s, i) => (
        <div key={i} className="flex items-center gap-2" data-testid="experience-session-row">
          <Input
            type="date"
            size="sm"
            inline
            aria-label={t("field_date")}
            value={s.date}
            onChange={edit(i, "date")}
            className="flex-1 min-w-0"
          />
          <Input
            type="time"
            size="sm"
            inline
            aria-label={t("field_time")}
            value={s.time}
            onChange={edit(i, "time")}
            className="w-28"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            aria-label={t("sessions_remove")}
            className="w-11 h-11 shrink-0 flex items-center justify-center rounded-md border border-border text-fg-muted hover:bg-background focus-ring"
            data-testid="experience-session-remove"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ))}
      {full ? (
        <p className="text-xs text-fg-muted" data-testid="experience-sessions-full">
          {t("sessions_max")}
        </p>
      ) : (
        <button
          type="button"
          onClick={() => onChange([...sessions, { date: "", time: "", participants_count: 0 }])}
          className="min-h-touch inline-flex items-center gap-1 text-sm font-medium text-primary focus-ring rounded"
          data-testid="experience-session-add"
        >
          <Plus size={16} aria-hidden="true" />
          {t("sessions_add")}
        </button>
      )}
      {asking !== null && (
        <Dialog onClose={() => setAsking(null)} labelledBy="session-remove-title" size="sm" className="space-y-4">
          <p id="session-remove-title" className="text-base" data-testid="experience-session-remove-confirm">
            {t("sessions_remove_confirm", { count: sessions[asking]?.registered ?? 0 })}
          </p>
          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="outlined" onClick={() => setAsking(null)} data-autofocus>
              {t("cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                drop(asking);
                setAsking(null);
              }}
              data-testid="experience-session-remove-yes"
            >
              {t("sessions_remove")}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
