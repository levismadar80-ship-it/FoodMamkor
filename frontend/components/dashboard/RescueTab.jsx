"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import api from "@/lib/api";
import { israelTime, leftoverGroupUrl, shekels } from "@/lib/rescue";

/**
 * Module:   RescueTab
 * Purpose:  The counter tool — today's codes, «אשר מסירה», «לא הגיע», the
 *           publish form, and the «בדרך כלל» editor.
 * Does NOT: take money or show who the buyer is. Handing a bag over needs
 *           four digits; the API deliberately returns no buyer identity.
 * Related:  backend GET /producers/me/rescue/orders · POST /rescue/orders/{id}/handed
 *           · POST /rescue/orders/{id}/no_show · PUT /producers/me/rescue/typical-items
 * History:  MEH-2649 (creation, chunk 5 of the rescue-bags pilot MEH-2643)
 */
const MAX_QTY = 20;

// The calendar date in Israel, YYYY-MM-DD. `toISOString()` is UTC, which is
// still yesterday between midnight and 02:00/03:00 Israel time, and the server
// refuses a bag dated in the past (MEH-2678).
const ISRAEL_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" });

export default function RescueTab() {
  const t = useTranslations("rescue.dashboard");
  const [orders, setOrders] = useState(null);
  const [code, setCode] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [items, setItems] = useState("");
  const [form, setForm] = useState({ qty_total: 4, price: 15, from: "18:00", to: "20:00" });
  // MEH-2678: the tab loads its own pickup points. It used to take them as a
  // prop that the only page rendering it never passed, so every publish
  // answered «צריך נקודת איסוף». The API lists the primary first.
  const [locations, setLocations] = useState([]);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/producers/me/rescue/orders");
      setOrders(Array.isArray(res.data) ? res.data : []);
    } catch {
      setOrders([]);
    }
  }, []);

  useEffect(() => {
    load();
    api
      .get("/producers/me/locations")
      .then((r) => setLocations(Array.isArray(r.data) ? r.data : []))
      .catch(() => setLocations([]));
    api
      .get("/producers/me/rescue/typical-items")
      .then((r) => setItems((r.data?.items || []).join(", ")))
      .catch(() => {});
  }, [load]);

  // Three counters, derived from one list so they cannot disagree with it.
  const counters = useMemo(() => {
    const rows = orders || [];
    return {
      reserved: rows.filter((o) => o.status === "reserved").length,
      handed: rows.filter((o) => o.status === "handed").length,
      no_show: rows.filter((o) => o.status === "no_show").length,
    };
  }, [orders]);

  async function act(order, what) {
    setBusyId(order.id);
    setNotice(null);
    try {
      await api.post(`/rescue/orders/${order.id}/${what}`);
      await load();
    } catch (err) {
      setNotice(err?.response?.data?.detail || t("failed"));
    } finally {
      setBusyId(null);
    }
  }

  function handByCode() {
    const match = (orders || []).find(
      (o) => o.pickup_code === code.trim() && o.status === "reserved",
    );
    if (!match) {
      setNotice(t("code_not_found"));
      return;
    }
    setCode("");
    act(match, "handed");
  }

  async function saveItems() {
    try {
      await api.put("/producers/me/rescue/typical-items", {
        items: items.split(",").map((s) => s.trim()).filter(Boolean),
      });
      setNotice(t("items_saved"));
    } catch {
      setNotice(t("failed"));
    }
  }

  async function publish(dayOffset = 0) {
    // A bag publishes the full address, so the server accepts only a point
    // marked exact; an approximate one would be refused with a 422.
    const location = locations.find((l) => l.location_precision === "exact");
    if (!location) {
      setNotice(t("no_location"));
      return;
    }
    const day = new Date();
    day.setDate(day.getDate() + dayOffset);
    const iso = (hhmm) => {
      const [h, m] = hhmm.split(":").map(Number);
      const d = new Date(day);
      d.setHours(h, m, 0, 0);
      return d.toISOString();
    };
    const cancel = new Date(new Date(iso(form.from)).getTime() - 30 * 60000).toISOString();
    try {
      await api.post("/rescue/offers", {
        producer_location_id: location.id,
        date: ISRAEL_DATE.format(day),
        qty_total: Number(form.qty_total),
        price_agorot: Number(form.price) * 100,
        pickup_start: iso(form.from),
        pickup_end: iso(form.to),
        cancel_until: cancel,
      });
      setNotice(t("published"));
      await load();
    } catch (err) {
      setNotice(err?.response?.data?.detail || t("failed"));
    }
  }

  const now = Date.now();
  // MEH-2702: the group for the town of the point bags are published from
  // (the same point publish() picks), national fallback otherwise.
  const leftoverHref = leftoverGroupUrl(
    locations.find((l) => l.location_precision === "exact")?.city,
  );

  return (
    <div data-testid="rescue-tab" className="space-y-6">
      <div className="grid grid-cols-3 gap-3" data-testid="rescue-counters">
        {["reserved", "handed", "no_show"].map((k) => (
          <div key={k} className="border border-border rounded-md px-3 py-3 text-center">
            <p className="font-headline-md text-2xl font-black text-text" data-testid={`rescue-counter-${k}`}>
              {counters[k]}
            </p>
            <p className="font-body-sm text-sm text-fg-muted">{t(`counter.${k}`)}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          maxLength={4}
          dir="ltr"
          placeholder={t("code_placeholder")}
          aria-label={t("code_label")}
          data-testid="rescue-code-input"
          className="flex-1 border border-border rounded-md px-3 py-2 text-center tracking-[0.3em]"
        />
        <button
          type="button"
          onClick={handByCode}
          data-testid="rescue-code-submit"
          className="bg-primary text-white px-4 rounded-md font-medium"
        >
          {t("hand_over")}
        </button>
      </div>

      {notice && (
        <p className="font-body-sm text-sm text-text" data-testid="rescue-tab-notice">
          {notice}
        </p>
      )}

      <section>
        <h3 className="font-headline-md text-base font-black text-text mb-2">{t("orders_title")}</h3>
        {orders === null && <p className="font-body-sm text-sm text-fg-muted">{t("loading")}</p>}
        {orders?.length === 0 && (
          <p className="font-body-sm text-sm text-fg-muted" data-testid="rescue-orders-empty">
            {t("orders_empty")}
          </p>
        )}
        <ul className="space-y-2">
          {(orders || []).map((o) => {
            // «לא הגיע» is only legal after the window closed — the server
            // refuses it earlier, so the button must not offer it earlier.
            const windowClosed = new Date(o.pickup_end).getTime() <= now;
            return (
              <li
                key={o.id}
                data-testid="rescue-order-row"
                className="flex items-center justify-between gap-3 border border-border rounded-md px-3 py-2"
              >
                <span dir="ltr" className="font-headline-md font-black tracking-[0.2em]" data-testid="rescue-order-code">
                  {o.pickup_code}
                </span>
                <span className="font-body-sm text-sm text-fg-muted">{t("qty", { qty: o.qty })}</span>
                {o.status === "handed" ? (
                  <span className="font-body-sm text-sm text-fg-muted" data-testid="rescue-order-handed">
                    {t("handed_at", { time: israelTime(o.handed_at) || "" })}
                  </span>
                ) : o.status === "reserved" ? (
                  <span className="flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === o.id}
                      onClick={() => act(o, "handed")}
                      data-testid="rescue-order-hand"
                      className="bg-primary text-white px-3 py-1 rounded-md font-body-sm text-sm disabled:opacity-50"
                    >
                      {t("hand_over")}
                    </button>
                    <button
                      type="button"
                      disabled={!windowClosed || busyId === o.id}
                      title={windowClosed ? undefined : t("no_show_too_early")}
                      onClick={() => act(o, "no_show")}
                      data-testid="rescue-order-noshow"
                      className="border border-border px-3 py-1 rounded-md font-body-sm text-sm disabled:opacity-40"
                    >
                      {t("no_show")}
                    </button>
                  </span>
                ) : (
                  <span className="font-body-sm text-sm text-fg-muted">{t(`status.${o.status}`)}</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="border border-border rounded-md px-4 py-4 space-y-3">
        <h3 className="font-headline-md text-base font-black text-text">{t("publish_title")}</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="font-body-sm text-sm">
            {t("field.qty")}
            <input
              type="number"
              min={1}
              max={MAX_QTY}
              value={form.qty_total}
              onChange={(e) => setForm({ ...form, qty_total: e.target.value })}
              data-testid="rescue-publish-qty"
              className="w-full border border-border rounded-md px-2 py-1 mt-1"
            />
          </label>
          <label className="font-body-sm text-sm">
            {t("field.price")}
            <input
              type="number"
              min={0}
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              data-testid="rescue-publish-price"
              className="w-full border border-border rounded-md px-2 py-1 mt-1"
            />
          </label>
          <label className="font-body-sm text-sm">
            {t("field.from")}
            <input
              type="time"
              value={form.from}
              onChange={(e) => setForm({ ...form, from: e.target.value })}
              data-testid="rescue-publish-from"
              className="w-full border border-border rounded-md px-2 py-1 mt-1"
            />
          </label>
          <label className="font-body-sm text-sm">
            {t("field.to")}
            <input
              type="time"
              value={form.to}
              onChange={(e) => setForm({ ...form, to: e.target.value })}
              data-testid="rescue-publish-to"
              className="w-full border border-border rounded-md px-2 py-1 mt-1"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => publish(0)}
          data-testid="rescue-publish-today"
          className="w-full bg-primary text-white py-2 rounded-md font-medium"
        >
          {t("publish_today", { price: shekels(Number(form.price) * 100) ?? form.price })}
        </button>
        <button
          type="button"
          onClick={() => publish(1)}
          data-testid="rescue-publish-tomorrow"
          className="w-full border border-primary text-primary py-2 rounded-md font-medium"
        >
          {t("publish_tomorrow", { n: form.qty_total })}
        </button>
      </section>

      <section className="border border-border rounded-md px-4 py-4 space-y-2">
        <h3 className="font-headline-md text-base font-black text-text">{t("items_title")}</h3>
        <p className="font-body-sm text-sm text-fg-muted">{t("items_help")}</p>
        <input
          value={items}
          onChange={(e) => setItems(e.target.value)}
          aria-label={t("items_title")}
          data-testid="rescue-items-input"
          className="w-full border border-border rounded-md px-3 py-2"
        />
        <button
          type="button"
          onClick={saveItems}
          data-testid="rescue-items-save"
          className="border border-primary text-primary px-4 py-2 rounded-md font-medium"
        >
          {t("items_save")}
        </button>
      </section>

      <p className="border border-border rounded-md px-4 py-3 font-body-sm text-sm text-fg-muted" data-testid="rescue-leftover-hint">
        {t("leftover_hint")}{" "}
        <a
          href={leftoverHref}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="rescue-leftover-link"
          className="text-primary underline underline-offset-2"
        >
          {t("leftover_link")}
        </a>
      </p>
    </div>
  );
}
