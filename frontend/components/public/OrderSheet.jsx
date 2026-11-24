// @ts-check
"use client";
/**
 * Module:   OrderSheet
 * Purpose:  The order request itself, opened from the order bar: how she
 *           gets it, when, her name and phone (proved by a WhatsApp code, unless it is her verified account phone), a
 *           note, the price with the delivery fee, the disclosure lines, and
 *           «שליחת הבקשה». On success the page moves to the order's status
 *           page, its token in the hash.
 * Does NOT: price anything (POST /product-orders/quote does) or decide what
 *           can be ordered (lib/order-cart.js). The phone and code fields
 *           live in OrderSheetPhone.jsx.
 * Related:  lib/order-sheet.js (bodies + calls), components/public/OrderBar.jsx
 *           (opens it), app/[locale]/order/[id]/ (where it lands)
 * History:  MEH-3216 stage 5c (creation); MEH-3216 the seller line («מספר עוסק»);
 *           MEH-3658 ways and slots as buttons, the note behind a link, the
 *           total on the send button, four disclosure lines down to two
 *           MEH-3618 (slots only on days every picked product is made)
 *           MEH-3640 what she typed survives closing the sheet, and a line
 *           says why «שליחת הבקשה» waits for a city
 *           MEH-3746 inside the owner's preview: no quote, the send button
 *           says it cannot send
 *           MEH-3763 the seller line when no business number is set yet
 *           (owner's preview only)
 */

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import Input from "@/components/ui/Input";
import InlineMessage from "@/components/ui/InlineMessage";
import ButtonSpinner from "@/components/ButtonSpinner";
import OrderSheetDayConflict from "@/components/public/OrderSheetDayConflict";
import OrderSheetPhone from "@/components/public/OrderSheetPhone";
import { NoteField, SlotChoice, WayChoice } from "@/components/public/OrderSheetChoices";
import { useRouter } from "@/i18n/navigation";
import { useOptionalAuth } from "@/lib/auth-context";
import { usePreviewMode } from "@/lib/preview-mode";
import { detailToMessage } from "@/lib/errors";
import { dayLabel, hhmm, shekelsText } from "@/lib/product-orders";
import {
  cancelDeadline,
  fulfilmentsOffered,
  newOrderKey,
  orderBody,
  quoteBody,
  quoteOrder,
  sameIlPhone,
  sendOrder,
  slotsFor,
} from "@/lib/order-sheet";
import { pickedLine } from "@/lib/order-cart";
import { splitKey } from "@/lib/product-variants";
import { cartSlots, cartWays, removeFromCart } from "@/lib/product-weekdays";

const QUOTE_DELAY_MS = 400;

// MEH-3640 (Nielsen #3, user control): closing the sheet used to throw away
// her name, phone and address. Kept here, per business, for this page visit
// only: memory, never storage, because it is personal data. The code, the
// slot and the age box are not kept: each belongs to one attempt.
const KEPT_FIELDS = /** @type {const} */ (["fulfilment", "city", "address", "name", "phone", "note"]);
/** @type {Map<string, Record<string, string>>} */
const drafts = new Map();

/** Tests only: start every case from an empty sheet. */
export function forgetOrderDrafts() {
  drafts.clear();
}

/** @param {Record<string, any>} form */
function keptPart(form) {
  return Object.fromEntries(KEPT_FIELDS.map((k) => [k, form[k]]));
}
const CONFLICT = 409;
const UNPROCESSABLE = 422;

/**
 * @param {{
 *   producer: any,
 *   menu: import("@/lib/order-cart").OrderMenu,
 *   picks: Record<string, number>,
 *   onStale?: () => void,
 *   onChange?: (key: string, qty: number) => void,
 *   onClose: () => void,
 * }} props
 */
export default function OrderSheet({ producer, menu, picks, onStale = () => {}, onChange = () => {}, onClose }) {
  const t = useTranslations("producer.detail.order_sheet");
  const locale = useLocale();
  const router = useRouter();
  const byId = useMemo(() => new Map(menu.products.map((p) => [p.id, p])), [menu]);
  const hasAlcohol = Object.keys(picks).some((key) => byId.get(splitKey(key).productId)?.contains_alcohol);
  const ways = cartWays(fulfilmentsOffered(menu, hasAlcohol), { slotsOf: (w) => slotsFor(menu, w, hasAlcohol), picks, byId }); // MEH-3618
  // MEH-3680: a signed-in buyer starts with her name, and her phone when it is
  // verified; to that phone she orders without a code (the route agrees).
  const me = /** @type {any} */ (useOptionalAuth())?.user ?? null;
  const [form, setForm] = useState(() => {
    const blank = {
      fulfilment: ways[0] ?? "pickup",
      slot: "",
      city: "",
      address: "",
      name: me?.name ?? "",
      phone: me?.phone_verified ? (me.phone ?? "") : "",
      code: "",
      note: "",
      age: false,
    };
    const kept = drafts.get(producer.id);
    // A kept fulfilment the menu no longer offers falls back to the first.
    if (kept && !(/** @type {string[]} */ (ways)).includes(kept.fulfilment)) return { ...blank, ...kept, fulfilment: blank.fulfilment };
    return { ...blank, ...kept };
  });
  useEffect(() => {
    drafts.set(producer.id, keptPart(form));
  }, [producer.id, form]);
  const [key] = useState(newOrderKey);
  // MEH-3680 review: the server refused the codeless send (her phone changed
  // elsewhere, or the hourly bound) — from here on she proves it with a code.
  const [codeAsked, setCodeAsked] = useState(false);
  const verified = !codeAsked && Boolean(me?.phone_verified) && sameIlPhone(form.phone, me?.phone);
  // Auth can resolve after the sheet opened: fill what is still empty.
  useEffect(() => {
    if (!me) return;
    setForm((old) => ({
      ...old,
      name: old.name || (me.name ?? ""),
      phone: old.phone || (me.phone_verified ? (me.phone ?? "") : ""),
    }));
  }, [me]);
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

  // MEH-3618: only days on which every picked product is made.
  const fulfilment = ways.includes(form.fulfilment) ? form.fulfilment : (ways[0] ?? form.fulfilment); // MEH-3618: a way the cart lost
  const { slots, limiting } = cartSlots(slotsFor(menu, fulfilment, hasAlcohol), picks, byId);
  // MEH-3618: a picked slot the cart no longer allows is dropped. MEH-3658: a
  // single slot is picked for her; with more she taps one.
  const slot = slots.some((s) => s.start === form.slot) ? form.slot : slots.length === 1 ? slots[0].start : "";
  const delivery = fulfilment === "delivery";
  const body = JSON.stringify(quoteBody({ producerId: producer.id, picks, fulfilment, city: form.city }));
  const needsCity = delivery && !form.city.trim();
  // MEH-3746: the owner's preview asks no quote — the quote route refuses a
  // business whose ordering is off — and cannot send.
  const preview = usePreviewMode();
  useQuote(needsCity || preview ? null : body, setAnswer, setQuoteError, onStale);
  const quote = answer && answer.body === body ? answer.quote : null;

  const submit = async (/** @type {any} */ e) => {
    e.preventDefault();
    if (preview) return; // Enter in a field submits the form too (MEH-3746)
    setBusy(true);
    setError(null);
    try {
      const href = await sendOrder(
        orderBody({ producerId: producer.id, picks, ...form, fulfilment, code: verified ? "" : form.code, slotStart: slot, ageDeclared: form.age, key }),
      );
      drafts.delete(producer.id);
      router.push(href);
    } catch (err) {
      const res = /** @type {any} */ (err)?.response;
      setError(detailToMessage(res?.data?.detail) || t("failed"));
      if (res?.status === CONFLICT) onStale();
      if (verified && res?.status === UNPROCESSABLE) setCodeAsked(true);
      setBusy(false);
    }
  };

  const deadline = slot ? cancelDeadline(slot, menu.cancel_cutoff_hours) : null;
  return (
    <Dialog onClose={onClose} labelledBy="order-sheet-title" size="lg" as="form" onSubmit={submit} closeOnBackdrop={false} testId="order-sheet">
      <h2 id="order-sheet-title" className="text-xl font-bold text-text mb-4">{t("title")}</h2>
      <Lines picks={picks} byId={byId} />
      <div className="space-y-4 mt-4">
        <WayChoice ways={ways} value={fulfilment} onChange={(way) => set({ fulfilment: /** @type {typeof form.fulfilment} */ (way), slot: "" })} />
        {limiting ? (
          <OrderSheetDayConflict product={limiting} onRemove={() => removeFromCart(limiting.id, { picks, onChange, onClose })} />
        ) : slots.length === 0 ? (
          <InlineMessage tone="info">{t("no_slots")}</InlineMessage>
        ) : (
          <SlotChoice key={fulfilment} slots={slots} value={slot} onChange={(start) => set({ slot: start })} />
        )}
        {delivery && (
          <>
            <Input label={t("city")} required value={form.city} onChange={(e) => set({ city: e.target.value })} autoComplete="address-level2" data-testid="order-sheet-city" />
            <Input label={t("address")} required value={form.address} onChange={(e) => set({ address: e.target.value })} autoComplete="street-address" data-testid="order-sheet-address" />
          </>
        )}
        <Input label={t("name")} required value={form.name} onChange={(e) => set({ name: e.target.value })} autoComplete="name" data-testid="order-sheet-name" />
        <OrderSheetPhone producerId={producer.id} phone={form.phone} code={form.code} verified={verified} onChange={set} />
        <NoteField value={form.note} onChange={(note) => set({ note })} />
        {hasAlcohol && (
          <label className="flex items-start gap-2 text-sm text-text">
            <input type="checkbox" required checked={form.age} onChange={(e) => set({ age: e.target.checked })} data-testid="order-sheet-age" />
            {t("age")}
          </label>
        )}
      </div>
      <Totals quote={quote} delivery={delivery} t={t} />
      <Disclosures producer={producer} menu={menu} deadline={deadline} locale={locale} t={t} />
      {quoteError && <InlineMessage tone="error" className="mt-3">{quoteError}</InlineMessage>}
      {error && <InlineMessage tone="error" className="mt-3">{error}</InlineMessage>}
      <div className="mt-5 flex gap-3">
        <Button type="submit" disabled={preview || busy || !slot || !quote} data-testid="order-sheet-send" className="flex-1">
          {busy && <ButtonSpinner />}
          {preview ? t("preview_send") : sendLabel(quote, t)}
        </Button>
        <Button type="button" variant="outlined" onClick={onClose} data-autofocus="">{t("close")}</Button>
      </div>
      {needsCity && slots.length > 0 && (
        <p className="mt-2 text-sm text-fg-muted" data-testid="order-sheet-needs-city">{t("needs_city")}</p>
      )}
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

/** @param {Map<string, any>} byId @param {string} key */
function lineName(byId, key) {
  const line = pickedLine(byId, key);
  const product = line?.product ?? byId.get(splitKey(key).productId);
  return line?.variant ? `${product?.name} · ${line.variant.name}` : product?.name;
}

function Lines({ picks, byId }) {
  return (
    <ul className="divide-y divide-border-subtle text-sm" data-testid="order-sheet-lines">
      {Object.entries(picks).map(([key, qty]) => (
        <li key={key} className="flex justify-between gap-3 py-1.5">
          {/* MEH-3617: «{product} · {variant}» */}
          <span className="text-text">{lineName(byId, key)}</span>
          <span className="text-fg-muted shrink-0">× {qty}</span>
        </li>
      ))}
    </ul>
  );
}

/** «שליחת הבקשה · 56 ₪» once the server priced what is on the form (MEH-3658). */
function sendLabel(quote, t) {
  if (!quote) return t("send");
  return t(quote.has_estimate ? "send_total_estimate" : "send_total", { total: shekelsText(quote.total_agorot) });
}

function Totals({ quote, delivery, t }) {
  if (!quote || !delivery) return null;
  return (
    <p className="mt-4 text-sm text-fg-muted" role="status" data-testid="order-sheet-totals">
      {t("delivery_fee", { fee: shekelsText(quote.delivery_fee_agorot) })}
    </p>
  );
}

function Disclosures({ producer, menu, deadline, locale, t }) {
  const methods = producer?.payment_info?.methods ?? [];
  const payment = usePaymentText(methods, t);
  const cancel = deadline ? t("cancel_line", { cutoff: `${dayLabel(deadline, locale)} ${hhmm(deadline)}` }) : "";
  // MEH-3658: payment and cancel share one line; the seller and «not a party»
  // share the other. Both are what distance selling asks for (MEH-3216) —
  // shorter wording, nothing hidden behind a tap.
  const terms = [payment, cancel].filter(Boolean).join(" ");
  return (
    <div className="mt-4 space-y-1 text-xs text-fg-muted" data-testid="order-sheet-disclosures">
      {terms && <p data-testid="order-sheet-terms">{terms}</p>}
      {/* MEH-3216: the seller's identity before the order, as distance selling requires.
          The city only: the street address stays private (MEH-829). */}
      <p data-testid="order-sheet-seller">
        {/* MEH-3763: an empty number reaches only the owner's preview (a buyer's menu always has one). */}
        {menu.business_id_number
          ? t("seller_line", { name: producer?.name ?? "", number: menu.business_id_number, city: producer?.city?.trim() || "none" })
          : t("seller_line_no_number", { name: producer?.name ?? "", city: producer?.city?.trim() || "none" })}
      </p>
    </div>
  );
}

function usePaymentText(methods, t) {
  const tm = useTranslations("whatsapp.question_chips.payment_methods");
  return methods.length > 0 ? t("payment_line", { methods: methods.map((m) => tm(m)).join(", ") }) : "";
}
