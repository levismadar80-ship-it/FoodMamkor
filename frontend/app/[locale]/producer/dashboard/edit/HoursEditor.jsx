"use client";

/**
 * Module:   HoursEditor
 * Purpose:  Structured Hebrew opening-hours editor for the producer dashboard —
 *           7 day rows (א׳–ש׳), open/closed toggle + up to MAX_RANGES_PER_DAY
 *           ranges per open day (two time inputs each), a one-click preset, and
 *           a serializer that writes the canonical string
 *           ("Sun-Thu 09:00-18:00, Fri 09:00-13:00 16:00-19:00" — a space
 *           separates ranges inside a day, a comma separates day groups).
 *           Replaces the MEH-1242 PR5 free-text field that expected the
 *           machine format.
 * Does NOT: change storage/API/parseHours — it only builds the string via
 *           lib/hours-serialize and PUTs /producers/me. Consumer display
 *           (OpeningHours.jsx / MapProducerCard) is untouched.
 * Related:  frontend/lib/hours-serialize.js (serializer + compression),
 *           frontend/lib/hours.js (parseHours + DAY_KEYS, read-only here),
 *           edit/cards.jsx HoursCard (thin wrapper), edit/cards.jsx LicenseCard
 *           (MEH-1270 persistent-✓ save pattern this mirrors).
 * History:  MEH-1276 — Google-Business-Profile-style structured editor;
 *           MEH-1344 — revert-to-saved affordance; MEH-1403 — preset became
 *           a labeled two-way toggle (apply ⇄ clear all 7 days);
 *           MEH-1870 — several ranges per day (lunch break), add/remove row.
 */

import { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Warning, CheckCircle, Plus, X } from "@phosphor-icons/react";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { parseHours, DAY_KEYS } from "@/lib/hours";
import {
  daysFromString,
  serializeHours,
  dayIssues,
  nextRange,
  canAddRange,
  MAX_RANGES_PER_DAY,
} from "@/lib/hours-serialize";

// Preset: א׳–ה׳ 09:00–18:00, ו׳ 09:00–14:00, ש׳ closed. Zero-padded so the
// serialized output matches parseHours' \d{2}:\d{2} axis.
function presetDays() {
  return DAY_KEYS.map((_, i) => {
    if (i <= 4) return { open: true, ranges: [{ from: "09:00", to: "18:00" }] };
    if (i === 5) return { open: true, ranges: [{ from: "09:00", to: "14:00" }] };
    return { open: false, ranges: [{ from: "09:00", to: "17:00" }] };
  });
}

export default function HoursEditor({ profile, onSave, reportDirty = () => {} }) {
  const t = useTranslations("dashboard.producer.hours");
  const tDays = useTranslations("opening_hours.weekdays");
  const seed = profile?.opening_hours ?? "";

  const seedDays = useMemo(() => daysFromString(seed), [seed]);
  const seedStr = useMemo(() => serializeHours(seedDays), [seedDays]);
  const [days, setDays] = useState(seedDays);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Re-seed if the parent profile string changes under us (e.g. another card's
  // save patched the profile). Keyed on the canonical seed so an unrelated
  // re-render doesn't clobber in-progress edits.
  useEffect(() => {
    setDays(daysFromString(seed));
  }, [seed]);

  const current = serializeHours(days);
  const dirty = current !== seedStr;

  // MEH-1403: preset is now a labeled two-way toggle (mirrors the
  // CitiesAutocomplete region-chip pattern, CitiesAutocomplete.jsx:104-116).
  // presetApplied is a pure string compare — when the current model already
  // serializes to the preset, the button flips to a "clear the hours" action.
  const presetStr = useMemo(() => serializeHours(presetDays()), []);
  const presetApplied = current === presetStr;
  useEffect(() => {
    reportDirty("hours", dirty);
    return () => reportDirty("hours", false);
  }, [dirty, reportDirty]);

  // Existing value present but the parser doesn't recognise it → warn and start
  // from an empty editor. The original string is NOT discarded until an explicit
  // save (dirty stays true, but seed is only overwritten by handleSave).
  const unparseable = seed.trim() !== "" && parseHours(seed) === null;
  const issues = dayIssues(days);
  const issueByDay = new Map(issues.map((issue) => [issue.index, issue.reason]));

  // MEH-1870: range-level edits. Each returns a new ranges array rather than
  // mutating, so the serialize/dirty comparison still sees a new value.
  const patchRange = (i, rangeIdx, patch) => {
    setDays((prev) =>
      prev.map((d, idx) =>
        idx === i
          ? { ...d, ranges: d.ranges.map((r, ri) => (ri === rangeIdx ? { ...r, ...patch } : r)) }
          : d,
      ),
    );
    setSaved(false);
    setErrorMsg(null);
  };

  const addRange = (i) => {
    setDays((prev) =>
      prev.map((d, idx) =>
        idx === i && canAddRange(d)
          ? { ...d, ranges: [...d.ranges, nextRange(d.ranges[d.ranges.length - 1])] }
          : d,
      ),
    );
    setSaved(false);
    setErrorMsg(null);
  };

  // The last range is never removable — an open day must keep one. Closing the
  // day is what the checkbox is for.
  const removeRange = (i, rangeIdx) => {
    setDays((prev) =>
      prev.map((d, idx) =>
        idx === i && d.ranges.length > 1
          ? { ...d, ranges: d.ranges.filter((_, ri) => ri !== rangeIdx) }
          : d,
      ),
    );
    setSaved(false);
    setErrorMsg(null);
  };

  const patchDay = (i, patch) => {
    setDays((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
    setSaved(false);
    setErrorMsg(null);
  };

  const applyPreset = () => {
    setDays(presetDays());
    setSaved(false);
    setErrorMsg(null);
  };

  // MEH-1403: the "applied" half of the preset toggle — closes all 7 days
  // ({ open: false }) while leaving each row's from/to untouched, so a
  // re-toggle restores the same times. All-closed serializes to "" (≠ the
  // preset string), so the button label flips straight back to the preset CTA.
  const clearHours = () => {
    setDays((prev) => prev.map((d) => ({ ...d, open: false })));
    setSaved(false);
    setErrorMsg(null);
  };

  // MEH-1344: revert-to-saved — the preset (and any edit) had no way back
  // short of manually re-toggling 7 day rows. Mirrors the GBP pattern of an
  // explicit Cancel next to Save. Restores the last-saved seed; rendered
  // only while dirty, so it can never clobber a clean editor.
  const revertChanges = () => {
    setDays(daysFromString(seed));
    setSaved(false);
    setErrorMsg(null);
  };

  const handleSave = async () => {
    if (issues.length > 0) {
      // Name the actual problem: the row already says "overlap" or
      // "close before open", and a fixed top-level string would contradict it.
      setErrorMsg(t(issues[0].reason));
      return;
    }
    setSaving(true);
    setSaved(false);
    setErrorMsg(null);
    try {
      const payload = { opening_hours: current || null };
      await api.put("/producers/me", payload);
      onSave(payload);
      // MEH-1270 pattern: persist the ✓ until the next edit (a 3s auto-hide made
      // a real save read as a failure).
      setSaved(true);
    } catch (err) {
      setErrorMsg(detailToMessage(err?.response?.data?.detail) || t("save_error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <p className="text-xs text-fg-muted mb-4">{t("subtitle")}</p>

      {/* MEH-1884: empty-state incentive. Gated on the SAVED seed, not the
          in-progress model, so it names the mechanic while there is still
          nothing to lose and disappears once hours are saved. Mechanics only —
          it states where the value goes (business page + the JSON-LD
          openingHoursSpecification, lib/seo.js:288-291) and promises no
          ranking effect. Mirrors the order_window sibling's empty_state. */}
      {seed.trim() === "" && (
        <p className="text-xs text-fg-muted mb-4" data-testid="hours-empty-hint">
          {t("hours_empty_hint")}
        </p>
      )}

      {unparseable && (
        <p
          className="mb-4 flex items-start gap-1.5 text-xs text-amber-600"
          role="status"
        >
          <Warning size={16} weight="fill" aria-hidden="true" className="shrink-0 mt-0.5" />
          {t("unparseable")}
        </p>
      )}

      <button
        type="button"
        onClick={presetApplied ? clearHours : applyPreset}
        aria-pressed={presetApplied}
        data-testid="hours-preset-toggle"
        className="mb-4 text-xs font-medium text-primary underline underline-offset-2 hover:text-primary-dark transition"
      >
        {presetApplied ? t("clear_cta") : t("preset")}
      </button>

      <div className="space-y-2.5">
        {DAY_KEYS.map((key, i) => {
          const day = days[i];
          const issueReason = issueByDay.get(i);
          return (
            <div key={key} className="flex flex-wrap items-start gap-x-3 gap-y-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer w-28 shrink-0 min-h-[34px]">
                <input
                  type="checkbox"
                  checked={day.open}
                  onChange={(e) => patchDay(i, { open: e.target.checked })}
                  className="w-4 h-4 accent-primary"
                  aria-label={`${tDays(key)} — ${day.open ? t("toggle_open") : t("toggle_closed")}`}
                />
                <span>{tDays(key)}</span>
              </label>

              {day.open ? (
                // MEH-1870: a day holds up to MAX_RANGES_PER_DAY ranges
                // (lunch break, Friday morning + מוצ"ש), stacked vertically.
                <div className="flex flex-col gap-1.5">
                  {day.ranges.map((range, rangeIdx) => {
                    // Number the inputs ONLY when the day actually has more
                    // than one range — on the common single-range day the
                    // label stays exactly what it has always been.
                    const nth = day.ranges.length > 1 ? ` ${rangeIdx + 1}` : "";
                    return (
                    // Index key: rows are positional, carry no identity, and
                    // cannot be reordered (ranges stay sorted by construction).
                    <div key={rangeIdx} className="flex items-center gap-2">
                      {/* Time range is inherently LTR numeric (HH:MM–HH:MM);
                          dir="ltr" keeps the two inputs in reading order on the
                          RTL page. rtl-ok */}
                      <div className="flex items-center gap-2" dir="ltr">
                        <input
                          type="time"
                          value={range.from}
                          onChange={(e) => patchRange(i, rangeIdx, { from: e.target.value })}
                          aria-label={`${tDays(key)} ${t("from_label")}${nth}`}
                          className="numeric text-sm border border-border rounded-[8px] px-2 py-1 bg-surface"
                        />
                        <span aria-hidden="true" className="text-fg-muted">–</span>
                        <input
                          type="time"
                          value={range.to}
                          onChange={(e) => patchRange(i, rangeIdx, { to: e.target.value })}
                          aria-label={`${tDays(key)} ${t("to_label")}${nth}`}
                          className="numeric text-sm border border-border rounded-[8px] px-2 py-1 bg-surface"
                        />
                      </div>
                      {day.ranges.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRange(i, rangeIdx)}
                          aria-label={`${tDays(key)} — ${t("remove_range")}`}
                          data-testid={`hours-remove-${i}-${rangeIdx}`}
                          className="text-fg-muted hover:text-red-600 transition p-1"
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
                      data-testid={`hours-add-range-${i}`}
                      className="inline-flex items-center gap-1 self-start text-xs font-medium text-primary hover:text-primary-dark transition"
                    >
                      <Plus size={12} weight="bold" aria-hidden="true" />
                      {t("add_range")}
                    </button>
                  )}
                </div>
              ) : (
                <span className="text-xs text-fg-muted min-h-[34px] flex items-center">
                  {t("toggle_closed")}
                </span>
              )}

              {issueReason && (
                <span className="w-full text-xs text-red-600" role="alert">
                  {t(issueReason)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {errorMsg && (
        <p className="mt-4 flex items-center gap-1.5 text-xs text-red-600" role="alert">
          <Warning size={16} weight="fill" aria-hidden="true" className="shrink-0" />
          {errorMsg}
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="bg-primary text-white px-4 py-2 rounded-[10px] text-sm font-medium hover:bg-primary-dark transition disabled:opacity-60"
        >
          {saving ? t("saving") : t("save_cta")}
        </button>
        {dirty && (
          <button
            type="button"
            onClick={revertChanges}
            disabled={saving}
            data-testid="hours-revert"
            className="border border-border text-fg-muted px-4 py-2 rounded-[10px] text-sm font-medium hover:border-primary hover:text-text transition disabled:opacity-60"
          >
            {t("revert_cta")}
          </button>
        )}
      </div>

      {/* MEH-1270 persistent success confirmation (single live region). */}
      {saved && !errorMsg && (
        <p
          className="mt-3 flex items-center gap-1.5 text-xs text-primary"
          role="status"
          data-testid="hours-save-success"
        >
          <CheckCircle size={16} weight="fill" aria-hidden="true" className="shrink-0" />
          {t("save_success")}
        </p>
      )}
    </div>
  );
}
