// @ts-check
"use client";

/**
 * Module:   OrderStatusClient
 * Purpose:  The buyer's status page for one on-site order: where it stands,
 *           when and where to collect it, the pickup code, what to pay, and
 *           the two things she can do — cancel, or accept a proposed change.
 * Touches:  lib/order-status.js (POST /product-orders/status…). Reads the
 *           token from `#t=` once and keeps it in memory only.
 * Does NOT: take payment (paid directly to the business, ADR-042 §5), or show
 *           the buyer's own phone or address. A missing, wrong or expired
 *           link, or ordering switched off, is the site's 404.
 * Related:  app/[locale]/order/[id]/page.js, lib/order-status.js
 * History:  MEH-3216 stage 5a (creation)
 */

import { useEffect, useRef, useState } from "react";
import { notFound } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import InlineMessage from "@/components/ui/InlineMessage";
import SectionHeading from "@/components/ui/SectionHeading";
import { SkeletonList } from "@/components/Skeleton";
import { detailToMessage } from "@/lib/errors";
import { acceptChange, buyerRef, cancelOrder, readStatus, statusView, tokenFromHash } from "@/lib/order-status";
import { dayLabel, hhmm, rangeEnds, shekelsText, toPayAgorot } from "@/lib/product-orders";

const Skeleton = /** @type {any} */ (SkeletonList);

/** @param {{ start: string, end: string, kind: string, address?: string | null }} props */
function WhenLine({ start, end, kind, address }) {
  const t = useTranslations("order_status");
  const locale = useLocale();
  const values = { day: dayLabel(start, locale), ...rangeEnds(start, end) };
  if (kind === "when_pickup" && address) return <p data-testid="order-when">{t("when_pickup", { ...values, address })}</p>;
  if (kind === "when_pickup") return <p data-testid="order-when">{t("when_pickup_no_address", values)}</p>;
  return <p data-testid="order-when">{t("when_delivery", values)}</p>;
}

/** @param {{ order: any }} props */
function Lines({ order }) {
  const t = useTranslations("order_status");
  return (
    <ul className="text-sm text-text space-y-0.5">
      {order.items.map((line, index) => (
        <li key={`${line.name}-${index}`}>{t("line", { qty: line.qty, name: line.name })}</li>
      ))}
    </ul>
  );
}

/** @param {{ order: any, busy: boolean, onAccept: () => void, onCancel: () => void }} props */
function Proposal({ order, busy, onAccept, onCancel }) {
  const t = useTranslations("order_status");
  const p = order.proposal;
  const kind = order.fulfilment === "delivery" ? "when_delivery" : "when_pickup";
  return (
    <div className="rounded-lg border border-border bg-surface p-4 space-y-2" data-testid="order-proposal">
      {p.slot_start && <WhenLine start={p.slot_start} end={p.slot_end} kind={kind} />}
      {p.total_agorot !== null && (
        <p>{t("to_pay", { total: shekelsText(p.total_agorot + (order.delivery_fee_agorot ?? 0)) })}</p>
      )}
      {p.note && <p className="text-fg-muted">{p.note}</p>}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button onClick={onAccept} loading={busy} data-testid="order-accept">{t("accept")}</Button>
        <Button variant="outlined" onClick={onCancel} disabled={busy}>{t("cancel")}</Button>
      </div>
    </div>
  );
}

/** @param {{ onConfirm: () => void, onClose: () => void, busy: boolean, error: string | null }} props */
function CancelDialog({ onConfirm, onClose, busy, error }) {
  const t = useTranslations("order_status");
  const id = "order-cancel-dialog";
  return (
    <Dialog labelledBy={id} size="sm" onClose={onClose} testId={id}>
      <div className="p-5 space-y-4">
        <SectionHeading size="content" id={id}>{t("cancel_confirm")}</SectionHeading>
        {error && <InlineMessage tone="error">{error}</InlineMessage>}
        <div className="flex flex-wrap gap-2 justify-end">
          <Button variant="ghost" onClick={onClose} data-autofocus>{t("back")}</Button>
          <Button variant="danger" onClick={onConfirm} loading={busy} data-testid="order-cancel-confirm">{t("cancel")}</Button>
        </div>
      </div>
    </Dialog>
  );
}

/** @param {{ order: any, onChange: (order: any) => void, refOf: () => object }} props */
export function OrderStatusView({ order, onChange, refOf }) {
  const t = useTranslations("order_status");
  const locale = useLocale();
  const view = statusView(order);
  const [state, setState] = useState(/** @type {{ busy?: boolean, error?: string | null, asking?: boolean }} */ ({}));
  const run = async (/** @type {(ref: object) => Promise<any>} */ action) => {
    setState((old) => ({ ...old, busy: true, error: null }));
    try {
      onChange(await action(refOf()));
      setState({});
    } catch (err) {
      setState((old) => ({ ...old, busy: false, error: detailToMessage(/** @type {any} */ (err)?.response?.data?.detail) || t("failed") }));
    }
  };
  const deadline = order.expires_at ? `${dayLabel(order.expires_at, locale)} ${hhmm(order.expires_at)}` : null;
  return (
    <div className="space-y-4" data-testid="order-status" data-status={order.status}>
      <SectionHeading size="content" data-testid="order-headline">
        {t(view.headline, { business_name: order.producer_name })}
      </SectionHeading>
      {view.waiting && deadline && <p className="text-fg-muted">{t("waiting", { deadline })}</p>}
      {view.when && (
        <WhenLine start={order.slot_start} end={order.slot_end} kind={view.when} address={order.pickup_address} />
      )}
      {view.code && (
        <div className="rounded-lg border border-border bg-surface p-4 text-center" data-testid="order-code">
          <p className="text-3xl font-black tracking-widest text-text" dir="ltr">{order.pickup_code}</p>
          <p className="text-sm text-fg-muted">{t("code")}</p>
        </div>
      )}
      {view.proposal && (
        <Proposal order={order} busy={Boolean(state.busy)} onAccept={() => run(acceptChange)} onCancel={() => setState({ asking: true })} />
      )}
      <Lines order={order} />
      {view.toPay && <p className="font-medium text-text">{t("to_pay", { total: shekelsText(toPayAgorot(order)) })}</p>}
      {state.error && !state.asking && <InlineMessage tone="error">{state.error}</InlineMessage>}
      {view.cancel === "cancel" && !view.proposal && (
        <Button variant="outlined" onClick={() => setState({ asking: true })} data-testid="order-cancel">{t("cancel")}</Button>
      )}
      {view.cancel === "too_late" && <p className="text-sm text-fg-muted">{t("too_late")}</p>}
      {state.asking && (
        <CancelDialog
          busy={Boolean(state.busy)}
          error={state.error ?? null}
          onClose={() => setState({})}
          onConfirm={() => run(cancelOrder)}
        />
      )}
    </div>
  );
}

/** @param {{ orderId: string }} props */
export default function OrderStatusClient({ orderId }) {
  const t = useTranslations("order_status");
  // A ref, not state: the body is read from the hash once, in the effect, and
  // nothing renders from it (react-hooks/set-state-in-effect).
  const ref = useRef(/** @type {object | null} */ (null));
  const [order, setOrder] = useState(/** @type {any} */ (null));
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const body = buyerRef(orderId, tokenFromHash(window.location.hash));
    ref.current = body;
    let live = true;
    readStatus(body)
      .then((read) => live && setOrder(read))
      .catch((/** @type {any} */ err) => {
        if (!live) return;
        const code = err?.response?.status;
        // 401 (no token, not logged in), 404 (wrong link, flag off), 422.
        if (code && code < 500 && code !== 429) setMissing(true);
        else setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [orderId]);

  if (missing) notFound();
  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6" data-testid="order-status-page">
      <h1 className="font-headline-md text-xl font-black text-text">{t("title")}</h1>
      {failed && <InlineMessage tone="error">{t("failed")}</InlineMessage>}
      {!order && !failed && <Skeleton count={2} testId="order-status-loading" />}
      {order && <OrderStatusView order={order} onChange={setOrder} refOf={() => /** @type {object} */ (ref.current)} />}
    </div>
  );
}
