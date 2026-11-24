"use client";
// @ts-check

/**
 * Module:   PageFillPanel
 * Purpose:  «ספרו לנו על העסק» (MEH-3483). The owner writes about her business
 *           in her own words; Claude drafts the page fields; she sees what
 *           changes field by field and saves only what she leaves checked.
 *           Menu photos are read on the same screen by MenuImport, whose
 *           products she approves separately.
 * Touches:  POST {readUrl} (no save) · PUT {saveUrl} ·
 *           PUT /producers/me/locations/{id} (hours, owner only) · GET /categories.
 * Does NOT: decide what a row means (lib/page-fill.js) or validate a write
 *           (the server does, the same as the edit cards).
 * Placement: the top of the edit hub, above the group tiles (MEH-3483 study in
 *           the PR): one entry for the whole page, the same place the owner
 *           fills it by hand.
 * History:  MEH-3483 (creation)
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { NotePencil } from "@phosphor-icons/react";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { parseHours, DAY_KEYS } from "@/lib/hours";
import { buildRows, buildWrites, canSave, startsChecked } from "@/lib/page-fill";
import Button from "@/components/ui/Button";
import Textarea from "@/components/ui/Textarea";
import InlineMessage from "@/components/ui/InlineMessage";
import { showToast } from "@/lib/toast";
import MenuImport from "@/components/MenuImport";
import { ReadMyPageTextProducersMePageFillReadPostResponse as PageFillOut } from "@/lib/generated/api.zod";
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
 * @param {{ profile: any, readUrl: string, saveUrl: string, owner?: boolean,
 *   blocked?: boolean, onSaved: () => void }} props
 *   blocked: another card on the page holds unsaved edits; saving here would
 *   reload the page's cards and drop them, so the save waits.
 *   owner: the owner's own page — hours go to her primary location and menu
 *   photos can be read here; false on the admin page.
 */
export default function PageFillPanel({ profile, readUrl, saveUrl, owner = true, blocked = false, onSaved }) {
  const t = useTranslations("page_fill");
  const tDay = useTranslations("opening_hours.weekdays");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState(/** @type {"write"|"reading"|"preview"|"saving"} */ ("write"));
  const [rows, setRows] = useState(/** @type {import("@/lib/page-fill").FillRow[]} */ ([]));
  const [checked, setChecked] = useState(/** @type {Set<string>} */ (new Set()));
  const [error, setError] = useState("");
  const [categoryNames, setCategoryNames] = useState(/** @type {Map<number, string>} */ (new Map()));

  useEffect(() => {
    if (phase !== "preview" || categoryNames.size) return;
    api.get("/categories").then(
      (r) => setCategoryNames(new Map((r.data || []).map((/** @type {any} */ c) => [c.id, c.name]))),
      () => {},
    );
  }, [phase, categoryNames.size]);

  const read = async () => {
    setError("");
    setPhase("reading");
    try {
      const res = await api.post(readUrl, { text });
      // Rule 19: parse before use; the admin twin returns the same shape.
      const parsed = PageFillOut.safeParse(res.data);
      if (!parsed.success) throw new Error("shape");
      const found = buildRows(parsed.data.draft, profile, { hours: owner });
      setRows(found);
      setChecked(new Set(found.filter(startsChecked).map((r) => r.key)));
      setPhase("preview");
    } catch (err) {
      setError(detailToMessage(/** @type {any} */ (err)?.response?.data?.detail) || t("failed"));
      setPhase("write");
    }
  };

  const save = async () => {
    const { producer, location } = buildWrites(rows.filter((r) => checked.has(r.key)), profile);
    setError("");
    setPhase("saving");
    try {
      if (producer) await api.put(saveUrl, producer);
      if (location) await api.put(`/producers/me/locations/${location.id}`, { opening_hours: location.opening_hours });
      showToast.success(t("saved"));
      // Back to the closed card: the host reloads the business, and a host
      // that does not remount this panel (admin) must not keep a stale preview.
      setRows([]);
      setText("");
      setPhase("write");
      setOpen(false);
      onSaved();
    } catch (err) {
      setError(detailToMessage(/** @type {any} */ (err)?.response?.data?.detail) || t("save_failed"));
      setPhase("preview");
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
    <section data-testid="page-fill" className="rounded-lg border border-border bg-surface p-4 space-y-3">
      <div className="flex items-start gap-3">
        <NotePencil size={24} aria-hidden="true" className="shrink-0 text-primary mt-0.5" />
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-text">{t("title")}</h2>
          <p className="text-sm text-fg-muted">{t("intro")}</p>
        </div>
      </div>
      {!open ? (
        <Button variant="outlined" onClick={() => setOpen(true)} data-testid="page-fill-open">{t("open")}</Button>
      ) : phase === "write" || phase === "reading" ? (
        <div className="space-y-3">
          <Textarea
            label={t("label")}
            placeholder={t("placeholder")}
            rows={6}
            maxLength={6000}
            value={text}
            onChange={(/** @type {any} */ e) => setText(e.target.value)}
            data-testid="page-fill-text"
          />
          {error && <InlineMessage tone="error" size="sm">{error}</InlineMessage>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={read} loading={phase === "reading"} disabled={text.trim().length < 20} data-testid="page-fill-read">
              {phase === "reading" ? t("reading") : t("read")}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
          </div>
        </div>
      ) : (
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
                      className="shrink-0 -my-2.5"
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
              <Button onClick={save} loading={phase === "saving"} disabled={blocked} data-testid="page-fill-save">{t("save", { count })}</Button>
            )}
            <Button variant="ghost" onClick={() => setPhase("write")}>{t("back")}</Button>
          </div>
        </div>
      )}
      {open && owner && (
        <div className="border-t border-border pt-3 space-y-1" data-testid="page-fill-menu">
          <h3 className="font-bold text-text text-sm">{t("menu_title")}</h3>
          <p className="text-xs text-fg-muted">{t("menu_hint")}</p>
          <MenuImport productCount={profile?.products?.length ?? 0} onPublished={onSaved} />
        </div>
      )}
    </section>
  );
}
