/**
 * MEH-2468 — lib/event-ics.js: the «הוספה ליומן» file.
 * Times are Israel wall-clock; the file carries UTC, so the DST side of the
 * date matters (Israel: +3 summer, +2 winter; 2026 switch back is 25 Oct).
 */
import { describe, it, expect } from "vitest";
import { buildEventIcs, escapeIcsText, israelLocalToUtcStamp } from "@/lib/event-ics";

const NOW = new Date(Date.UTC(2026, 9, 28, 12, 0, 0));
const base = {
  id: "e1",
  title: "שוק גלם בנמל תל אביב",
  event_date: "2026-10-31",
  event_time: "09:30:00",
  location: "האנגר 11",
  city: "תל אביב",
  description: null,
};
const lines = (ics) => ics.replaceAll("\r\n ", "").split("\r\n");

describe("israelLocalToUtcStamp", () => {
  it("winter (after the 25 Oct 2026 switch): 09:30 Israel = 07:30Z", () => {
    expect(israelLocalToUtcStamp("2026-10-31", "09:30")).toBe("20261031T073000Z");
  });
  it("summer: 09:30 Israel = 06:30Z", () => {
    expect(israelLocalToUtcStamp("2026-07-01", "09:30:00")).toBe("20260701T063000Z");
  });
});

describe("escapeIcsText", () => {
  it("escapes backslash, semicolon, comma and newlines (RFC 5545 §3.3.11)", () => {
    expect(escapeIcsText("a\\b;c,d\ne")).toBe("a\\\\b\;c\\,d\\ne");
  });
});

describe("buildEventIcs", () => {
  it("timed event: UTC DTSTART, escaped SUMMARY/LOCATION, UID, URL, CRLF endings", () => {
    const ics = buildEventIcs(base, { url: "https://mehamakor.co.il/events/e1", now: NOW });
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replaceAll("\r\n", "")).not.toMatch(/\n/);
    const l = lines(ics);
    expect(l[0]).toBe("BEGIN:VCALENDAR");
    expect(l).toContain("DTSTART:20261031T073000Z");
    expect(l).toContain("UID:event-e1@mehamakor");
    expect(l).toContain("SUMMARY:שוק גלם בנמל תל אביב");
    expect(l).toContain("LOCATION:האנגר 11\\, תל אביב");
    expect(l).toContain("URL:https://mehamakor.co.il/events/e1");
    expect(l).toContain("DTSTAMP:20261028T120000Z");
    expect(l.filter((x) => x.startsWith("DTEND"))).toHaveLength(0);
  });

  it("date-only event: an all-day entry (DTEND is the next day)", () => {
    const l = lines(buildEventIcs({ ...base, event_time: null }, { now: NOW }));
    expect(l).toContain("DTSTART;VALUE=DATE:20261031");
    expect(l).toContain("DTEND;VALUE=DATE:20261101");
  });

  it("month/year rollover for the all-day end", () => {
    const l = lines(buildEventIcs({ ...base, event_date: "2026-12-31", event_time: null }, { now: NOW }));
    expect(l).toContain("DTEND;VALUE=DATE:20270101");
  });

  it("long lines are folded at ≤75 octets and unfold back to the original", () => {
    const description = "שוק ".repeat(60);
    const ics = buildEventIcs({ ...base, description }, { now: NOW });
    for (const raw of ics.split("\r\n")) {
      expect(new TextEncoder().encode(raw).length).toBeLessThanOrEqual(75);
    }
    expect(lines(ics).find((x) => x.startsWith("DESCRIPTION:"))).toBe(
      `DESCRIPTION:${escapeIcsText(description)}`,
    );
  });

  it("no location / no description / no url: those lines are omitted, not empty", () => {
    const l = lines(buildEventIcs({ ...base, location: null, city: null }, { now: NOW }));
    expect(l.some((x) => x.startsWith("LOCATION"))).toBe(false);
    expect(l.some((x) => x.startsWith("DESCRIPTION"))).toBe(false);
    expect(l.some((x) => x.startsWith("URL"))).toBe(false);
  });
});
