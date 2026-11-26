"use client";
// @ts-check

/**
 * Module:   PageFillReview
 * Purpose:  The second half of «ספרו לנו על העסק» (MEH-3483): a draft of the
 *           page fields shown field by field, each with a checkbox, and the
 *           save of only what the owner left checked.
 * Touches:  PUT {saveUrl} · PUT /producers/me/locations/{id} (hours, owner
 *           only) · GET /categories (the names of drafted categories).
 * Does NOT: read text into a draft (PageFillPanel's box and the dashboard
 *           assistant, components/owner-assistant/, each ask the server for
 *           one) or decide what a row means (lib/page-fill.js).
 * Related:  components/PageFillPanel.jsx · components/owner-assistant/OwnerAssistantPanel.jsx
 * History:  MEH-3483 (inside PageFillPanel); owner assistant 26/11 (moved
 *           here so the assistant shows the same review, rule of two)
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { parseHours, DAY_KEYS } from "@/lib/hours";
import { buildRows, buildWrites, canSave, startsChecked } from "@/lib/page-fill";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import { showToast } from "@/lib/toast";
import Checkbox from "@/components/ui/Checkbox";

/**
 * One line per day; the ranges are LTR so «08:00–18:00» reads as written
 * (REUSES: app/[locale]/producer/[id]/components/OrderWindowStrip.jsx:321).
 * @param {string} raw @param {(k: string) => string} tDay
 * @returns {{ day: string, ranges: string }[]}
 */
function hoursLines(raw, tDay) {
  const map = parseHours(raw);
  if (!map) return [{ day: "", ranges: raw }];
  return Object.keys(map).map((i) => ({
    day: tDay(DAY_KEYS[Number(i)]),
    ranges: map[i].map((/** @type {any} */ r) => `${r.open}–${r.close}`).join(", "),
  }));
}

/** @param {{ lines: { day: string, ranges: string }[] }} props */
function HoursText({ lines }) {
  return lines.map(({ day, ranges }) => (
    <span key={day + ranges} className="block">
      {day} <span dir="ltr">{ranges}</span>
    </span>
  ));
}

/**
 * @param {{ row: import("@/lib/page-fill").FillRow, categoryNames: Map<number, string> }} props
 */
function RowValue({ row, categoryNames }) {
  const t = useTranslations("page_fill");
  const tDay = useTranslations("opening_hours.weekdays");
  if (row.key === "categories" || row.key === "delivery") {
    const names = row.key === "categories" ? row.value.map((/** @type {number} */ id) => categoryNames.get(id) ?? "") : row.value;
    return <p className="text-sm text-text">{names.filter(Boolean).join(" · ")}</p>;
  }
  if (row.key === "hours") {
    return <p className="text-sm text-text"><HoursText lines={hoursLines(row.value, tDay)} /></p>;
  }
  if (row.key === "primary_contact_method") {
    return <p className="text-sm text-text">{t(`methods.${row.value}`)}</p>;
  }
  // dir="auto": an @handle, a site or an email reads LTR inside the RTL page.
  return <p className="text-sm text-text whitespace-pre-line break-words"><span dir="auto">{row.value}</span></p>;
}

/**
 * @param {{ draft: any, profile: any, saveUrl: string, owner?: boolean,
 *   blocked?: boolean, onSaved: () => void, onBack?: () => void,
 *   backLabel?: string }} props
 *   blocked: another card on the page holds unsaved edits; saving here would
 *   reload the page's cards and drop them, so the save waits.
 */
export default function PageFillReview({ draft, profile, saveUrl, owner = true, blocked = false, onSaved, onBack, backLabel }) {
  const t = useTranslations("page_fill");
  const tDay = useTranslations("opening_hours.weekdays");
  const [rows] = useState(() => buildRows(draft, profile, { hours: owner }));
  const [checked, setChecked] = useState(() => new Set(rows.filter(startsChecked).map((r) => r.key)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [categoryNames, setCategoryNames] = useState(/** @type {Map<number, string>} */ (new Map()));

  useEffect(() => {
    if (categoryNames.size || !rows.some((r) => r.key === "categories")) return;
    api.get("/categories").then(
      (r) => setCategoryNames(new Map((r.data || []).map((/** @type {any} */ c) => [c.id, c.name]))),
      () => {},
    );
  }, [rows, categoryNames.size]);

  const save = async () => {
    const { producer, location } = buildWrites(rows.filter((r) => checked.has(r.key)), profile);
    setError("");
    setSaving(true);
    try {
      if (producer) await api.put(saveUrl, producer);
      if (location) await api.put(`/producers/me/locations/${location.id}`, { opening_hours: location.opening_hours });
      showToast.success(t("saved"));
      onSaved();
    } catch (err) {
      setError(detailToMessage(/** @type {any} */ (err)?.response?.data?.detail) || t("save_failed"));
    } finally {
      setSaving(false);
    }
  };

  const toggle = (/** @type {string} */ key) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const count = rows.filter((r) => canSave(r) && checked.has(r.key)).length;

  return (
    <div className="space-y-3" data-testid="page-fill-preview">
      <h3 className="font-bold text-text text-sm">{t("preview_title")}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-fg-muted" data-testid="page-fill-empty">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row.key} className="py-2 flex items-start gap-3" data-testid={`page-fill-row-${row.key}`}>
              {canSave(row) && (
                <Checkbox
                  className="shrink-0 self-start -my-2"
                  checked={checked.has(row.key)}
                  onChange={() => toggle(row.key)}
                  aria-label={t(`fields.${row.key}`)}
                />
              )}
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-xs font-bold text-fg-muted">{t(`fields.${row.key}`)}</p>
                <RowValue row={row} categoryNames={categoryNames} />
                {row.note && <p className="text-xs text-fg-muted">{t(row.note)}</p>}
                {row.replaces && (
                  <p className="text-xs text-fg-muted">
                    {t("replaces")} · {t("now", { value: row.key === "hours" ? hoursLines(row.current, tDay).map((l) => `${l.day} \u2066${l.ranges}\u2069`).join(", ") : String(row.current).slice(0, 80) })}
                  </p>
                )}
                {row.adds && <p className="text-xs text-fg-muted">{t("adds")}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && <InlineMessage tone="error" size="sm">{error}</InlineMessage>}
      {blocked && count > 0 && <InlineMessage tone="info" size="sm">{t("blocked")}</InlineMessage>}
      <div className="flex flex-wrap gap-2">
        {count > 0 && (
          <Button onClick={save} loading={saving} disabled={blocked} data-testid="page-fill-save">{t("save", { count })}</Button>
        )}
        {onBack && <Button variant="ghost" onClick={onBack}>{backLabel || t("back")}</Button>}
      </div>
    </div>
  );
}
