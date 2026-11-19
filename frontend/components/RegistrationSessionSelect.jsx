// @ts-check
"use client";

/**
 * Module:   RegistrationSessionSelect
 * Purpose:  MEH-3447 — «מועד», the first field of the sign-up form on a
 *           recurring workshop with dates (placement option א of the MEH-3264
 *           study; Eventbrite's "choose a date, then tickets"). A full date
 *           stays selectable, marked «· מלא»: choosing it turns the form into
 *           that date's waitlist (MEH-3441 counts the waitlist per date).
 * States:   rendered only with ≥ 1 date (the caller passes none otherwise);
 *           1 / many dates → one option each, after «בחרו מועד».
 * Does NOT: fetch — the dates come with the workshop (`sessions`, upcoming
 *           only, each with spots_left).
 * History:  MEH-3447 (creation).
 */

import { useLocale, useTranslations } from "next-intl";
import Select from "@/components/ui/Select";
import { formatDate } from "@/lib/format-date";

/** @typedef {{ date: string, time: string, spots_left?: number | null }} Session */

/** The option value for a date: "YYYY-MM-DD HH:MM". */
export const sessionKey = (/** @type {Session} */ s) => `${s.date} ${s.time}`;

/** A date with a cap and no place left. */
export const isFullSession = (/** @type {Session | undefined} */ s) => Boolean(s && s.spots_left === 0);

/**
 * @param {{ sessions: Session[], value: string, onChange: (e: any) => void, error?: string }} props
 */
export default function RegistrationSessionSelect({ sessions, value, onChange, error }) {
  const t = useTranslations("registration.signup");
  const locale = useLocale();
  return (
    <Select
      id="signup-session"
      size="md"
      label={t("session")}
      required
      value={value}
      onChange={onChange}
      error={error}
      data-testid="registration-session"
    >
      <option value="">{t("session_placeholder")}</option>
      {sessions.map((s) => {
        const values = { date: formatDate(s.date, locale, "long"), time: s.time };
        return (
          <option key={sessionKey(s)} value={sessionKey(s)}>
            {isFullSession(s) ? t("session_full", values) : t("session_option", values)}
          </option>
        );
      })}
    </Select>
  );
}
