"use client";

import { useMemo } from "react";

// Day name constants
const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_HE = ["יום ראשון", "יום שני", "יום שלישי", "יום רביעי", "יום חמישי", "יום שישי", "שבת"];

// Parse "Sun-Thu 09:00-18:00, Fri 09:00-14:00" into a map of dayIndex → {open, close} | null
function parseHours(raw) {
  if (!raw) return null;
  const map = {}; // dayIndex → { open: "09:00", close: "18:00" } or null (closed)
  const entries = raw.split(",").map((s) => s.trim()).filter(Boolean);

  for (const entry of entries) {
    const match = entry.match(/^([A-Za-z]+)(?:-([A-Za-z]+))?\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/);
    if (!match) continue;
    const [, startDay, endDay, open, close] = match;
    const startIdx = DAY_ABBR.findIndex((d) => d.toLowerCase() === startDay.toLowerCase());
    if (startIdx === -1) continue;
    const endIdx = endDay
      ? DAY_ABBR.findIndex((d) => d.toLowerCase() === endDay.toLowerCase())
      : startIdx;
    if (endIdx === -1) continue;
    // Handle week wrap (e.g. Thu-Sun would be odd but guard it)
    const indices = endIdx >= startIdx
      ? Array.from({ length: endIdx - startIdx + 1 }, (_, i) => startIdx + i)
      : [startIdx];
    for (const i of indices) map[i] = { open, close };
  }
  return Object.keys(map).length > 0 ? map : null;
}

// Convert "HH:MM" string to minutes since midnight
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Given parsed map, compute current status in Israel timezone
function computeStatus(map) {
  const now = new Date();
  // Israel timezone
  const ilStr = now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" });
  const il = new Date(ilStr);
  const dayIdx = il.getDay(); // 0=Sun…6=Sat
  const nowMin = il.getHours() * 60 + il.getMinutes();

  const todayHours = map[dayIdx];
  if (todayHours) {
    const openMin = toMinutes(todayHours.open);
    const closeMin = toMinutes(todayHours.close);
    if (nowMin >= openMin && nowMin < closeMin) {
      return { isOpen: true, closeTime: todayHours.close };
    }
  }

  // Find next open slot
  for (let d = 1; d <= 7; d++) {
    const nextIdx = (dayIdx + d) % 7;
    if (map[nextIdx]) {
      const label = d === 1 ? "מחר" : DAY_HE[nextIdx];
      return { isOpen: false, nextDay: label, nextTime: map[nextIdx].open };
    }
  }
  return { isOpen: false };
}

export default function OpeningHours({ opening_hours }) {
  const map = useMemo(() => parseHours(opening_hours), [opening_hours]);
  const status = useMemo(() => (map ? computeStatus(map) : null), [map]);

  if (!map) return null;

  return (
    <section className="mt-8 border-t border-border pt-8">
      <h2 className="font-headline text-2xl font-bold text-site-text mb-4">שעות פעילות</h2>

      {/* Open / closed indicator */}
      {status && (
        <div className="flex items-center gap-2 mb-4 text-sm font-medium">
          <span
            className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${status.isOpen ? "bg-primary" : "bg-[#A32D2D]"}`}
            aria-hidden="true"
          />
          {status.isOpen ? (
            <span className="text-primary">
              פתוח עכשיו
              {status.closeTime && <span className="text-site-muted font-normal"> · סוגר ב-{status.closeTime}</span>}
            </span>
          ) : (
            <span className="text-[#A32D2D]">
              סגור
              {status.nextDay && (
                <span className="text-site-muted font-normal"> · פותח ב-{status.nextDay} {status.nextTime}</span>
              )}
            </span>
          )}
        </div>
      )}

      {/* Day table */}
      <div className="space-y-1">
        {DAY_ABBR.map((abbr, i) => {
          const hours = map[i];
          const isToday = new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem", weekday: "short" }).startsWith(abbr);
          return (
            <div
              key={abbr}
              className={`flex justify-between text-sm py-1.5 ${isToday ? "font-semibold text-site-text" : "text-site-text/80"}`}
            >
              <span>{DAY_HE[i]}</span>
              <span dir="ltr" className="text-start">
                {hours ? `${hours.open}–${hours.close}` : "סגור"}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
