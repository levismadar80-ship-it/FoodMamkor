"use client";

import { useMemo, useState } from "react";
import { CaretDown, CaretUp, Clock } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

import { DAY_ABBR, DAY_KEYS, parseHours } from "@/lib/hours";

// MEH-826: the parser + Israel-tz status were extracted to lib/hours so the
// compact /map card shares one parser instead of duplicating it.
//
// MEH-1334 chunk 3 (Quiet Direction v3): redesigned from the always-expanded
// section with a green open/closed status line into the approved collapsed
// disclosure — "היום · 9:00–17:00" in NEUTRAL ink (no dot, no status color,
// no word "פתוח"), tap to expand the weekly table. The header's order status
// is the page's single green (revision-2 blocker 2); physical opening hours
// carry no status treatment here. computeStatus stays in lib/hours for the
// /map card — this component no longer calls it.
//
// Renders WITHOUT its own <section>/heading — it now lives inside the merged
// "הגעה ומיקום" location section (ProducerSections owns the heading).

/** Israel-tz index of today in DAY_ABBR (same idiom as the pre-1334 table). */
function todayIndex() {
  const abbr = new Date()
    .toLocaleString("en-US", { timeZone: "Asia/Jerusalem", weekday: "short" });
  return DAY_ABBR.findIndex((d) => abbr.startsWith(d));
}

/**
 * "09:00–13:00, 16:00–19:00" — an en-dash inside a range, a comma between
 * ranges. The whole string renders inside a dir="ltr" span, so the reading
 * order of the numerals is preserved on the RTL page.
 */
function formatRanges(ranges) {
  return ranges.map((r) => `${r.open}–${r.close}`).join(", ");
}

export default function OpeningHours({ opening_hours }) {
  const t = useTranslations("opening_hours");
  const map = useMemo(() => parseHours(opening_hours), [opening_hours]);
  const [expanded, setExpanded] = useState(false);

  if (!map) return null;

  const todayIdx = todayIndex();
  // MEH-1870: a day carries a LIST of ranges. Several ranges render
  // comma-separated ("09:00–13:00, 16:00–19:00"); one range is byte-identical
  // to what this rendered before.
  const today = map[todayIdx];

  return (
    <div className="border border-border rounded-md bg-white mb-3 overflow-hidden">
      {/* Collapsed row — today only, neutral text. Every time range is
          dir="ltr" (start on the left — ReviewsSection precedent). */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        data-testid="hours-toggle"
        className="flex items-center gap-2 w-full min-h-[44px] px-3.5 py-2.5 text-start text-sm text-text focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
      >
        <Clock size={16} className="text-primary-dark shrink-0" aria-hidden="true" />
        <span>
          {t("today")} ·{" "}
          {today?.length ? (
            <span dir="ltr">{formatRanges(today)}</span>
          ) : (
            t("closed_day")
          )}
        </span>
        <span className="ms-auto text-fg-muted" aria-hidden="true">
          {expanded ? <CaretUp size={14} /> : <CaretDown size={14} />}
        </span>
      </button>

      {/* Expanded weekly table — today's row is highlighted via font-weight
          ONLY (no third green on the page). */}
      {expanded && (
        <div className="border-t border-border px-3.5 py-2" data-testid="hours-week">
          {DAY_ABBR.map((abbr, i) => {
            const hours = map[i];
            const isToday = i === todayIdx;
            return (
              <div
                key={abbr}
                className={`flex justify-between text-[13px] py-1.5 ${
                  isToday ? "font-semibold text-text" : "text-fg-muted"
                }`}
              >
                <span>{t(`weekdays.${DAY_KEYS[i]}`)}</span>
                {hours?.length ? (
                  <span dir="ltr">{formatRanges(hours)}</span>
                ) : (
                  <span>{t("closed_day")}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
