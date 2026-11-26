// @ts-check
"use client";

/**
 * Module:   CourseMeetingsList
 * Purpose:  MEH-3898 — the meetings of a course on the experience page, one
 *           line each: «מפגש 2 · יום שלישי, 12 בינואר 2027 · 18:00». A course
 *           has one sign-up for all of them, so a line has no places or CTA.
 * States:   not a course (0 meetings) → renders nothing · 1 (the server
 *           refuses fewer than 2, an old row could still hold one) · many,
 *           up to 20, all listed (no reveal: the whole list is the content).
 * Does NOT: decide what a course is — the server stores `course_meetings`
 *           (backend/app/services/course_meetings.py).
 * Related:  app/[locale]/experiences/[id]/ExperienceDetailClient.jsx ·
 *           components/ExperienceSessionsField.jsx (the owner's form)
 * History:  MEH-3898 (creation).
 */

import { useLocale, useTranslations } from "next-intl";
import { formatEventDate } from "@/lib/format-date";

/** @type {Intl.DateTimeFormatOptions} */
const DATE_OPTIONS = { weekday: "long", day: "numeric", month: "long", year: "numeric" };

/** @param {{ meetings: { date: string, time?: string | null }[] }} props */
export default function CourseMeetingsList({ meetings }) {
  const t = useTranslations("experiences.detail");
  const locale = useLocale();
  if (!meetings?.length) return null;
  return (
    <ol className="px-4 pb-3 space-y-1 text-sm text-text" data-testid="experience-course-meetings">
      {meetings.map((m, i) => (
        <li key={`${m.date}-${m.time ?? ""}`} data-testid="experience-course-meeting">
          <span className="font-medium">{t("course_meeting", { n: i + 1 })}</span>
          {" · "}
          {formatEventDate(m.date, locale, DATE_OPTIONS)}
          {m.time ? ` · ${String(m.time).slice(0, 5)}` : ""}
        </li>
      ))}
    </ol>
  );
}
