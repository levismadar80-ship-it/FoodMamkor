"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";

// MEH-785: locale-aware dates via the shared helper — replaces 3 hardcoded
// toLocaleDateString("he-IL") sites that escaped the MEH-753/MEH-777 sweeps.
import { formatEventDate } from "@/lib/format-date";

// A busy day shows at most this many dots; the count is in the aria-label.
const MAX_DOTS = 3;

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const LONG_DATE = { weekday: "long", day: "numeric", month: "long" };

// MEH-1988 — Phase 0 asked whether this component should be moved onto the
// Israel clock (lib/israel-date.js) with holidays.js and the seasonal
// placeholders. DECIDED: NO. Browser-local is correct here, and the decision is
// recorded in the file rather than only on the ticket, because this is exactly
// where someone would come to "fix" it.
//
// Three reasons, in order of weight:
//
//  1. NOTHING HERE IS COMPARED AGAINST THE SERVER. That is the criterion the
//     MEH-1983 defect actually turned on — the vacation pickers offered a date
//     `israel_today()` then rejected. This grid is browsing chrome; no value it
//     computes is ever sent anywhere to be validated.
//
//  2. A HALF-MIGRATION WOULD BE A REGRESSION. `dateKey` (:13) and `cells` (below)
//     build their keys and their month grid from local getFullYear/getMonth/
//     getDate. Moving only `today` onto Israel time would let the "is this cell
//     today" highlight disagree with the grid it sits in — for a viewer abroad,
//     a highlighted cell in the wrong square. Strictly worse than now.
//
//  3. IT IS THE USER'S OWN CALENDAR. Showing a viewer in Berlin *their* today is
//     the expected behaviour of a month grid; forcing Israel's day on them would
//     be the surprising choice, not the correct one.
//
// DO NOT "align this with the israel-clock sweep" without re-reading (2) — the
// cheap version of that change is the one that breaks it.
// MEH-2771 — Sapir picked option ב׳ (artifact 6A9W8DiPvJHkYHnSSkqWNR): a small
// month grid beside (md+) / above (phone) a list of every event in the shown
// month. Before, a day with events was marked only by a 6px dot, the selected
// day (full green fill) out-shouted today, cells were ~140px squares at 1440,
// and nothing listed until a day was clicked. Now:
//   - a day with events: light-green fill, bold number, one dot per event (≤3);
//   - a day without events, or a past day: muted and not clickable;
//   - today: accent ring + «היום»; selected: primary ring (not a full fill);
//   - the list is always there; clicking a day highlights its rows and
//     scrolls to them, clicking it again clears the selection.
// `renderItem(row)` draws each list row — the page passes EventEntryRow so the
// calendar list looks exactly like the list view.
export default function CalendarView({ items, renderItem, kind = "events" }) {
  const t = useTranslations("events.calendar");
  const locale = useLocale();
  const today = useMemo(() => new Date(), []);
  const todayKey = dateKey(today);
  const [currentMonth, setCurrentMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [selectedDate, setSelectedDate] = useState(null);
  const listRef = useRef(null);

  const itemsByDate = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      if (!it.event_date) continue;
      const d = new Date(it.event_date);
      if (Number.isNaN(d.getTime())) continue;
      const key = dateKey(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    }
    return map;
  }, [items]);

  const cells = useMemo(() => {
    const first = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const last = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    const leadEmpty = first.getDay();
    const out = [];
    for (let i = 0; i < leadEmpty; i++) out.push(null);
    for (let d = 1; d <= last.getDate(); d++) {
      out.push(new Date(first.getFullYear(), first.getMonth(), d));
    }
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [currentMonth]);

  // Every upcoming item in the shown month, by day then time. Past days are
  // left out: the grid greys them, and a list that opens on last week reads
  // as stale.
  const monthItems = useMemo(() => {
    const out = [];
    for (const d of cells) {
      if (!d) continue;
      const key = dateKey(d);
      if (key < todayKey) continue;
      const dayItems = itemsByDate.get(key);
      if (!dayItems) continue;
      const sorted = [...dayItems].sort((a, b) =>
        (a.event_time || "").localeCompare(b.event_time || ""),
      );
      for (const it of sorted) out.push({ key, item: it });
    }
    return out;
  }, [cells, itemsByDate, todayKey]);

  const prevMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1),
    );
    setSelectedDate(null);
  };
  const nextMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1),
    );
    setSelectedDate(null);
  };

  const selectedKey = selectedDate ? dateKey(selectedDate) : null;

  const onDayClick = (d) => {
    const key = dateKey(d);
    if (key === selectedKey) {
      setSelectedDate(null);
      return;
    }
    setSelectedDate(d);
    // Phone: the list sits under the grid, so the tap has to bring it into
    // view. Desktop: the list is beside the grid; "nearest" moves it only
    // when the day's rows are off screen.
    const first = listRef.current?.querySelector(`[data-day="${key}"]`);
    first?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  };

  const monthLabel = formatEventDate(currentMonth, locale, {
    month: "long",
    year: "numeric",
  });
  const monthName = formatEventDate(currentMonth, locale, { month: "long" });

  return (
    <div className="md:grid md:grid-cols-[18.75rem_minmax(0,1fr)] md:gap-6 md:items-start">
      <div className="bg-background rounded-lg border border-border p-3 md:sticky md:top-24">
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={prevMonth}
            aria-label={t("previous_month")}
            className="min-w-touch min-h-touch flex items-center justify-center rounded-lg hover:bg-green-50 transition"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h3 className="font-headline-md text-lg font-bold text-text">
            {monthLabel}
          </h3>
          <button
            type="button"
            onClick={nextMonth}
            aria-label={t("next_month")}
            className="min-w-touch min-h-touch flex items-center justify-center rounded-lg hover:bg-green-50 transition"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div
          role="row"
          className="grid grid-cols-7 mb-1 text-center text-xs font-semibold text-fg-muted"
        >
          {DAY_KEYS.map((key) => (
            <div key={key} className="py-1.5" role="columnheader">
              {t(`days.${key}`)}
            </div>
          ))}
        </div>

        <div role="grid" aria-label={t("label")} className="grid grid-cols-7 gap-1">
          {cells.map((d, idx) => {
            if (!d) {
              return (
                <div key={`empty-${idx}`} className="min-h-touch" aria-hidden="true" />
              );
            }
            const key = dateKey(d);
            const count = itemsByDate.get(key)?.length ?? 0;
            const isToday = key === todayKey;
            const isPast = key < todayKey;
            const active = count > 0 && !isPast;
            const isSelected = key === selectedKey;

            const tone = isSelected
              ? "bg-green-100 text-primary font-bold ring-2 ring-primary"
              : active
                ? "bg-green-50 text-primary font-bold hover:bg-green-100"
                : isPast
                  ? "text-fg-muted opacity-50"
                  : "text-fg-muted";
            const todayRing = isToday && !isSelected ? " ring-2 ring-accent" : "";

            return (
              <button
                key={key}
                type="button"
                disabled={!active}
                onClick={() => onDayClick(d)}
                aria-pressed={isSelected ? "true" : "false"}
                aria-label={
                  active
                    ? `${formatEventDate(d, locale, LONG_DATE)}, ${t("events_count", { count })}`
                    : formatEventDate(d, locale, LONG_DATE)
                }
                data-has-events={active ? "true" : "false"}
                className={`min-h-touch rounded-lg flex flex-col items-center justify-center text-sm leading-none transition disabled:cursor-default ${tone}${todayRing}`}
              >
                <span>{d.getDate()}</span>
                {isToday && (
                  <span className="text-2xs font-semibold text-accent mt-0.5" data-testid="calendar-today-label">
                    {t("today")}
                  </span>
                )}
                {active && !isToday && (
                  <span className="flex gap-0.5 mt-1" aria-hidden="true" data-testid="calendar-day-dots">
                    {Array.from({ length: Math.min(count, MAX_DOTS) }, (_, i) => (
                      <span key={i} className="w-1 h-1 rounded-full bg-primary" />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div ref={listRef} className="mt-6 md:mt-0 min-w-0" data-testid="calendar-month-list">
        <h4 className="font-headline-md text-lg font-bold text-text mb-2">
          {t(kind === "experiences" ? "list_heading_experiences" : "list_heading", { month: monthName })}
        </h4>
        {monthItems.length === 0 ? (
          <p className="text-sm text-fg-muted py-4" data-testid="calendar-month-empty">
            {t(kind === "experiences" ? "empty_month_experiences" : "empty_month")}
          </p>
        ) : (
          <ul>
            {monthItems.map(({ key, item }) => (
              <li
                key={item.id}
                data-day={key}
                data-selected={key === selectedKey ? "true" : "false"}
                data-testid="calendar-list-item"
                className={`rounded-lg transition scroll-my-28 ${key === selectedKey ? "bg-green-50 ring-2 ring-primary" : ""}`}
              >
                {renderItem(item)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
