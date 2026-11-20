// @ts-check
"use client";
/**
 * Module:   ProductGroupSuggest
 * Purpose:  «הצעת קבוצות» inside the organizer (MEH-3478): asks the server for
 *           a group per product that has none, shows the suggestion as a
 *           preview the owner edits (rename a new group, move or take out a
 *           product, drop a group), and hands the edited result to the
 *           organizer on «שמירת הקבוצות». Nothing is saved before that.
 * Touches:  POST {basePath}/product-groups/suggest only. Saving and undo are
 *           the organizer's (ProductOrganizer.jsx `applySuggestion`).
 * Does NOT: rename a group the business already has — an existing group in
 *           the suggestion is shown by name, not as a field.
 * History:  MEH-3478 (creation)
 */
import { useState } from "react";
import { Trash } from "@phosphor-icons/react";
import api from "@/lib/api";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import InlineMessage from "@/components/ui/InlineMessage";

/** @typedef {{ id: string, name: string }} Product */
/** @typedef {{ id: string|null, name: string, product_ids: string[] }} Suggested */
/** @typedef {{ key: string, id: string|null, name: string, original: string }} DraftGroup */

const ICON_BTN =
  "inline-flex items-center justify-center w-11 h-11 rounded-sm text-fg-muted hover:text-text hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-primary";

/**
 * @param {{
 *   basePath: string,
 *   products: Product[],
 *   onApply: (groups: Suggested[]) => Promise<boolean>,
 *   t: (k: string, v?: any) => string,
 * }} props
 */
export default function ProductGroupSuggest({ basePath, products, onApply, t }) {
  const [phase, setPhase] = useState(/** @type {"idle"|"loading"|"preview"|"failed"|"saving"} */ ("idle"));
  const [groups, setGroups] = useState(/** @type {DraftGroup[]} */ ([]));
  // product id → draft group key ("" = no group)
  const [placed, setPlaced] = useState(/** @type {Record<string, string>} */ ({}));

  const ask = async () => {
    setPhase("loading");
    try {
      const r = await api.post(`${basePath}/product-groups/suggest`);
      /** @type {Suggested[]} */
      const list = Array.isArray(r.data?.groups) ? r.data.groups.filter((/** @type {Suggested} */ g) => g.product_ids?.length) : [];
      if (!list.length) {
        setPhase("failed");
        return;
      }
      setGroups(list.map((g, i) => ({ key: `s${i}`, id: g.id, name: g.name, original: g.name })));
      setPlaced(Object.fromEntries(list.flatMap((g, i) => g.product_ids.map((pid) => [pid, `s${i}`]))));
      setPhase("preview");
    } catch {
      setPhase("failed");
    }
  };

  /** @param {string} key */
  const drop = (key) => {
    setGroups((gs) => gs.filter((g) => g.key !== key));
    setPlaced((p) => Object.fromEntries(Object.entries(p).map(([pid, k]) => [pid, k === key ? "" : k])));
  };

  const save = async () => {
    /** @type {Suggested[]} */
    const result = groups
      .map((g) => ({
        id: g.id,
        name: g.name.trim() || g.original,
        product_ids: Object.keys(placed).filter((pid) => placed[pid] === g.key),
      }))
      .filter((g) => g.product_ids.length);
    setPhase("saving");
    const ok = await onApply(result);
    setPhase(ok ? "idle" : "preview");
  };

  if (phase === "preview" || phase === "saving") {
    const inPreview = products.filter((p) => p.id in placed);
    return (
      <section data-testid="group-suggestion" className="border border-primary/30 rounded-md p-3 space-y-3">
        <p className="text-sm text-text">{t("suggest_heading")}</p>
        {groups.map((g) => (
          <div key={g.key} data-testid="group-suggestion-group" className="space-y-1">
            <div className="flex items-center gap-2">
              {g.id ? (
                <span className="flex-1 min-w-0 text-sm font-medium text-text truncate" title={g.name}>{g.name}</span>
              ) : (
                <Input inline size="xs"
                  value={g.name}
                  maxLength={40}
                  aria-label={t("group_rename_aria", { name: g.original })}
                  onChange={(e) => setGroups((gs) => gs.map((x) => (x.key === g.key ? { ...x, name: e.target.value } : x)))}
                  className="flex-1 min-w-0 min-h-touch"
                />
              )}
              <button type="button" aria-label={t("group_delete_aria", { name: g.name })} onClick={() => drop(g.key)} className={ICON_BTN}>
                <Trash size={18} aria-hidden="true" />
              </button>
            </div>
            <ul className="divide-y divide-border border-y border-border">
              {inPreview.filter((p) => placed[p.id] === g.key).map((p) => (
                <SuggestedRow key={p.id} product={p} groups={groups} value={placed[p.id]} t={t}
                  onChange={(key) => setPlaced((pl) => ({ ...pl, [p.id]: key }))} />
              ))}
            </ul>
          </div>
        ))}
        {inPreview.some((p) => !placed[p.id]) && (
          <div className="space-y-1">
            <span className="text-xs font-medium text-fg-muted">{t("product_group_none")}</span>
            <ul className="divide-y divide-border border-y border-border">
              {inPreview.filter((p) => !placed[p.id]).map((p) => (
                <SuggestedRow key={p.id} product={p} groups={groups} value="" t={t}
                  onChange={(key) => setPlaced((pl) => ({ ...pl, [p.id]: key }))} />
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={save} loading={phase === "saving"} disabled={phase === "saving"}>
            {t("suggest_save")}
          </Button>
          <Button type="button" size="sm" variant="outlined" onClick={() => setPhase("idle")} disabled={phase === "saving"}>
            {t("suggest_cancel")}
          </Button>
        </div>
      </section>
    );
  }

  if (!products.length) return null;
  return (
    <div data-testid="group-suggest">
      <Button type="button" size="sm" variant="secondary" onClick={ask} disabled={phase === "loading"}>
        {t("suggest_cta")}
      </Button>
      <p className="text-xs text-fg-muted mt-1">{t("suggest_hint")}</p>
      {phase === "loading" && <InlineMessage tone="info" className="mt-2">{t("suggest_loading")}</InlineMessage>}
      {phase === "failed" && <InlineMessage tone="info" className="mt-2">{t("suggest_failed")}</InlineMessage>}
    </div>
  );
}

/**
 * @param {{ product: Product, groups: DraftGroup[], value: string, onChange: (key: string) => void, t: (k: string, v?: any) => string }} props
 */
function SuggestedRow({ product, groups, value, onChange, t }) {
  const id = `suggest-group-${product.id}`;
  return (
    <li className="flex items-center gap-2 py-1.5">
      <span className="flex-1 min-w-0 text-sm text-text truncate">{product.name}</span>
      <label htmlFor={id} className="sr-only">{t("product_group_label", { name: product.name })}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-36 shrink-0 min-h-touch text-sm border border-border rounded-sm px-2 bg-surface-card focus-ring truncate"
      >
        <option value="">{t("product_group_none")}</option>
        {groups.map((g) => (
          <option key={g.key} value={g.key}>{g.name.trim() || g.original}</option>
        ))}
      </select>
    </li>
  );
}
