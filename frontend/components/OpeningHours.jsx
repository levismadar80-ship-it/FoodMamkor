"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { DAY_ABBR, DAY_KEYS, parseHours, computeStatus } from "@/lib/hours";

// MEH-826: the parser + Israel-tz status were extracted to lib/hours so the
// compact /map card shares one parser instead of duplicating it. This
// component renders the full detail-page section (status line + day table).

export default function OpeningHours({ opening_hours }) {
  const t = useTranslations("opening_hours");
  const map = useMemo(() => parseHours(opening_hours), [opening_hours]);
  const status = useMemo(() => (map ? computeStatus(map) : null), [map]);

  if (!map) return null;

  return (
    <section className="mt-8 border-t border-border pt-8">
      <h2 className="font-headline-md text-2xl font-bold text-text mb-4">{t("heading")}</h2>

      {/* Open / closed indicator */}
      {status && (
        <div className="flex items-center gap-2 mb-4 text-sm font-medium">
          <span
            // MEH-991 (BIZ-15): S6 palette has zero red — closed state recedes
            // to fg-muted, not raw #A32D2D. Open stays brand green.
            className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${status.isOpen ? "bg-primary" : "bg-fg-muted"}`}
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
            <span className="text-fg-muted">
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
              className={`flex justify-between text-sm py-1.5 ${isToday ? "font-semibold text-text" : "text-text/80"}`}
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
