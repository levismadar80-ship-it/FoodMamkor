// @ts-check
"use client";
/**
 * Module:   OrderSheet
 * Purpose:  The order request itself, opened from the order bar: how she
 *           gets it, when, her name and phone (proved by a WhatsApp code), a
 *           note, the price with the delivery fee, the disclosure lines, and
 *           «שליחת הבקשה». On success the page moves to the order's status
 *           page, its token in the hash.
 * Does NOT: price anything (POST /product-orders/quote does) or decide what
 *           can be ordered (lib/order-cart.js). The phone and code fields
 *           live in OrderSheetPhone.jsx.
 * Related:  lib/order-sheet.js (bodies + calls), components/public/OrderBar.jsx
 *           (opens it), app/[locale]/order/[id]/ (where it lands)
 * History:  MEH-3216 stage 5c (creation)
 */

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import Input from "@/components/ui/Input";
import InlineMessage from "@/components/ui/InlineMessage";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import ButtonSpinner from "@/components/ButtonSpinner";
import OrderSheetPhone from "@/components/public/OrderSheetPhone";
import { useRouter } from "@/i18n/navigation";
import { detailToMessage } from "@/lib/errors";
import { dayLabel, hhmm, rangeEnds, shekelsText } from "@/lib/product-orders";
import {
  cancelDeadline,
  fulfilmentsOffered,
  newOrderKey,
  orderBody,
  quoteBody,
  quoteOrder,
  sendOrder,
  slotsFor,
} from "@/lib/order-sheet";

const QUOTE_DELAY_MS = 400;
const CONFLICT = 409;

/**
 * @param {{
 *   producer: any,
 *   menu: import("@/lib/order-cart").OrderMenu,
 *   picks: Record<string, number>,
 *   onStale?: () => void,
 *   onClose: () => void,
 * }} props
 */
export default function OrderSheet({ producer, menu, picks, onStale = () => {}, onClose }) {
  const t = useTranslations("producer.detail.order_sheet");
  const locale = useLocale();
  const router = useRouter();
  const byId = useMemo(() => new Map(menu.products.map((p) => [p.id, p])), [menu]);
  const hasAlcohol = Object.keys(picks).some((id) => byId.get(id)?.contains_alcohol);
  const ways = fulfilmentsOffered(menu, hasAlcohol);
  const [form, setForm] = useState(() => ({
    fulfilment: ways[0] ?? "pickup",
    slot: "",
    city: "",
    address: "",
    name: "",
    phone: "",
    code: "",
    note: "",
    age: false,
  }));
  const [key] = useState(newOrderKey);
  // The quote together with the request it answers: a total is shown, and
  // «שליחת הבקשה» enabled, only when it answers what is on the form now — a
  // pickup total must never stand in for a delivery (fresh review of #4837).
  const [answer, setAnswer] = useState(/** @type {{ body: string, quote: any } | null} */ (null));
  const [error, setError] = useState(/** @type {string | null} */ (null));
  // Kept apart from `error`: a quote that arrives after a failed send must
  // not wipe the send's message.
  const [quoteError, setQuoteError] = useState(/** @type {string | null} */ (null));
  const [busy, setBusy] = useState(false);
  /** @param {Partial<typeof form>} change */
  const set = (change) => setForm((old) => ({ ...old, ...change }));

  const slots = slotsFor(menu, form.fulfilment, hasAlcohol);
  const delivery = form.fulfilment === "delivery";
  const body = JSON.stringify(quoteBody({ producerId: producer.id, picks, fulfilment: form.fulfilment, city: form.city }));
  const needsCity = delivery && !form.city.trim();
  useQuote(needsCity ? null : body, setAnswer, setQuoteError, onStale);
  const quote = answer && answer.body === body ? answer.quote : null;

  const submit = async (/** @type {any} */ e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const href = await sendOrder(
        orderBody({ producerId: producer.id, picks, ...form, slotStart: form.slot, ageDeclared: form.age, key }),
      );
      router.push(href);
    } catch (err) {
      const res = /** @type {any} */ (err)?.response;
      setError(detailToMessage(res?.data?.detail) || t("failed"));
      if (res?.status === CONFLICT) onStale();
      setBusy(false);
    }
  };

  const deadline = form.slot ? cancelDeadline(form.slot, menu.cancel_cutoff_hours) : null;
  return (
    <Dialog onClose={onClose} labelledBy="order-sheet-title" size="lg" as="form" onSubmit={submit} closeOnBackdrop={false} testId="order-sheet">
      <h2 id="order-sheet-title" className="text-xl font-bold text-text mb-4">{t("title")}</h2>
      <Lines picks={picks} byId={byId} />
      <div className="space-y-4 mt-4">
        {ways.length > 1 && (
          <Select label={t("how")} value={form.fulfilment} onChange={(e) => set({ fulfilment: e.target.value, slot: "" })} data-testid="order-sheet-fulfilment">
            {ways.map((w) => <option key={w} value={w}>{t(w)}</option>)}
          </Select>
        )}
        {slots.length === 0 ? (
          <InlineMessage tone="info">{t("no_slots")}</InlineMessage>
        ) : (
          <Select label={t("when")} required value={form.slot} onChange={(e) => set({ slot: e.target.value })} data-testid="order-sheet-slot">
            <option value="" disabled>{t("when_pick")}</option>
            {slots.map((s) => (
              <option key={s.start} value={s.start}>
                {t("slot", { day: dayLabel(s.start, locale), ...rangeEnds(s.start, s.end) })}
              </option>
            ))}
          </Select>
        )}
        {delivery && (
          <>
            <Input label={t("city")} required value={form.city} onChange={(e) => set({ city: e.target.value })} autoComplete="address-level2" data-testid="order-sheet-city" />
            <Input label={t("address")} required value={form.address} onChange={(e) => set({ address: e.target.value })} autoComplete="street-address" data-testid="order-sheet-address" />
          </>
        )}
        <Input label={t("name")} required value={form.name} onChange={(e) => set({ name: e.target.value })} autoComplete="name" data-testid="order-sheet-name" />
        <OrderSheetPhone producerId={producer.id} phone={form.phone} code={form.code} onChange={set} />
        <Textarea label={t("note")} value={form.note} onChange={(e) => set({ note: e.target.value })} maxLength={500} rows={2} data-testid="order-sheet-note" />
        {hasAlcohol && (
          <label className="flex items-start gap-2 text-sm text-text">
            <input type="checkbox" required checked={form.age} onChange={(e) => set({ age: e.target.checked })} data-testid="order-sheet-age" />
            {t("age")}
          </label>
        )}
      </div>
      <Totals quote={quote} delivery={delivery} t={t} />
      <Disclosures producer={producer} deadline={deadline} locale={locale} t={t} />
      {quoteError && <InlineMessage tone="error" className="mt-3">{quoteError}</InlineMessage>}
      {error && <InlineMessage tone="error" className="mt-3">{error}</InlineMessage>}
      <div className="mt-5 flex gap-3">
        <Button type="submit" disabled={busy || slots.length === 0 || !quote} data-testid="order-sheet-send" className="flex-1">
          {busy && <ButtonSpinner />}
          {t("send")}
        </Button>
        <Button type="button" variant="outlined" onClick={onClose} data-autofocus="">{t("close")}</Button>
      </div>
    </Dialog>
  );
}

/**
 * The quote for `body` (null: nothing to ask yet, e.g. a delivery with no
 * city). A 409 may mean a pick sold out since the page loaded, so the menu is
 * read again; the picks then drop it and the body changes.
 */
function useQuote(body, setAnswer, setError, onStale) {
  useEffect(() => {
    if (!body) return undefined;
    let live = true;
    const timer = setTimeout(() => {
      quoteOrder(JSON.parse(body))
        .then((quote) => { if (live) { setAnswer({ body, quote }); setError(null); } })
        .catch((err) => {
          if (!live) return;
          setError(detailToMessage(err?.response?.data?.detail));
          if (err?.response?.status === CONFLICT) onStale();
        });
    }, QUOTE_DELAY_MS);
    return () => { live = false; clearTimeout(timer); };
  }, [body, setAnswer, setError, onStale]);
}

function Lines({ picks, byId }) {
  return (
    <ul className="divide-y divide-border-subtle text-sm" data-testid="order-sheet-lines">
      {Object.entries(picks).map(([id, qty]) => (
        <li key={id} className="flex justify-between gap-3 py-1.5">
          <span className="text-text">{byId.get(id)?.name}</span>
          <span className="text-fg-muted shrink-0">× {qty}</span>
        </li>
      ))}
    </ul>
  );
}

function Totals({ quote, delivery, t }) {
  if (!quote) return null;
  return (
    <div className="mt-4 space-y-1 text-sm" role="status" data-testid="order-sheet-totals">
      {delivery && <p className="text-fg-muted">{t("delivery_fee", { fee: shekelsText(quote.delivery_fee_agorot) })}</p>}
      <p className="font-bold text-text">
        {t(quote.has_estimate ? "total_estimate" : "total", { total: shekelsText(quote.total_agorot) })}
      </p>
    </div>
  );
}

function Disclosures({ producer, deadline, locale, t }) {
  const methods = producer?.payment_info?.methods ?? [];
  return (
    <div className="mt-4 space-y-1 text-xs text-fg-muted" data-testid="order-sheet-disclosures">
      {methods.length > 0 && <PaymentLine methods={methods} t={t} />}
      {deadline && <p>{t("cancel_line", { cutoff: `${dayLabel(deadline, locale)} ${hhmm(deadline)}` })}</p>}
      <p>{t("platform_line")}</p>
    </div>
  );
}

function PaymentLine({ methods, t }) {
  const tm = useTranslations("whatsapp.question_chips.payment_methods");
  return <p>{t("payment_line", { methods: methods.map((m) => tm(m)).join(", ") })}</p>;
}
