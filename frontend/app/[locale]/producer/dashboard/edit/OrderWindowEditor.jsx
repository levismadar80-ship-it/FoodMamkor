"use client";

/**
 * Module:   OrderWindowEditor
 * Purpose:  Weekly ORDER-acceptance window editor for the producer dashboard —
 *           7 day rows (א׳–ש׳), a per-day toggle plus open/close time inputs,
 *           and a "clear all" action that sends null. Opt-in: a business that
 *           never touches it stores NULL and its public page renders nothing.
 * Does NOT: edit opening_hours (store hours) — that is HoursEditor.jsx, a
 *           different column and a different meaning. It also does not derive
 *           "open now"; the public page owns that (MEH-1546).
 * Related:  frontend/lib/order-window.js (serializer + close>open mirror),
 *           edit/HoursEditor.jsx (the row/save/dirty pattern this follows),
 *           backend/app/routers/producer_me.py (PUT /producers/me).
 * History:  MEH-1544 — chunk 2/3 of חלון הזמנות.
 */

import { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Warning, CheckCircle, Plus, X } from "@phosphor-icons/react";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { DAY_KEYS } from "@/lib/hours";
import {
  daysFromOrderWindow,
  serializeOrderWindow,
  orderDayIssues,
  nextOrderRange,
  canAddOrderRange,
  MAX_ORDER_RANGES_PER_DAY,
} from "@/lib/order-window";

export default function OrderWindowEditor({
  profile,
  onSave,
  reportDirty = () => {},
}) {
  const t = useTranslations("dashboard.producer.order_window");
  const tDays = useTranslations("opening_hours.weekdays");
  const seed = profile?.order_window ?? null;

  const seedDays = useMemo(() => daysFromOrderWindow(seed), [seed]);
  // Compare serialized payloads, not row arrays — two different row models can
  // mean the same stored value (a closed row's times are ignored).
  const seedPayload = useMemo(() => JSON.stringify(serializeOrderWindow(seedDays)), [seedDays]);
  const [days, setDays] = useState(seedDays);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Re-seed when the parent profile changes under us (another card's save
  // patched it). Keyed on the stored value, so an unrelated re-render can't
  // clobber in-progress edits.
  useEffect(() => {
    setDays(daysFromOrderWindow(seed));
  }, [seed]);

  const current = serializeOrderWindow(days);
  const dirty = JSON.stringify(current) !== seedPayload;
  const issues = orderDayIssues(days);
  const issueByDay = new Map(issues.map((issue) => [issue.index, issue.reason]));
  const isEmpty = current === null;

  useEffect(() => {
    reportDirty("orderWindow", dirty);
    return () => reportDirty("orderWindow", false);
  }, [dirty, reportDirty]);

  const touch = () => {
    setSaved(false);
    setErrorMsg(null);
  };

  const patchDay = (i, patch) => {
    setDays((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
    touch();
  };

  // MEH-1869: range-level edits. Each returns a new ranges array rather than
  // mutating, so the serialize/dirty comparison above still sees a new value.
  const patchRange = (i, rangeIdx, patch) => {
    setDays((prev) =>
      prev.map((d, idx) =>
        idx === i
          ? {
              ...d,
              ranges: d.ranges.map((r, ri) => (ri === rangeIdx ? { ...r, ...patch } : r)),
            }
          : d,
      ),
    );
    touch();
  };

  const addRange = (i) => {
    setDays((prev) =>
      prev.map((d, idx) =>
        idx === i && canAddOrderRange(d)
          ? { ...d, ranges: [...d.ranges, nextOrderRange(d.ranges[d.ranges.length - 1])] }
          : d,
      ),
    );
    touch();
  };

  // The last range is never removable — a day that is open must keep one range.
  // Closing the day is what the checkbox is for, and leaving a rangeless open
  // row would serialize to a day key the backend rejects.
  const removeRange = (i, rangeIdx) => {
    setDays((prev) =>
      prev.map((d, idx) =>
        idx === i && d.ranges.length > 1
          ? { ...d, ranges: d.ranges.filter((_, ri) => ri !== rangeIdx) }
          : d,
      ),
    );
    touch();
  };

  // "נקי הכל" — closes all 7 rows, which serializes to null (the clear body).
  // Times are left untouched so a re-toggle restores them.
  const clearAll = () => {
    setDays((prev) => prev.map((d) => ({ ...d, open: false })));
    setSaved(false);
    setErrorMsg(null);
  };

  // MEH-1344 precedent (HoursEditor): explicit way back from an edit.
  const revertChanges = () => {
    setDays(daysFromOrderWindow(seed));
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
      const payload = { order_window: current };
      await api.put("/producers/me", payload);
      onSave(payload);
      // MEH-1270 pattern: keep the ✓ until the next edit.
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

      {/* Honest empty state (ADR-014 voice) — states the consequence, no
          pressure to fill it in. Shown whenever nothing is currently set. */}
      {isEmpty && (
        <p
          className="mb-4 text-xs text-fg-muted"
          data-testid="order-window-empty"
        >
          {t("empty_state")}
        </p>
      )}

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
                  aria-label={`${tDays(key)} — ${t("toggle_label")}`}
                />
                <span>{tDays(key)}</span>
              </label>

              {day.open ? (
                // MEH-1869: a day holds up to MAX_ORDER_RANGES_PER_DAY ranges
                // (lunch break, Friday morning + מוצ"ש), stacked vertically.
                <div className="flex flex-col gap-1.5">
                  {day.ranges.map((range, rangeIdx) => (
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
                          aria-label={`${tDays(key)} ${t("from_label")} ${rangeIdx + 1}`}
                          className="numeric text-sm border border-border rounded-[8px] px-2 py-1 bg-surface"
                        />
                        <span aria-hidden="true" className="text-fg-muted">–</span>
                        <input
                          type="time"
                          value={range.to}
                          onChange={(e) => patchRange(i, rangeIdx, { to: e.target.value })}
                          aria-label={`${tDays(key)} ${t("to_label")} ${rangeIdx + 1}`}
                          className="numeric text-sm border border-border rounded-[8px] px-2 py-1 bg-surface"
                        />
                      </div>
                      {day.ranges.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRange(i, rangeIdx)}
                          aria-label={`${tDays(key)} — ${t("remove_range")}`}
                          data-testid={`order-window-remove-${i}-${rangeIdx}`}
                          className="text-fg-muted hover:text-red-600 transition p-1"
                        >
                          <X size={14} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  ))}

                  {canAddOrderRange(day) && (
                    <button
                      type="button"
                      onClick={() => addRange(i)}
                      data-testid={`order-window-add-range-${i}`}
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

      <div className="mt-4 flex flex-wrap items-center gap-3">
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
            data-testid="order-window-revert"
            className="border border-border text-fg-muted px-4 py-2 rounded-[10px] text-sm font-medium hover:border-primary hover:text-text transition disabled:opacity-60"
          >
            {t("revert_cta")}
          </button>
        )}
        {!isEmpty && (
          <button
            type="button"
            onClick={clearAll}
            disabled={saving}
            data-testid="order-window-clear"
            className="text-xs font-medium text-primary underline underline-offset-2 hover:text-primary-dark transition disabled:opacity-60"
          >
            {t("clear_cta")}
          </button>
        )}
      </div>

      {/* MEH-1270 persistent success confirmation (single live region). */}
      {saved && !errorMsg && (
        <p
          className="mt-3 flex items-center gap-1.5 text-xs text-primary"
          role="status"
          data-testid="order-window-save-success"
        >
          <CheckCircle size={16} weight="fill" aria-hidden="true" className="shrink-0" />
          {t("save_success")}
        </p>
      )}
    </div>
  );
}
