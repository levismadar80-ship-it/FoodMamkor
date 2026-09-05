"use client";

/**
 * Module:   SpecialHoursEditor
 * Purpose:  Per-date overrides ABOVE the weekly order window — "ערב ראש השנה
 *           09:00–13:00", "כיפור: סגור" — for the producer dashboard. A list
 *           of date rows (date · closed/open · ranges · note) plus suggestion
 *           chips built from lib/holidays.js that ADD rows and never apply
 *           anything on their own (Sapir's ruling ב). Opt-in: a business that
 *           never touches it stores NULL and its public page shows nothing.
 * Does NOT: edit the weekly window (OrderWindowEditor.jsx) or store hours
 *           (LocationsEditor) — the override is order-axis only (ruling א).
 *           It does not derive "open now"; the public page owns that
 *           (lib/orderWindow.js). Past dates are not editable here: they are
 *           dropped on load and therefore on the next save (ruling ג).
 * Related:  frontend/lib/special-hours.js (rows ⇄ payload, issues, chips),
 *           edit/OrderWindowEditor.jsx (the row/save/dirty pattern this
 *           follows and whose range copy it reuses),
 *           backend/app/routers/producer_me.py (PUT /producers/me).
 * History:  MEH-2264 (MEH-1889 chunk B) — creation.
 */

import { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Warning, CheckCircle, Plus, X } from "@phosphor-icons/react";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { israelToday } from "@/lib/israel-date";
import { nextOrderRange, canAddOrderRange } from "@/lib/order-window";
import {
  MAX_SPECIAL_DATES,
  MAX_SPECIAL_NOTE_LENGTH,
  addHolidayRows,
  emptySpecialRow,
  holidayChips,
  rowsFromSpecialHours,
  serializeSpecialHours,
  specialHoursIssues,
} from "@/lib/special-hours";

export default function SpecialHoursEditor({ profile, onSave, reportDirty = () => {} }) {
  const t = useTranslations("dashboard.producer.special_hours");
  // Range mechanics and the save/revert buttons REUSE the order-window copy —
  // same nouns, same verbs, and one place to fix them.
  const tRange = useTranslations("dashboard.producer.order_window");
  const seed = profile?.special_hours ?? null;

  // "Today" is read once per mount, after mount: the editor is client-only
  // (the dashboard fetches the profile in the browser), and a stable value
  // keeps every derived list below consistent for the life of the form.
  const [today, setToday] = useState(null);
  useEffect(() => setToday(israelToday()), []);

  const seedRows = useMemo(
    () => (today ? rowsFromSpecialHours(seed, today) : []),
    [seed, today],
  );
  const seedPayload = useMemo(() => JSON.stringify(serializeSpecialHours(seedRows)), [seedRows]);
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Re-seed when the stored value (or the clock) changes under us.
  useEffect(() => {
    setRows(seedRows);
  }, [seedRows]);

  const current = serializeSpecialHours(rows);
  const dirty = JSON.stringify(current) !== seedPayload;
  const issues = today ? specialHoursIssues(rows, today) : [];
  const issueByRow = new Map(issues.map((issue) => [issue.index, issue.reason]));
  const chips = today ? holidayChips(rows, today) : [];
  const isEmpty = rows.length === 0;

  useEffect(() => {
    reportDirty("specialHours", dirty);
    return () => reportDirty("specialHours", false);
  }, [dirty, reportDirty]);

  const touch = () => {
    setSaved(false);
    setErrorMsg(null);
  };

  const patchRow = (i, patch) => {
    setRows((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
    touch();
  };

  const patchRange = (i, rangeIdx, patch) => {
    setRows((prev) =>
      prev.map((row, idx) =>
        idx === i
          ? {
              ...row,
              ranges: row.ranges.map((r, ri) => (ri === rangeIdx ? { ...r, ...patch } : r)),
            }
          : row,
      ),
    );
    touch();
  };

  const addRange = (i) => {
    setRows((prev) =>
      prev.map((row, idx) =>
        idx === i && canAddOrderRange(row)
          ? { ...row, ranges: [...row.ranges, nextOrderRange(row.ranges[row.ranges.length - 1])] }
          : row,
      ),
    );
    touch();
  };

  const removeRange = (i, rangeIdx) => {
    setRows((prev) =>
      prev.map((row, idx) =>
        idx === i && row.ranges.length > 1
          ? { ...row, ranges: row.ranges.filter((_, ri) => ri !== rangeIdx) }
          : row,
      ),
    );
    touch();
  };

  const addRow = () => {
    if (rows.length >= MAX_SPECIAL_DATES) return;
    setRows((prev) => [...prev, emptySpecialRow()]);
    touch();
  };

  const removeRow = (i) => {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
    touch();
  };

  const applyChip = (chip) => {
    if (chip.added) return;
    setRows((prev) => addHolidayRows(prev, chip).slice(0, MAX_SPECIAL_DATES));
    touch();
  };

  const revertChanges = () => {
    setRows(seedRows);
    setSaved(false);
    setErrorMsg(null);
  };

  const handleSave = async () => {
    if (issues.length > 0) {
      setErrorMsg(issues[0].reason === "invalid_date" ? t("invalid_date") : tRange(issues[0].reason));
      return;
    }
    setSaving(true);
    setSaved(false);
    setErrorMsg(null);
    try {
      const payload = { special_hours: current };
      await api.put("/producers/me", payload);
      onSave(payload);
      setSaved(true);
    } catch (error) {
      setErrorMsg(detailToMessage(error?.response?.data?.detail) || tRange("save_error"));
    } finally {
      setSaving(false);
    }
  };

  const reasonText = (reason) => (reason === "invalid_date" ? t("invalid_date") : tRange(reason));

  return (
    <div data-testid="special-hours-editor">
      {/* Honest empty state (ADR-014 voice, feminine like its OrderWindowEditor
          sibling) — the consequence, and the two ways in. */}
      {isEmpty && (
        <p className="mb-4 text-xs text-fg-muted" data-testid="special-hours-empty">
          {t("empty_state")}
        </p>
      )}

      {/* Suggestion chips (ruling ב): each ADDS closed rows for the holiday's
          dates, note prefilled. A chip whose dates are all present is shown
          taken, so the owner sees what she already covered. */}
      {chips.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="special-hours-chips">
          <span className="text-xs text-fg-muted">{t("chips_label")}</span>
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => applyChip(chip)}
              disabled={chip.added || saving}
              aria-pressed={chip.added}
              data-testid={`special-hours-chip-${chip.key}`}
              className="rounded-full border border-border px-3 py-1 text-xs text-text transition hover:border-primary disabled:cursor-default disabled:border-primary/40 disabled:bg-primary/10 disabled:text-primary-dark"
            >
              {chip.name}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {rows.map((row, i) => {
          const issueReason = issueByRow.get(i);
          return (
            <div
              key={row.id}
              className="rounded-md border border-border p-3"
              data-testid="special-hours-row"
              data-date={row.date || undefined}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <input
                  type="date"
                  value={row.date}
                  min={today ?? undefined}
                  onChange={(e) => patchRow(i, { date: e.target.value })}
                  aria-label={t("date_label")}
                  data-testid={`special-hours-date-${i}`}
                  className="numeric text-sm border border-border rounded-[8px] px-2 py-1 bg-surface"
                />
                <label className="flex items-center gap-2 text-sm cursor-pointer min-h-[34px]">
                  <input
                    type="checkbox"
                    checked={row.closed}
                    onChange={(e) => patchRow(i, { closed: e.target.checked })}
                    className="w-4 h-4 accent-primary"
                    data-testid={`special-hours-closed-${i}`}
                  />
                  <span>{t("closed_toggle")}</span>
                </label>
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  aria-label={`${row.date || t("date_label")} — ${t("remove_date")}`}
                  data-testid={`special-hours-remove-${i}`}
                  className="ms-auto text-fg-muted hover:text-error transition p-1"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>

              {!row.closed && (
                <div className="mt-2 flex flex-col gap-1.5">
                  {row.ranges.map((range, rangeIdx) => (
                    <div key={rangeIdx} className="flex items-center gap-2">
                      {/* Time range is inherently LTR numeric (HH:MM–HH:MM). rtl-ok */}
                      <div className="flex items-center gap-2" dir="ltr">
                        <input
                          type="time"
                          value={range.from}
                          onChange={(e) => patchRange(i, rangeIdx, { from: e.target.value })}
                          aria-label={`${row.date} ${tRange("from_label")} ${rangeIdx + 1}`}
                          className="numeric text-sm border border-border rounded-[8px] px-2 py-1 bg-surface"
                        />
                        <span aria-hidden="true" className="text-fg-muted">–</span>
                        <input
                          type="time"
                          value={range.to}
                          onChange={(e) => patchRange(i, rangeIdx, { to: e.target.value })}
                          aria-label={`${row.date} ${tRange("to_label")} ${rangeIdx + 1}`}
                          className="numeric text-sm border border-border rounded-[8px] px-2 py-1 bg-surface"
                        />
                      </div>
                      {row.ranges.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRange(i, rangeIdx)}
                          aria-label={`${row.date} — ${tRange("remove_range")}`}
                          data-testid={`special-hours-remove-range-${i}-${rangeIdx}`}
                          className="text-fg-muted hover:text-error transition p-1"
                        >
                          <X size={14} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  ))}
                  {canAddOrderRange(row) && (
                    <button
                      type="button"
                      onClick={() => addRange(i)}
                      data-testid={`special-hours-add-range-${i}`}
                      className="inline-flex items-center gap-1 self-start text-xs font-medium text-primary hover:text-primary-dark transition"
                    >
                      <Plus size={12} weight="bold" aria-hidden="true" />
                      {tRange("add_range")}
                    </button>
                  )}
                </div>
              )}

              <input
                type="text"
                value={row.note}
                maxLength={MAX_SPECIAL_NOTE_LENGTH}
                onChange={(e) => patchRow(i, { note: e.target.value })}
                aria-label={t("note_label")}
                placeholder={t("note_placeholder")}
                data-testid={`special-hours-note-${i}`}
                className="mt-2 w-full text-sm border border-border rounded-[8px] px-2 py-1 bg-surface"
              />

              {issueReason && (
                <span className="mt-1 block text-xs text-error" role="alert">
                  {reasonText(issueReason)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {rows.length < MAX_SPECIAL_DATES && (
        <button
          type="button"
          onClick={addRow}
          data-testid="special-hours-add-date"
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-dark transition"
        >
          <Plus size={12} weight="bold" aria-hidden="true" />
          {t("add_date")}
        </button>
      )}

      {errorMsg && (
        <p className="mt-4 flex items-center gap-1.5 text-xs text-error" role="alert">
          <Warning size={16} weight="fill" aria-hidden="true" className="shrink-0" />
          {errorMsg}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          data-testid="special-hours-save"
          className="bg-primary text-white px-4 py-2 rounded-[10px] text-sm font-medium hover:bg-primary-dark transition disabled:opacity-60"
        >
          {saving ? tRange("saving") : tRange("save_cta")}
        </button>
        {dirty && (
          <button
            type="button"
            onClick={revertChanges}
            disabled={saving}
            data-testid="special-hours-revert"
            className="border border-border text-fg-muted px-4 py-2 rounded-[10px] text-sm font-medium hover:border-primary hover:text-text transition disabled:opacity-60"
          >
            {tRange("revert_cta")}
          </button>
        )}
      </div>

      {saved && !errorMsg && (
        <p
          className="mt-3 flex items-center gap-1.5 text-xs text-primary"
          role="status"
          data-testid="special-hours-save-success"
        >
          <CheckCircle size={16} weight="fill" aria-hidden="true" className="shrink-0" />
          {t("save_success")}
        </p>
      )}
    </div>
  );
}
