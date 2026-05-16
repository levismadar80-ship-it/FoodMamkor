"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

const HEBREW_DAY_NAMES = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatTime(t) {
  if (!t) return "";
  return t.slice(0, 5);
}

function formatHebrewDate(date) {
  return date.toLocaleDateString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export default function CalendarView({ items, linkPrefix }) {
  const t = useTranslations("events.calendar");
  const today = useMemo(() => new Date(), []);
  const [currentMonth, setCurrentMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [selectedDate, setSelectedDate] = useState(null);

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

  const monthLabel = currentMonth.toLocaleDateString("he-IL", {
    month: "long",
    year: "numeric",
  });
  const selectedItems = selectedDate
    ? itemsByDate.get(dateKey(selectedDate)) || []
    : [];

  return (
    <div className="bg-background rounded-[16px] border border-border p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={prevMonth}
          aria-label={t("previous_month")}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-light transition"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h3 className="font-headline text-lg md:text-xl font-bold text-site-text">
          {monthLabel}
        </h3>
        <button
          type="button"
          onClick={nextMonth}
          aria-label={t("next_month")}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-light transition"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div
        role="row"
        className="grid grid-cols-7 mb-2 text-center text-xs font-semibold text-site-muted"
      >
        {HEBREW_DAY_NAMES.map((name) => (
          <div key={name} className="py-2" role="columnheader">
            {name}
          </div>
        ))}
      </div>

      <div role="grid" aria-label={t("label")} className="grid grid-cols-7 gap-1">
        {cells.map((d, idx) => {
          if (!d) {
            return (
              <div key={`empty-${idx}`} className="aspect-square" aria-hidden="true" />
            );
          }
          const key = dateKey(d);
          const hasEvents = itemsByDate.has(key);
          const isToday = sameDay(d, today);
          const isSelected = selectedDate && sameDay(d, selectedDate);

          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedDate(d)}
              aria-pressed={isSelected ? "true" : "false"}
              aria-label={d.toLocaleDateString("he-IL", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
              className={`aspect-square min-h-[44px] rounded-lg flex flex-col items-center justify-center text-sm transition ${
                isSelected
                  ? "bg-primary text-white"
                  : isToday
                    ? "ring-2 ring-primary text-site-text"
                    : "text-site-text hover:bg-light"
              }`}
            >
              <span>{d.getDate()}</span>
              {hasEvents && (
                <span
                  className={`w-1.5 h-1.5 rounded-full mt-1 ${
                    isSelected ? "bg-white" : "bg-primary"
                  }`}
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <div className="mt-6 pt-6 border-t border-border" data-testid="calendar-day-expansion">
          <div className="flex items-baseline justify-between mb-3">
            <h4 className="font-headline text-lg font-bold text-site-text">
              {formatHebrewDate(selectedDate)}
            </h4>
            <span className="text-sm text-site-muted">
              {t("events_count", { count: selectedItems.length })}
            </span>
          </div>
          {selectedItems.length > 0 && (
            <ul className="space-y-2">
              {selectedItems.map((it) => (
                <li key={it.id}>
                  <Link
                    href={`${linkPrefix}/${it.id}`}
                    className="block rounded-lg border border-border p-3 hover:bg-light transition"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-site-text truncate">
                        {it.title}
                      </span>
                      {it.event_time && (
                        <span className="text-sm text-site-muted shrink-0">
                          {formatTime(it.event_time)}
                        </span>
                      )}
                    </div>
                    {it.city && (
                      <p className="text-sm text-site-muted mt-1">{it.city}</p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
