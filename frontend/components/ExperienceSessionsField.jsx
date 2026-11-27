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
 *           asks first (Dialog); one without removes at once. A date with
 *           people on it is locked (no in-place move that would cancel them
 *           silently). A row with only a date or only a time → «בחרו מועד.»
 *           on submit (ExperienceForm validates, this shows it).
 * Does NOT: validate past / duplicate dates (the server answers 422 with the
 *           approved copy, shown by ExperienceForm), or save anything — it
 *           edits the list the form sends as `sessions`.
 * Course:   `kind="course"` (MEH-3898) lists a course's meetings instead —
 *           one sign-up for all of them, so a meeting has no places of its
 *           own and nothing to ask before removing it. Up to 20 rows; the
 *           form shows `error` (fewer than 2 whole meetings) under the list.
 * Related:  components/ExperienceForm.jsx · backend/app/services/experience_sessions.py ·
 *           backend/app/services/course_meetings.py
 * History:  MEH-3447 (creation); MEH-3898 (course meetings).
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { X, Plus } from "@phosphor-icons/react";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import InlineMessage from "@/components/ui/InlineMessage";

// MEH-3022: the server keeps at most 12 upcoming dates.
export const SESSION_MAX = 12;
// MEH-3898: a course has 2..20 meetings (services/course_meetings.py).
export const COURSE_MIN = 2;
export const COURSE_MAX = 20;

/** @typedef {{ date: string, time: string, participants_count?: number, registered?: number | null }} Session */

/** A row with only its date or only its time — saving would drop it. */
export const isHalfSession = (/** @type {Session} */ s) => Boolean(s.date) !== Boolean(s.time);

/** MEH-3898: a course's meetings as the server takes them — whole rows only,
 * soonest first (the first is the course's date). */
export function courseMeetingsPayload(/** @type {Session[]} */ rows) {
  return rows
    .filter((s) => s.date && s.time)
    .map((s) => ({ date: s.date, time: String(s.time).slice(0, 5) }))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

// The copy per kind: a recurring workshop's dates, or a course's meetings.
const KEYS = {
  sessions: { title: "sessions_title", hint: "sessions_hint", add: "sessions_add", max: "sessions_max", remove: "sessions_remove" },
  course: { title: "course_title", hint: "course_hint", add: "course_add", max: "course_max", remove: "course_remove" },
};

/**
 * @param {{ sessions: Session[], onChange: (next: Session[]) => void, invalid?: boolean, kind?: "sessions" | "course", error?: string }} props
 */
export default function ExperienceSessionsField({ sessions, onChange, invalid = false, kind = "sessions", error }) {
  const t = useTranslations("experiences.new");
  const keys = KEYS[kind];
  const course = kind === "course";
  // The approved «בחרו מועד.» (MEH-3264 copy table) — one owner for the line.
  const tSignup = useTranslations("registration.signup");
  const [asking, setAsking] = useState(/** @type {number | null} */ (null));

  const edit = (i, field) => (e) => onChange(sessions.map((s, j) => (j === i ? { ...s, [field]: e.target.value } : s)));
  const drop = (i) => onChange(sessions.filter((_, j) => j !== i));
  const remove = (i) => ((sessions[i].registered ?? 0) > 0 ? setAsking(i) : drop(i));
  const full = sessions.length >= (course ? COURSE_MAX : SESSION_MAX);
  // A date with people on it is not edited in place: moving it would cancel
  // them all without the question the × asks (MEH-3447 review). Remove it
  // (that asks) and add the new date.
  const held = (s) => (s.registered ?? 0) > 0;
  // The id is there before submit too: the form focuses it in the same tick
  // it sets the error, before this re-renders.
  const firstHalf = sessions.findIndex(isHalfSession);
  // MEH-3898: the id the form focuses on a course error — the first half
  // row, else the add button (too few meetings).
  const incompleteId = course ? "experience-course-first" : "experience-session-incomplete";
  const label = (key, i) => (sessions.length > 1 ? `${t(key)} ${i + 1}` : t(key));

  return (
    <div className="mt-3 space-y-2" data-testid={course ? "experience-course-meetings" : "experience-sessions"}>
      <p className="text-sm font-medium text-text">{t(keys.title)}</p>
      <p className="text-xs text-fg-muted">{t(keys.hint)}</p>
      {sessions.map((s, i) => (
        <div key={i} className="flex items-center gap-2" data-testid="experience-session-row">
          <Input
            id={i === firstHalf && !s.date ? incompleteId : undefined}
            type="date"
            size="sm"
            inline
            aria-label={label("field_date", i)}
            aria-invalid={invalid && isHalfSession(s) && !s.date ? true : undefined}
            value={s.date}
            onChange={edit(i, "date")}
            disabled={held(s)}
            className="flex-1 min-w-0"
          />
          <Input
            id={i === firstHalf && s.date ? incompleteId : undefined}
            type="time"
            size="sm"
            inline
            aria-label={label("field_time", i)}
            aria-invalid={invalid && isHalfSession(s) && !s.time ? true : undefined}
            value={s.time}
            onChange={edit(i, "time")}
            disabled={held(s)}
            className="w-28"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            aria-label={label(keys.remove, i)}
            className="w-11 h-11 shrink-0 flex items-center justify-center rounded-md border border-border text-fg-muted hover:bg-background focus-ring"
            data-testid="experience-session-remove"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ))}
      {course && error && (
        <InlineMessage size="xs" data-testid="experience-course-error">
          {error}
        </InlineMessage>
      )}
      {!course && invalid && firstHalf >= 0 && (
        <InlineMessage size="xs" data-testid="experience-sessions-incomplete">
          {tSignup("session_required")}
        </InlineMessage>
      )}
      {full ? (
        <p className="text-xs text-fg-muted" data-testid="experience-sessions-full">
          {t(keys.max)}
        </p>
      ) : (
        <button
          type="button"
          id={course && firstHalf < 0 ? incompleteId : undefined}
          onClick={() => onChange([...sessions, course ? { date: "", time: "" } : { date: "", time: "", participants_count: 0 }])}
          className="min-h-touch inline-flex items-center gap-1 text-sm font-medium text-primary focus-ring rounded"
          data-testid="experience-session-add"
        >
          <Plus size={16} aria-hidden="true" />
          {t(keys.add)}
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
