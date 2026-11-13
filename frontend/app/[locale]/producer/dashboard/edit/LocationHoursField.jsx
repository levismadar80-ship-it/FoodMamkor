"use client";

/**
 * Module:   LocationHoursField
 * Purpose:  The opening-hours picker of one location in the owner's
 *           LocationsEditor: seven day rows (א׳–ש׳), each with an open toggle
 *           and up to three time ranges. Writes the canonical string
 *           ("Sun-Thu 09:00-18:00, Fri 09:00-13:00") the public page reads.
 * Does NOT: save anything itself — the location form owns the request; this
 *           only reports a string and a validity flag upward. No special
 *           hours (SpecialHoursEditor), no "open 24h", no admin use (the admin
 *           ProducerForm keeps its text field).
 * Related:  lib/hours-serialize.js (daysFromString / serializeHours /
 *           dayIssues / canAddRange / nextRange — the model, used as-is);
 *           lib/hours.js parseHours (reads the stored value, incl. Hebrew since
 *           MEH-2803); OrderWindowEditor.jsx (the same row pattern for orders).
 * History:  MEH-2805 — replaces the free-text field. The row UI is restored
 *           from HoursEditor.jsx (MEH-1276 / MEH-1870), removed in MEH-2142
 *           (#3032, 6f8d70e8) when store hours moved to the primary location.
 *           Not a third day-row implementation: the same markup and the same
 *           hours-serialize model, moved to where the value now lives.
 *
 * DATA SAFETY — the stored value is never rewritten behind the owner's back.
 * `onChange` fires only after she touches the picker. Until then the location
 * form keeps the string it loaded, so saving another field (phone, label)
 * sends the hours back byte-identical — including a value the parser cannot
 * read, which is shown verbatim above the rows instead.
 */

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Warning, X } from "@phosphor-icons/react";

import { DAY_KEYS, parseHours } from "@/lib/hours";
import InlineMessage from "@/components/ui/InlineMessage";
import {
  canAddRange,
  dayIssues,
  daysFromString,
  nextRange,
  serializeHours,
} from "@/lib/hours-serialize";

// Shared by every time input: ≥44px tall (min-h-touch), numerals in reading
// order. REUSES: HoursEditor.jsx (6f8d70e8^) input class, plus the touch floor.
const TIME_INPUT_CLASS =
  "numeric min-h-touch text-sm border border-border rounded-sm px-2 py-1 bg-surface";

// MEH-2819: where these hours appear on the business page — by the location's
// kind, because the place really differs: the primary location feeds «שעות»
// (resolveStoreHours); a pickup point / market stall is listed under
// «איסוף עצמי» (DeliveryBlock PickupRow, any kind of those two); every other
// point shows them only in its map popup (MiniMap.jsx:209). Primary wins.
// One entry per kind in LocationInputSchema (lib/schemas.js) — pinned by
// LocationHoursField.test.jsx, so a new kind fails a test instead of silently
// inheriting the map-popup line.
export const WHERE_KEY_BY_KIND = Object.freeze({
  branch: "hours_where_map",
  pickup: "hours_where_pickup",
  market_stand: "hours_where_pickup",
});

// An unknown kind gets NO line: a wrong «where it appears» is worse than none.
function whereKey(isPrimary, kind) {
  if (isPrimary) return "hours_where_primary";
  return WHERE_KEY_BY_KIND[kind] ?? null;
}

export default function LocationHoursField({
  value,
  onChange,
  onValidityChange = () => {},
  isPrimary = false,
  kind = "branch",
}) {
  const t = useTranslations("dashboard.producer.order_window");
  const tForm = useTranslations("settings.locations.form");
  const tDays = useTranslations("opening_hours.weekdays");
  const tHours = useTranslations("opening_hours");

  // Seeded ONCE from the value the field opened with; the form re-mounts this
  // field per row. The note reads that same frozen value, not the live prop:
  // the first edit makes `value` canonical, and the old text must stay on
  // screen while the owner re-enters it below.
  const [stored] = useState(() => (typeof value === "string" ? value : ""));
  const [days, setDays] = useState(() => daysFromString(stored));
  const unreadable = useMemo(
    () => stored.trim() !== "" && parseHours(stored) === null,
    [stored],
  );

  const where = whereKey(isPrimary, kind);
  const issueByDay = new Map(dayIssues(days).map((issue) => [issue.index, issue.reason]));

  // Every edit goes through here: the new model, its canonical string upward,
  // and whether the form may save.
  const commit = (next) => {
    setDays(next);
    onChange(serializeHours(next));
    onValidityChange(dayIssues(next).length === 0);
  };

  const patchDay = (i, patch) => commit(days.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  const patchRange = (i, rangeIdx, patch) =>
    commit(
      days.map((d, idx) =>
        idx === i ? { ...d, ranges: d.ranges.map((r, ri) => (ri === rangeIdx ? { ...r, ...patch } : r)) } : d,
      ),
    );
  const addRange = (i) =>
    commit(
      days.map((d, idx) =>
        idx === i && canAddRange(d) ? { ...d, ranges: [...d.ranges, nextRange(d.ranges[d.ranges.length - 1])] } : d,
      ),
    );
  const removeRange = (i, rangeIdx) =>
    commit(
      days.map((d, idx) =>
        idx === i && d.ranges.length > 1 ? { ...d, ranges: d.ranges.filter((_, ri) => ri !== rangeIdx) } : d,
      ),
    );

  return (
    // A fieldset, not the editor's <Field>: that one wraps its children in a
    // <label>, and a label around 7 checkboxes + 14 inputs forwards clicks to
    // the first control.
    <fieldset className="text-xs" data-testid="location-hours">
      <legend className="mb-1 block font-medium text-fg-muted">{tForm("hours_label")}</legend>
      {where && (
        <p className="mb-2 text-2xs text-fg-muted" data-testid="location-hours-where">
          {tForm(where)}
        </p>
      )}

      {unreadable && (
        <p className="mb-2 flex items-start gap-1.5 text-xs text-text" role="status" data-testid="location-hours-unreadable">
          <Warning size={16} weight="fill" aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
          <span>{tForm("hours_unreadable", { value: stored })}</span>
        </p>
      )}

      <div className="space-y-2">
        {DAY_KEYS.map((key, i) => {
          const day = days[i];
          const issueReason = issueByDay.get(i);
          return (
            <div key={key} className="flex flex-wrap items-start gap-x-3 gap-y-1" data-testid={`location-hours-day-${i}`}>
              <label className="flex min-h-touch w-24 shrink-0 cursor-pointer items-center gap-2 text-sm text-text">
                <input
                  type="checkbox"
                  checked={day.open}
                  onChange={(e) => patchDay(i, { open: e.target.checked })}
                  className="h-4 w-4 accent-primary"
                  data-testid={`location-hours-open-${i}`}
                />
                <span>{tDays(key)}</span>
              </label>

              {day.open ? (
                <div className="flex flex-col gap-1.5">
                  {day.ranges.map((range, rangeIdx) => {
                    const nth = day.ranges.length > 1 ? ` ${rangeIdx + 1}` : "";
                    return (
                      <div key={rangeIdx} className="flex items-center gap-1">
                        {/* HH:MM–HH:MM reads left to right on the RTL page. rtl-ok */}
                        <div className="flex items-center gap-1.5" dir="ltr">
                          <input
                            type="time"
                            value={range.from}
                            onChange={(e) => patchRange(i, rangeIdx, { from: e.target.value })}
                            aria-label={`${tDays(key)} ${t("from_label")}${nth}`}
                            className={TIME_INPUT_CLASS}
                          />
                          <span aria-hidden="true" className="text-fg-muted">–</span>
                          <input
                            type="time"
                            value={range.to}
                            onChange={(e) => patchRange(i, rangeIdx, { to: e.target.value })}
                            aria-label={`${tDays(key)} ${t("to_label")}${nth}`}
                            className={TIME_INPUT_CLASS}
                          />
                        </div>
                        {day.ranges.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeRange(i, rangeIdx)}
                            aria-label={`${tDays(key)} — ${t("remove_range")}`}
                            data-testid={`location-hours-remove-${i}-${rangeIdx}`}
                            className="grid min-h-touch min-w-touch place-items-center text-fg-muted transition hover:text-text"
                          >
                            <X size={14} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {canAddRange(day) && (
                    <button
                      type="button"
                      onClick={() => addRange(i)}
                      data-testid={`location-hours-add-${i}`}
                      className="inline-flex min-h-touch items-center gap-1 self-start text-xs font-medium text-primary transition hover:text-primary-dark"
                    >
                      <Plus size={12} weight="bold" aria-hidden="true" />
                      {t("add_range")}
                    </button>
                  )}
                </div>
              ) : (
                <span className="flex min-h-touch items-center text-xs text-fg-muted">{tHours("closed_day")}</span>
              )}

              {issueReason && (
                <InlineMessage as="span" size="xs" className="w-full" data-testid={`location-hours-error-${i}`}>
                  {t(issueReason)}
                </InlineMessage>
              )}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
