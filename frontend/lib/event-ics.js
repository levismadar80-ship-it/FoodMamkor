/**
 * Module:   event-ics
 * Purpose:  Turn one event into an iCalendar (RFC 5545) file the visitor can
 *           open in Google / Apple / Outlook calendar — the «הוספה ליומן»
 *           button on the event page.
 * Touches:  nothing (pure string building; the page does the download).
 * Does NOT: know about recurrence or an end time — events have a date and an
 *           optional start time only (end time: a separate card). A timed event
 *           is written with DTSTART only; a date-only event is an all-day entry.
 * Related:  app/[locale]/events/[id]/EventDetailClient.jsx (the button),
 *           lib/seo.js buildEventJsonLd (the same fields for Google).
 * History:  MEH-2468 (creation).
 */

const ISRAEL_TZ = "Asia/Jerusalem";

/** RFC 5545 §3.3.11: escape backslash, semicolon, comma; newlines → \n. */
export function escapeIcsText(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll(/\r\n|\r|\n/g, "\\n");
}

const pad = (n) => String(n).padStart(2, "0");

/** Minutes Asia/Jerusalem is ahead of UTC at the instant `utcMs`. */
function israelOffsetMinutes(utcMs) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: ISRAEL_TZ,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(new Date(utcMs))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  );
  return Math.round((asUtc - utcMs) / 60000);
}

/** Israel wall-clock date "YYYY-MM-DD" + time "HH:MM[:SS]" → UTC "YYYYMMDDTHHMMSSZ".
 *  Two passes so a time near a DST switch lands on the offset in force then. */
export function israelLocalToUtcStamp(isoDate, time) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let utc = wall - israelOffsetMinutes(wall) * 60000;
  utc = wall - israelOffsetMinutes(utc) * 60000;
  const t = new Date(utc);
  return (
    `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}` +
    `T${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}00Z`
  );
}

function nextDay(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}`;
}

/** RFC 5545 §3.1: lines longer than 75 octets are folded (CRLF + space). */
function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const chSize = new TextEncoder().encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (size + chSize > limit) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += chSize;
  }
  out.push(current);
  return out.join("\r\n ");
}

/**
 * @param {object} event  EventOut: id, title, event_date, event_time?, location?, city?, description?
 * @param {{url?: string, now?: Date}} [opts]
 * @returns {string} the .ics body, CRLF line endings
 */
export function buildEventIcs(event, { url = "", now = new Date() } = {}) {
  const stamp =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const place = [event.location, event.city].filter(Boolean).join(", ");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//mehamakor//events//HE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:event-${event.id}@mehamakor`,
    `DTSTAMP:${stamp}`,
  ];
  if (event.event_time) {
    lines.push(`DTSTART:${israelLocalToUtcStamp(event.event_date, event.event_time)}`);
  } else {
    lines.push(
      `DTSTART;VALUE=DATE:${event.event_date.replaceAll("-", "")}`,
      `DTEND;VALUE=DATE:${nextDay(event.event_date)}`,
    );
  }
  lines.push(`SUMMARY:${escapeIcsText(event.title)}`);
  if (place) lines.push(`LOCATION:${escapeIcsText(place)}`);
  const description = [event.description, url].filter(Boolean).join("\n\n");
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  if (url) lines.push(`URL:${url}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
