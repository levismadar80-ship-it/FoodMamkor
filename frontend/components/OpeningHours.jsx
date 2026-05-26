"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

// Day name constants. DAY_ABBR (English) is the API axis — used to parse
// backend strings like "Sun-Thu 09:00-18:00". DAY_KEYS maps each index to
// its translation key so display labels follow the active locale.
const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

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

// Given parsed map, compute current status in Israel timezone.
// Returns { isOpen, closeTime?, nextDayKey?, nextTime?, nextIsTomorrow? }.
// Day labels are resolved at the JSX layer via t() so this stays locale-agnostic.
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
      return {
        isOpen: false,
        nextDayKey: DAY_KEYS[nextIdx],
        nextTime: map[nextIdx].open,
        nextIsTomorrow: d === 1,
      };
    }
  }
  return { isOpen: false };
}

export default function OpeningHours({ opening_hours }) {
  const t = useTranslations("opening_hours");
  const map = useMemo(() => parseHours(opening_hours), [opening_hours]);
  const status = useMemo(() => (map ? computeStatus(map) : null), [map]);

  if (!map) return null;

  return (
    <section className="mt-8 border-t border-border pt-8">
      <h2 className="font-headline text-2xl font-bold text-site-text mb-4">{t("heading")}</h2>

      {/* Open / closed indicator */}
      {status && (
        <div className="flex items-center gap-2 mb-4 text-sm font-medium">
          <span
            className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${status.isOpen ? "bg-primary" : "bg-[#A32D2D]"}`}
            aria-hidden="true"
          />
          {status.isOpen ? (
            <span className="text-primary">
              {t("open_now")}
              {status.closeTime && (
                <span className="text-fg-muted font-normal">
                  {" "}{t("closes_at", { time: status.closeTime })}
                </span>
              )}
            </span>
          ) : (
            <span className="text-[#A32D2D]">
              {t("closed_now")}
              {status.nextDayKey && (
                <span className="text-fg-muted font-normal">
                  {" "}
                  {t("opens_at", {
                    day: status.nextIsTomorrow
                      ? t("tomorrow")
                      : t(`weekdays.${status.nextDayKey}`),
                    time: status.nextTime,
                  })}
                </span>
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
              <span>{t(`weekdays.${DAY_KEYS[i]}`)}</span>
              <span dir="ltr" className="text-start">
                {hours ? `${hours.open}–${hours.close}` : t("closed_day")}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
