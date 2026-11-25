// @ts-check
"use client";
/**
 * Module:   ProductOrganizer
 * Purpose:  Inside the dashboard's products card: the owner sets the order of
 *           her products (drag handle or arrows) and sorts them into groups
 *           (MEH-3055). Closed by default — a one-line entry under the list,
 *           the way Etsy keeps «Rearrange» as a mode, not a permanent panel.
 * Touches:  GET/PUT {basePath}/product-groups, PUT {basePath}/product-order,
 *           PUT {basePath}/products/{id}/group — basePath /producers/me (owner)
 *           or /admin/producers/{id} (admin, MEH-3472).
 * Does NOT: create, edit or delete products (ProductsSection.jsx), and does not
 *           decide display order — lib/product-display-order.js does, for both the
 *           public page and this list.
 * Placement (rule 37, delegated by Sapir 13/11 17:00Z): in the products card,
 *           under the product list, because ordering and grouping are about
 *           THESE rows; a separate tab would split one job across two screens.
 * History:  MEH-3055 (creation); MEH-3477 (products shown inside their group,
 *           order set per group, thumbnails, width cap at 1440; mark several
 *           → move to a group in one write, or to the top / end of the
 *           group); MEH-3478 («הצעת קבוצות», ProductGroupSuggest.jsx)
 */
import { useEffect, useRef, useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, DotsSixVertical, Trash } from "@phosphor-icons/react";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { showToast } from "@/lib/toast";
import { orderProducts } from "@/lib/product-display-order";
import { optimizeCloudinary, IMAGE_RATIOS } from "@/lib/cloudinary";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import ProductGroupSuggest from "@/components/ProductGroupSuggest";
import Checkbox from "@/components/ui/Checkbox";

/** @typedef {{ id: string, name: string, position?: number|null, group_id?: string|null, image_url?: string|null }} Product */
/** @typedef {{ id: string, name: string }} Group */

const ICON_BTN =
  "inline-flex items-center justify-center w-11 h-11 rounded-sm text-fg-muted hover:text-text hover:bg-black/5 disabled:opacity-50 disabled:pointer-events-none focus-visible:ring-2 focus-visible:ring-primary";

/**
 * @template T
 * @param {T[]} list
 * @param {number} from
 * @param {number} to
 * @returns {T[]}
 */
function move(list, from, to) {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * MEH-3477: lay the list out group by group in the groups' order, ungrouped
 * last — the public page's layout (lib/product-display-order.js). Stable, so the
 * order inside each group is the list's own.
 * @param {Product[]} list
 * @param {Group[]} groups
 * @returns {{ id: string, name: string, items: Product[] }[]}
 */
function sectionsOf(list, groups) {
  const known = new Set(groups.map((g) => g.id));
  const inGroup = (/** @type {Product} */ p, /** @type {string} */ id) =>
    id ? p.group_id === id : !(p.group_id && known.has(p.group_id));
  return [...groups, { id: "", name: "" }]
    .map((g) => ({ id: g.id, name: g.name, items: list.filter((p) => inGroup(p, g.id)) }))
    .filter((s) => s.items.length > 0);
}

/** @param {Product[]} list @param {Group[]} groups */
const regroup = (list, groups) => sectionsOf(list, groups).flatMap((s) => s.items);

/**
 * MEH-3472: `basePath` is the only difference between the owner and the
 * admin. The owner writes /producers/me/...; the admin edit page passes
 * /admin/producers/{id}, whose routes run the same service
 * (backend/app/services/product_organize.py) with drafts in scope.
 * `onGroupsChange` (optional) is told after a group list is saved, so a
 * sibling that shows group names (the admin import panel) can re-read them.
 * @param {{ products: Product[], onProductsChange: (next: Product[]) => void, basePath?: string, onGroupsChange?: () => void }} props
 */
export default function ProductOrganizer({ products, onProductsChange, basePath = "/producers/me", onGroupsChange }) {
  const t = useTranslations("settings.products.organize");
  const [open, setOpen] = useState(false);
  /** @type {[Group[], (g: Group[]) => void]} */
  const [groups, setGroups] = useState(/** @type {Group[]} */ ([]));
  /** @type {[Product[], (p: Product[]) => void]} */
  const [order, setOrder] = useState(/** @type {Product[]} */ ([]));
  const orderRef = useRef(/** @type {Product[]} */ ([]));
  // The last order the server accepted: what a failed save rolls back to.
  const confirmedRef = useRef(/** @type {Product[]} */ ([]));
  // One order PUT in flight at a time; clicks made meanwhile collapse into
  // the latest order, sent when the current one returns. Without this, fast
  // arrow clicks race and an older order can be the one that lands.
  const inFlightRef = useRef(false);
  const pendingRef = useRef(/** @type {Product[] | null} */ (null));
  const productsRef = useRef(products);
  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  // Rebuilt when the organizer opens AND whenever the set of products changes
  // underneath it (a product added or deleted in the list above), so a save
  // never sends — or writes back — a stale set.
  const idKey = products.map((p) => p.id).sort().join(",");
  useEffect(() => {
    if (!open) return;
    const ordered = orderProducts(products);
    setOrder(ordered);
    orderRef.current = ordered;
    confirmedRef.current = ordered;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot per open / product set
  }, [open, idKey]);

  // Fetched on open, not on mount: the dashboard loads this card for every
  // owner, and most will never open it. Re-read when the product set changes
  // too (MEH-3472): an admin import can add groups while the organizer is
  // open, and saving the old list would delete them.
  useEffect(() => {
    if (!open) return;
    api
      .get(`${basePath}/product-groups`)
      .then((r) => setGroups(Array.isArray(r.data) ? r.data : []))
      .catch(() => setGroups([]));
  }, [open, basePath, idKey]);

  // MEH-3477: a new group list (loaded, added, renamed, deleted) re-lays the
  // list out by group. Display only — positions are saved on the next move.
  useEffect(() => {
    if (!open) return;
    const regrouped = regroup(orderRef.current, groups);
    setOrder(regrouped);
    orderRef.current = regrouped;
    confirmedRef.current = regroup(confirmedRef.current, groups);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-lay on a new group list only
  }, [groups]);

  /** @param {unknown} err */
  const fail = (err) =>
    showToast.error(detailToMessage(/** @type {any} */ (err)?.response?.data?.detail) || t("save_failed"));

  /** @param {Product[]} next */
  const reorderLocal = (next) => {
    setOrder(next);
    orderRef.current = next;
  };

  /** @param {Product[]} next */
  const saveOrder = async (next) => {
    if (inFlightRef.current) {
      pendingRef.current = next;
      return;
    }
    inFlightRef.current = true;
    try {
      await api.put(`${basePath}/product-order`, { product_ids: next.map((p) => p.id) });
      confirmedRef.current = next;
      const pos = new Map(next.map((p, i) => [p.id, i]));
      // Merge positions into the CURRENT list, never replace it with this
      // snapshot: rows added or deleted meanwhile must survive.
      onProductsChange(productsRef.current.map((p) => (pos.has(p.id) ? { ...p, position: pos.get(p.id) } : p)));
      inFlightRef.current = false;
      const queued = pendingRef.current;
      pendingRef.current = null;
      if (queued) saveOrder(queued);
      else showToast.success(t("saved"));
    } catch (err) {
      inFlightRef.current = false;
      pendingRef.current = null;
      reorderLocal(confirmedRef.current);
      fail(err);
    }
  };

  /**
   * MEH-3477: the order is set inside a group; the saved list is the groups
   * laid end to end.
   * @param {string} sectionId @param {Product[]} items
   */
  const withSection = (sectionId, items) =>
    sectionsOf(orderRef.current, groups).flatMap((s) => (s.id === sectionId ? items : s.items));

  /** @param {string} sectionId @param {Product[]} items @param {number} from @param {number} to */
  const moveProduct = (sectionId, items, from, to) => {
    const next = withSection(sectionId, move(items, from, to));
    reorderLocal(next);
    saveOrder(next);
  };

  /** Same key the backend matches group names by (strip + casefold). @param {string} n */
  const nameKey = (n) => n.trim().toLocaleLowerCase();

  /** @param {{ id?: string, name: string }[]} next */
  const saveGroups = async (next) => {
    try {
      const r = await api.put(`${basePath}/product-groups`, { groups: next });
      setGroups(r.data);
      onGroupsChange?.();
      return /** @type {Group[]} */ (r.data);
    } catch (err) {
      fail(err);
      return null;
    }
  };

  /** @param {string} productId @param {string} groupId */
  const assign = async (productId, groupId) => {
    try {
      const r = await api.put(`${basePath}/products/${productId}/group`, {
        group_id: groupId || null,
      });
      setUndo(null);  // review: an undo after a manual change would clobber it
      const patch = (/** @type {Product} */ p) => (p.id === productId ? { ...p, group_id: r.data.group_id } : p);
      reorderLocal(regroup(orderRef.current.map(patch), groups));
      confirmedRef.current = regroup(confirmedRef.current.map(patch), groups);
      onProductsChange(productsRef.current.map(patch));
      showToast.success(t("saved"));
    } catch (err) {
      fail(err);
    }
  };

  /** @param {string} id */
  const deleteGroup = async (id) => {
    const saved = await saveGroups(groups.filter((g) => g.id !== id));
    if (!saved) return;
    setUndo(null);
    const clear = (/** @type {Product} */ p) => (p.group_id === id ? { ...p, group_id: null } : p);
    reorderLocal(orderRef.current.map(clear));
    confirmedRef.current = confirmedRef.current.map(clear);
    onProductsChange(productsRef.current.map(clear));
    showToast.success(t("group_deleted"));
  };

  // MEH-3477: the products the owner marked (ids).
  const [selected, setSelected] = useState(/** @type {Set<string>} */ (new Set()));
  /** @param {string} id */
  const toggle = (id) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Review: a marked product that was deleted meanwhile is not counted or sent.
  const marked = new Set(order.filter((p) => selected.has(p.id)).map((p) => p.id));

  /** @param {Record<string, string|null>} groupOf  product id → its new group */
  const applyGroups = (groupOf) => {
    const patch = (/** @type {Product} */ p) => (p.id in groupOf ? { ...p, group_id: groupOf[p.id] } : p);
    return patch;
  };

  /**
   * MEH-3477: one write for many products. `moves` is [group_id|null, ids][].
   * @param {[string|null, string[]][]} moves @param {Group[]} [list]
   */
  const writeMoves = async (moves, list = groups) => {
    await api.put(`${basePath}/product-groups/assign`, {
      moves: moves.map(([group_id, product_ids]) => ({ group_id, product_ids })),
    });
    const patch = applyGroups(Object.fromEntries(moves.flatMap(([gid, ids]) => ids.map((id) => [id, gid]))));
    reorderLocal(regroup(orderRef.current.map(patch), list));
    confirmedRef.current = regroup(confirmedRef.current.map(patch), list);
    onProductsChange(productsRef.current.map(patch));
  };

  /** @param {string} groupId  "" = no group */
  const moveSelected = async (groupId) => {
    const ids = [...marked];
    if (!ids.length) return;
    try {
      await writeMoves([[groupId || null, ids]]);
      setUndo(null);
      setSelected(new Set());
      const name = groups.find((g) => g.id === groupId)?.name;
      showToast.success(name && ids.length > 1 ? t("moved_toast", { count: ids.length, group: name }) : t("saved"));
    } catch (err) {
      fail(err);
    }
  };

  /** MEH-3477: the marked products of each group to its top or end, in their order. @param {"top"|"end"} edge */
  const moveSelectedToEdge = (edge) => {
    const next = sectionsOf(orderRef.current, groups).flatMap((s) => {
      const marked = s.items.filter((p) => selected.has(p.id));
      const rest = s.items.filter((p) => !selected.has(p.id));
      return edge === "top" ? [...marked, ...rest] : [...rest, ...marked];
    });
    reorderLocal(next);
    saveOrder(next);
  };

  // MEH-3478: the last saved suggestion, for «ביטול»: the products it moved
  // (all had no group before) and the groups it created. Any other change in
  // the organizer clears it, so «ביטול» never undoes the owner's own work.
  const [undo, setUndo] = useState(/** @type {{ ids: string[], created: string[] } | null} */ (null));

  /** @param {{ id: string|null, name: string, product_ids: string[] }[]} list */
  const applySuggestion = async (list) => {
    // Review: build on the server's list, not the one loaded with the page —
    // a PUT of a stale list would delete a group added elsewhere meanwhile.
    let current = groups;
    try {
      const r = await api.get(`${basePath}/product-groups`);
      if (Array.isArray(r.data)) current = r.data;
    } catch {
      // keep the loaded list; the PUT below still answers for it
    }
    const known = new Set(current.map((g) => nameKey(g.name)));
    const added = list.filter((g) => !g.id && !known.has(nameKey(g.name)));
    const saved = added.length ? await saveGroups([...current, ...added.map((g) => ({ name: g.name.trim() }))]) : current;
    if (!saved) return false;
    const created = saved.filter((g) => !current.some((c) => c.id === g.id)).map((g) => g.id);
    const idOf = (/** @type {{ id: string|null, name: string }} */ g) =>
      g.id || saved.find((x) => nameKey(x.name) === nameKey(g.name))?.id || null;
    /** @type {[string|null, string[]][]} */
    const moves = list.map((g) => [idOf(g), g.product_ids]);
    try {
      await writeMoves(moves, saved);
      setUndo({ ids: list.flatMap((g) => g.product_ids), created });
      return true;
    } catch (err) {
      fail(err);
      // The moves did not land: take back the empty groups this step created.
      if (created.length) await saveGroups(saved.filter((g) => !created.includes(g.id)));
      return false;
    }
  };

  const undoSuggestion = async () => {
    if (!undo) return;
    const live = new Set(productsRef.current.map((p) => p.id));
    const ids = undo.ids.filter((id) => live.has(id));
    try {
      if (ids.length) await writeMoves([[null, ids]]);
    } catch (err) {
      fail(err);
      return;
    }
    const rest = groups.filter((g) => !undo.created.includes(g.id));
    if (rest.length !== groups.length && !(await saveGroups(rest))) return;
    setUndo(null);
  };

  if (products.length < 2) return null;

  if (!open) {
    return (
      <div className="mb-4" data-testid="product-organizer">
        <button
          type="button"
          data-testid="product-organizer-open"
          aria-expanded="false"
          aria-controls="product-organizer-panel"
          onClick={() => setOpen(true)}
          className="inline-flex items-center min-h-touch text-sm text-primary font-medium underline decoration-[1.5px] underline-offset-[5px] decoration-primary/35 hover:decoration-current"
        >
          {t("open_cta")}
        </button>
        <p className="text-xs text-fg-muted mt-1">{t("open_hint")}</p>
      </div>
    );
  }

  return (
    <div
      id="product-organizer-panel"
      className="mb-4 max-w-2xl border border-border rounded-md p-4 space-y-6 bg-surface-card"
      data-testid="product-organizer"
    >
      <GroupsEditor groups={groups} onSave={(next) => { setUndo(null); return saveGroups(next); }} onDelete={deleteGroup} t={t} />

      <ProductGroupSuggest
        basePath={basePath}
        products={sectionsOf(order, groups).find((s) => s.id === "")?.items || []}
        onApply={applySuggestion}
        t={t}
      />
      {undo && (
        <div className="flex items-center gap-3" data-testid="group-suggestion-saved">
          <InlineMessage tone="success">{t("suggest_saved")}</InlineMessage>
          <Button type="button" size="sm" variant="text" onClick={undoSuggestion}>
            {t("suggest_undo")}
          </Button>
        </div>
      )}

      <section aria-labelledby="product-order-heading">
        <h3 id="product-order-heading" className="text-sm font-medium text-text">
          {t("order_heading")}
        </h3>
        <p className="text-xs text-fg-muted mt-1 mb-3">
          {t(groups.length ? "order_where_sections" : "order_where")}
        </p>
        {marked.size > 0 && (
          <SelectionBar
            count={marked.size}
            groups={groups}
            onMove={moveSelected}
            onEdge={moveSelectedToEdge}
            onClear={() => setSelected(new Set())}
            t={t}
          />
        )}
        <div data-testid="product-order-list" className="space-y-4">
          {sectionsOf(order, groups).map((s) => (
            <section key={s.id || "none"} data-testid="product-order-section" data-group={s.id}>
              {groups.length > 0 && (
                <h4 className="text-xs font-medium text-fg-muted mb-1 truncate" title={s.name || t("product_group_none")}>
                  {s.name || t("product_group_none")}
                </h4>
              )}
              <Reorder.Group
                axis="y"
                values={s.items}
                onReorder={(items) => reorderLocal(withSection(s.id, items))}
                className="divide-y divide-border border-y border-border"
              >
                {s.items.map((p, i) => (
                  <OrderRow
                    key={p.id}
                    product={p}
                    index={i}
                    last={s.items.length - 1}
                    groups={groups}
                    onDrop={() => saveOrder(orderRef.current)}
                    onMove={(from, to) => moveProduct(s.id, s.items, from, to)}
                    onAssign={assign}
                    checked={selected.has(p.id)}
                    onToggle={() => toggle(p.id)}
                    t={t}
                  />
                ))}
              </Reorder.Group>
            </section>
          ))}
        </div>
      </section>

      <button
        type="button"
        data-testid="product-organizer-done"
        aria-expanded="true"
        aria-controls="product-organizer-panel"
        onClick={() => setOpen(false)}
        className="inline-flex items-center min-h-touch text-sm text-primary border border-primary/30 rounded-sm px-4 hover:bg-primary/5 transition"
      >
        {t("done_cta")}
      </button>
    </div>
  );
}

/**
 * @param {{
 *   product: Product, index: number, last: number, groups: Group[],
 *   onDrop: () => void, onMove: (from: number, to: number) => void,
 *   onAssign: (productId: string, groupId: string) => void, t: (k: string, v?: any) => string,
 *   checked: boolean, onToggle: () => void,
 * }} props
 */
function OrderRow({ product, index, last, groups, onDrop, onMove, onAssign, checked, onToggle, t }) {
  const controls = useDragControls();
  const selectId = `product-group-${product.id}`;
  return (
    <Reorder.Item
      value={product}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDrop}
      className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 bg-surface-card"
      data-testid="product-order-row"
      data-name={product.name}
    >
      {/* MEH-3477: 44px tap target around a native checkbox. */}
      <Checkbox
        className="shrink-0 inline-flex items-center justify-center w-11 h-11"
        checked={checked}
        onChange={onToggle}
        aria-label={t("select_aria", { name: product.name })}
      >
      </Checkbox>
      <button
        type="button"
        aria-label={t("drag_aria", { name: product.name })}
        onPointerDown={(e) => controls.start(e)}
        className={`${ICON_BTN} cursor-grab touch-none hidden sm:inline-flex`}
      >
        <DotsSixVertical size={20} aria-hidden="true" />
      </button>
      <Thumb url={product.image_url} />
      {/* At 375 a single line leaves the name no room once the checkbox, the
          thumbnail, the select and two 44px arrows are in it: the row wraps,
          name on the first line, group + arrows on the second. Drag needs a
          pointer and is hidden below sm; the arrows do the same job there. */}
      <span className="flex-1 min-w-0 text-sm text-text line-clamp-2">{product.name}</span>
      <span className="flex items-center gap-2 basis-full min-w-0 sm:basis-auto">
        {groups.length > 0 && (
          <>
            <label htmlFor={selectId} className="sr-only">
              {t("product_group_label", { name: product.name })}
            </label>
            <select
              id={selectId}
              data-testid="product-group-select"
              value={product.group_id || ""}
              onChange={(e) => onAssign(product.id, e.target.value)}
              title={groups.find((g) => g.id === product.group_id)?.name || t("product_group_none")}
              className="flex-1 min-w-0 sm:flex-none sm:w-48 truncate min-h-touch text-sm border border-border rounded-sm px-2 bg-surface-card focus-ring"
            >
              <option value="">{t("product_group_none")}</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </>
        )}
        <span className="flex items-center ms-auto">
          <button
            type="button"
            data-testid="product-move-up"
            aria-label={t("move_up_aria", { name: product.name })}
            disabled={index === 0}
            onClick={() => onMove(index, index - 1)}
            className={ICON_BTN}
          >
            <ArrowUp size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            data-testid="product-move-down"
            aria-label={t("move_down_aria", { name: product.name })}
            disabled={index === last}
            onClick={() => onMove(index, index + 1)}
            className={ICON_BTN}
          >
            <ArrowDown size={18} aria-hidden="true" />
          </button>
        </span>
      </span>
    </Reorder.Item>
  );
}

// MEH-3477: 40px square, the same box with or without a photo, so names line up.
const THUMB_PX = 80; // delivered at 2× the 40px box

/** @param {{ url?: string|null }} props */
function Thumb({ url }) {
  if (!url) {
    return <span data-testid="product-thumb-empty" aria-hidden="true" className="shrink-0 w-10 h-10 rounded-sm bg-border/60" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a 40px thumbnail; Cloudinary already sizes it
    <img
      src={optimizeCloudinary(url, { aspectRatio: IMAGE_RATIOS.square, width: THUMB_PX })}
      alt=""
      loading="lazy"
      className="shrink-0 w-10 h-10 rounded-sm object-cover"
    />
  );
}

/**
 * MEH-3477: what the owner can do with the products she marked — Shopify's
 * «Move items» and Etsy's «Change section», in one bar above the list.
 * @param {{
 *   count: number, groups: Group[], onMove: (groupId: string) => void,
 *   onEdge: (edge: "top"|"end") => void, onClear: () => void, t: (k: string, v?: any) => string,
 * }} props
 */
function SelectionBar({ count, groups, onMove, onEdge, onClear, t }) {
  return (
    <div
      data-testid="product-selection-bar"
      className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-surface-card p-2"
    >
      <span className="text-sm font-medium text-text">{t("selected_count", { count })}</span>
      {groups.length > 0 && (
        <>
          <label htmlFor="move-selected-group" className="sr-only">{t("move_to_group")}</label>
          <select
            id="move-selected-group"
            value="__"
            onChange={(e) => onMove(e.target.value)}
            className="min-h-touch max-w-[12rem] truncate text-sm border border-border rounded-sm px-2 bg-surface-card focus-ring"
          >
            <option value="__" disabled>{t("move_to_group")}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
            <option value="">{t("product_group_none")}</option>
          </select>
        </>
      )}
      <Button type="button" size="sm" variant="ghost" onClick={() => onEdge("top")}>{t("move_top")}</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => onEdge("end")}>{t("move_bottom")}</Button>
      <Button type="button" size="sm" variant="text" onClick={onClear}>{t("clear_selection")}</Button>
    </div>
  );
}

/**
 * @param {{
 *   groups: Group[],
 *   onSave: (next: { id?: string, name: string }[]) => Promise<Group[] | null>,
 *   onDelete: (id: string) => void,
 *   t: (k: string, v?: any) => string,
 * }} props
 */
function GroupsEditor({ groups, onSave, onDelete, t }) {
  const [draft, setDraft] = useState("");
  // Bumped when a rename is refused, so the inputs remount with the stored name.
  const [rev, setRev] = useState(0);
  /** @param {import("react").FormEvent} e */
  const add = async (e) => {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    const saved = await onSave([...groups, { name }]);
    if (saved) setDraft("");
  };
  /** @param {string} id @param {string} name */
  const rename = async (id, name) => {
    const clean = name.trim();
    const current = groups.find((g) => g.id === id);
    if (!current || current.name === clean) return;
    const saved = clean ? await onSave(groups.map((g) => (g.id === id ? { ...g, name: clean } : g))) : null;
    if (!saved) setRev((r) => r + 1);
  };
  /** @param {number} from @param {number} to */
  const reorder = (from, to) => onSave(move(groups, from, to));

  return (
    <section aria-labelledby="product-groups-heading" data-testid="product-groups-editor">
      <h3 id="product-groups-heading" className="text-sm font-medium text-text">
        {t("groups_heading")}
      </h3>
      <p className="text-xs text-fg-muted mt-1 mb-3">{t("groups_where")}</p>
      {groups.length === 0 ? (
        <p className="text-sm text-fg-muted mb-3" data-testid="product-groups-empty">
          {t("groups_empty")}
        </p>
      ) : (
        <ul className="divide-y divide-border border-y border-border mb-3">
          {groups.map((g, i) => (
            <li key={g.id} className="flex items-center gap-2 py-2" data-testid="product-group-row">
              <Input inline size="xs"
                key={`${g.name}:${rev}`}
                data-testid="product-group-name"
                defaultValue={g.name}
                maxLength={40}
                aria-label={t("group_rename_aria", { name: g.name })}
                onBlur={(e) => rename(g.id, e.target.value)}
                className="flex-1 min-w-0 min-h-touch"
              />
              <button
                type="button"
                aria-label={t("move_up_aria", { name: g.name })}
                disabled={i === 0}
                onClick={() => reorder(i, i - 1)}
                className={ICON_BTN}
              >
                <ArrowUp size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={t("move_down_aria", { name: g.name })}
                disabled={i === groups.length - 1}
                onClick={() => reorder(i, i + 1)}
                className={ICON_BTN}
              >
                <ArrowDown size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                data-testid="product-group-delete"
                aria-label={t("group_delete_aria", { name: g.name })}
                onClick={() => onDelete(g.id)}
                className={ICON_BTN}
              >
                <Trash size={18} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex items-end gap-2">
        <span className="flex-1 min-w-0">
          <label htmlFor="new-product-group" className="block text-xs text-fg-muted mb-1">
            {t("group_add_label")}
          </label>
          <Input inline size="xs"
            id="new-product-group"
            data-testid="product-group-new"
            value={draft}
            maxLength={40}
            placeholder={t("group_add_placeholder")}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full min-h-touch"
          />
        </span>
        <button
          type="submit"
          data-testid="product-group-add"
          disabled={!draft.trim()}
          className="shrink-0 min-h-touch text-sm text-primary border border-primary/30 rounded-sm px-4 hover:bg-primary/5 transition disabled:opacity-50"
        >
          {t("group_add_cta")}
        </button>
      </form>
    </section>
  );
}
