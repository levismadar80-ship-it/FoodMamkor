// @ts-check
"use client";
/**
 * Module:   ProductOrganizer
 * Purpose:  Inside the dashboard's products card: the owner sets the order of
 *           her products (drag handle or arrows) and sorts them into groups
 *           (MEH-3055). Closed by default — a one-line entry under the list,
 *           the way Etsy keeps «Rearrange» as a mode, not a permanent panel.
 * Touches:  GET/PUT /producers/me/product-groups, PUT /producers/me/product-order,
 *           PUT /producers/me/products/{id}/group.
 * Does NOT: create, edit or delete products (ProductsSection.jsx), and does not
 *           decide display order — lib/product-order.js does, for both the
 *           public page and this list.
 * Placement (rule 37, delegated by Sapir 13/11 17:00Z): in the products card,
 *           under the product list, because ordering and grouping are about
 *           THESE rows; a separate tab would split one job across two screens.
 * History:  MEH-3055 (creation)
 */
import { useEffect, useRef, useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, DotsSixVertical, Trash } from "@phosphor-icons/react";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { showToast } from "@/lib/toast";
import { orderProducts } from "@/lib/product-order";

/** @typedef {{ id: string, name: string, position?: number|null, group_id?: string|null, image_url?: string|null }} Product */
/** @typedef {{ id: string, name: string }} Group */

const ICON_BTN =
  "inline-flex items-center justify-center w-11 h-11 rounded-sm text-fg-muted hover:text-text hover:bg-black/5 disabled:opacity-30 disabled:pointer-events-none focus-visible:ring-2 focus-visible:ring-primary/40";

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
 * @param {{ products: Product[], onProductsChange: (next: Product[]) => void }} props
 */
export default function ProductOrganizer({ products, onProductsChange }) {
  const t = useTranslations("settings.products.organize");
  const [open, setOpen] = useState(false);
  /** @type {[Group[], (g: Group[]) => void]} */
  const [groups, setGroups] = useState(/** @type {Group[]} */ ([]));
  /** @type {[Product[], (p: Product[]) => void]} */
  const [order, setOrder] = useState(/** @type {Product[]} */ ([]));
  const orderRef = useRef(/** @type {Product[]} */ ([]));

  useEffect(() => {
    if (!open) return;
    const ordered = orderProducts(products);
    setOrder(ordered);
    orderRef.current = ordered;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot when opened
  }, [open]);

  // Fetched on open, not on mount: the dashboard loads this card for every
  // owner, and most will never open it.
  useEffect(() => {
    if (!open) return;
    api
      .get("/producers/me/product-groups")
      .then((r) => setGroups(Array.isArray(r.data) ? r.data : []))
      .catch(() => setGroups([]));
  }, [open]);

  /** @param {unknown} err */
  const fail = (err) =>
    showToast.error(detailToMessage(/** @type {any} */ (err)?.response?.data?.detail) || t("save_failed"));

  /** @param {Product[]} next */
  const saveOrder = async (next) => {
    try {
      await api.put("/producers/me/product-order", { product_ids: next.map((p) => p.id) });
      const withPos = next.map((p, i) => ({ ...p, position: i }));
      onProductsChange(withPos);
      showToast.success(t("saved"));
    } catch (err) {
      fail(err);
    }
  };

  /** @param {Product[]} next */
  const reorderLocal = (next) => {
    setOrder(next);
    orderRef.current = next;
  };

  /** @param {number} from @param {number} to */
  const moveProduct = (from, to) => {
    const next = move(order, from, to);
    reorderLocal(next);
    saveOrder(next);
  };

  /** @param {{ id?: string, name: string }[]} next */
  const saveGroups = async (next) => {
    try {
      const r = await api.put("/producers/me/product-groups", { groups: next });
      setGroups(r.data);
      return /** @type {Group[]} */ (r.data);
    } catch (err) {
      fail(err);
      return null;
    }
  };

  /** @param {string} productId @param {string} groupId */
  const assign = async (productId, groupId) => {
    try {
      const r = await api.put(`/producers/me/products/${productId}/group`, {
        group_id: groupId || null,
      });
      const patch = (/** @type {Product} */ p) => (p.id === productId ? { ...p, group_id: r.data.group_id } : p);
      setOrder(order.map(patch));
      onProductsChange(products.map(patch));
      showToast.success(t("saved"));
    } catch (err) {
      fail(err);
    }
  };

  /** @param {string} id */
  const deleteGroup = async (id) => {
    const saved = await saveGroups(groups.filter((g) => g.id !== id));
    if (!saved) return;
    const clear = (/** @type {Product} */ p) => (p.group_id === id ? { ...p, group_id: null } : p);
    setOrder(order.map(clear));
    onProductsChange(products.map(clear));
    showToast.success(t("group_deleted"));
  };

  if (products.length < 2) return null;

  if (!open) {
    return (
      <div className="mb-4" data-testid="product-organizer">
        <button
          type="button"
          data-testid="product-organizer-open"
          aria-expanded="false"
          onClick={() => setOpen(true)}
          className="text-sm text-primary font-medium underline decoration-[1.5px] underline-offset-[5px] decoration-primary/35 hover:decoration-current"
        >
          {t("open_cta")}
        </button>
        <p className="text-xs text-fg-muted mt-1">{t("open_hint")}</p>
      </div>
    );
  }

  return (
    <div className="mb-4 border border-border rounded-md p-4 space-y-6 bg-surface-card" data-testid="product-organizer">
      <GroupsEditor groups={groups} onSave={saveGroups} onDelete={deleteGroup} t={t} />

      <section aria-labelledby="product-order-heading">
        <h3 id="product-order-heading" className="text-sm font-medium text-text">
          {t("order_heading")}
        </h3>
        <p className="text-xs text-fg-muted mt-1 mb-3">
          {t(groups.length ? "order_where_grouped" : "order_where")}
        </p>
        <Reorder.Group
          axis="y"
          values={order}
          onReorder={reorderLocal}
          className="divide-y divide-border border-y border-border"
          data-testid="product-order-list"
        >
          {order.map((p, i) => (
            <OrderRow
              key={p.id}
              product={p}
              index={i}
              last={order.length - 1}
              groups={groups}
              onDrop={() => saveOrder(orderRef.current)}
              onMove={moveProduct}
              onAssign={assign}
              t={t}
            />
          ))}
        </Reorder.Group>
      </section>

      <button
        type="button"
        data-testid="product-organizer-done"
        onClick={() => setOpen(false)}
        className="inline-flex items-center text-sm text-primary border border-primary/30 rounded-sm px-3 py-1.5 hover:bg-primary/5 transition"
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
 * }} props
 */
function OrderRow({ product, index, last, groups, onDrop, onMove, onAssign, t }) {
  const controls = useDragControls();
  const selectId = `product-group-${product.id}`;
  return (
    <Reorder.Item
      value={product}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDrop}
      className="flex items-center gap-2 py-2 bg-surface-card"
      data-testid="product-order-row"
    >
      <button
        type="button"
        aria-label={t("drag_aria", { name: product.name })}
        onPointerDown={(e) => controls.start(e)}
        className={`${ICON_BTN} cursor-grab touch-none`}
      >
        <DotsSixVertical size={20} aria-hidden="true" />
      </button>
      {/* Name above, group below: at 375 a one-line row leaves the name no
          room once the select and two 44px arrows are in it. */}
      <span className="flex-1 min-w-0">
        <span className="block text-sm text-text truncate">{product.name}</span>
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
              className="mt-1 w-full max-w-[12rem] text-sm border border-border rounded-sm px-2 py-1.5 bg-surface-card"
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
      </span>
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
    </Reorder.Item>
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
  /** @param {import("react").FormEvent} e */
  const add = async (e) => {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    const saved = await onSave([...groups, { name }]);
    if (saved) setDraft("");
  };
  /** @param {string} id @param {string} name */
  const rename = (id, name) => {
    const clean = name.trim();
    const current = groups.find((g) => g.id === id);
    if (!clean || !current || current.name === clean) return;
    onSave(groups.map((g) => (g.id === id ? { ...g, name: clean } : g)));
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
              <input
                defaultValue={g.name}
                maxLength={40}
                aria-label={t("group_rename_aria", { name: g.name })}
                onBlur={(e) => rename(g.id, e.target.value)}
                className="flex-1 min-w-0 text-sm border border-border rounded-sm px-2 py-1.5 bg-surface-card"
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
          <input
            id="new-product-group"
            data-testid="product-group-new"
            value={draft}
            maxLength={40}
            placeholder={t("group_add_placeholder")}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full text-sm border border-border rounded-sm px-2 py-1.5 bg-surface-card"
          />
        </span>
        <button
          type="submit"
          data-testid="product-group-add"
          disabled={!draft.trim()}
          className="shrink-0 text-sm text-primary border border-primary/30 rounded-sm px-3 py-1.5 hover:bg-primary/5 transition disabled:opacity-40"
        >
          {t("group_add_cta")}
        </button>
      </form>
    </section>
  );
}
