"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link as LocaleLink } from "@/i18n/navigation";

import api from "@/lib/api";
import { ALLERGEN_CODES, toggleAllergen } from "@/lib/allergens";
import { detailToMessage, errorMessage } from "@/lib/errors";
import { israelTime, leftoverGroupUrl, shekels } from "@/lib/rescue";
import Button from "@/components/ui/Button";

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

const ORDER_RANK = { reserved: 0, handed: 1, no_show: 2, cancelled: 3 };
// Minutes before pickup_start that free cancellation ends, and the message key.
const CANCEL_CUTOFFS = [
  [30, "half_hour"],
  [60, "hour"],
  [120, "two_hours"],
];

// MEH-2730: the boxes a message can belong to (see `notice` below).
const AT = { code: "code", orders: "orders", publish: "publish", items: "items", leftover: "leftover" };

export default function RescueTab() {
  const t = useTranslations("rescue.dashboard");
  // The allergen LABELS are the product sheet's, not a second copy: one
  // vocabulary for the whole site (MEH-2662).
  const tProducts = useTranslations("settings.products.form");
  const tError = useTranslations("error");
  const [orders, setOrders] = useState(null);
  const [code, setCode] = useState("");
  const [busyId, setBusyId] = useState(null);
  // MEH-2730: { at, text } — `at` names the box the message belongs to, so it
  // renders next to the control that caused it. It used to be one line under
  // the code box for every action on the screen: a refused PUBLISH, far below,
  // showed up there as «משהו נתקע» and read as a failed handover (Sapir 6/11).
  const [notice, setNoticeState] = useState(null);
  // `error` picks the live-region role: a refusal is announced at once
  // (alert), a confirmation politely (status).
  const setNotice = (at, text, error = true) => setNoticeState(text ? { at, text, error } : null);
  const clearNotice = () => setNoticeState(null);
  // Two paths (MEH-2745). No response, 401, 429 and 5xx get the site's own
  // sentences (error.mapper.*, via errorMessage): the text in those comes
  // from the auth layer, slowapi or a proxy, not written for the owner.
  // Any other 4xx shows the server's own sentence — string, {code, message}
  // (the verified-email gate) or a 422 list — or the generic line. A raw
  // object here used to reach JSX as a child and could not render.
  const reason = (err) => {
    const status = err?.response?.status;
    if (!err?.response || status === 401 || status === 429 || status >= 500) {
      return errorMessage(err, tError);
    }
    return detailToMessage(err.response.data?.detail) || t("failed");
  };
  const [items, setItems] = useState("");
  // MEH-2752: null = this business declared nothing, which is NOT the same as
  // an empty selection the owner is mid-way through making. The save turns an
  // empty selection into null on the wire; see allergens.py for why [] must
  // never persist.
  const [allergens, setAllergens] = useState([]);
  const [form, setForm] = useState({ qty_total: 4, price: 15, from: "18:00", to: "20:00", cancelMin: 30 });
  // MEH-2678: the tab loads its own pickup points. It used to take them as a
  // prop that the only page rendering it never passed, so every publish
  // answered «צריך נקודת איסוף». The API lists the primary first.
  const [locations, setLocations] = useState([]);
  // Known only after the list answers: the "add an address" box must not
  // flash while it loads, nor replace the form when the request failed.
  const [locationsLoaded, setLocationsLoaded] = useState(false);

  // MEH-2703: today's bags with what was not collected. Reloaded with the
  // orders, so marking «לא הגיע» updates the leftover count at once.
  const [offers, setOffers] = useState([]);
  const [businessName, setBusinessName] = useState("");
  const [donating, setDonating] = useState(false);
  // How many of the leftover bags were given away; null = all of them.
  const [donateQty, setDonateQty] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/producers/me/rescue/orders");
      setOrders(Array.isArray(res.data) ? res.data : []);
    } catch {
      setOrders([]);
    }
    try {
      const res = await api.get("/producers/me/rescue/offers");
      setOffers(Array.isArray(res.data) ? res.data : []);
    } catch {
      setOffers([]);
    }
  }, []);

  useEffect(() => {
    load();
    api
      .get("/producers/me/locations")
      .then((r) => {
        setLocations(Array.isArray(r.data) ? r.data : []);
        setLocationsLoaded(true);
      })
      .catch(() => setLocations([]));
    api
      .get("/producers/me")
      .then((r) => setBusinessName(typeof r.data?.name === "string" ? r.data.name : ""))
      // Silent on purpose: without a name the WhatsApp button stays hidden.
      .catch(() => {});
    api
      .get("/producers/me/rescue/typical-items")
      .then((r) => {
        setItems((r.data?.items || []).join(", "));
        setAllergens(r.data?.allergens || []);
      })
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
  // Orders still waiting at the counter first, cancelled ones last; the
  // server order is kept inside each group.
  const sortedOrders = useMemo(
    () =>
      [...(orders || [])].sort(
        (a, b) => (ORDER_RANK[a.status] ?? 9) - (ORDER_RANK[b.status] ?? 9),
      ),
    [orders],
  );

  async function act(order, what, at = "orders") {
    setBusyId(order.id);
    clearNotice();
    try {
      await api.post(`/rescue/orders/${order.id}/${what}`);
      await load();
    } catch (err) {
      setNotice(at, reason(err));
    } finally {
      setBusyId(null);
    }
  }

  function handByCode() {
    const match = (orders || []).find(
      (o) => o.pickup_code === code.trim() && o.status === "reserved",
    );
    if (!match) {
      setNotice("code", t("code_not_found"));
      return;
    }
    setCode("");
    act(match, "handed", "code");
  }

  async function saveItems() {
    clearNotice();
    try {
      await api.put("/producers/me/rescue/typical-items", {
        items: items.split(",").map((s) => s.trim()).filter(Boolean),
        // Nothing ticked is sent as [] and the server stores NULL. It is not
        // sent as "no allergens": the owner ticking nothing is not a claim
        // that the bag contains none of them.
        allergens,
      });
      setNotice("items", t("items_saved"), false);
    } catch (err) {
      setNotice("items", reason(err));
    }
  }

  // A bag publishes the full address, so the server accepts only a point
  // marked exact; an approximate one would be refused with a 422. One lookup
  // feeds both publish() and the leftover-group link (MEH-2702), so the link
  // always names the town the bags are actually published from.
  const exactLocation = locations.find((l) => l.location_precision === "exact");

  async function publish(dayOffset = 0) {
    clearNotice();
    const location = exactLocation;
    if (!location) {
      setNotice("publish", t("no_location"));
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
    // MEH-2722: the business picks how long before pickup free cancellation
    // ends (Sapir 6/11); half an hour is the default and the old fixed value.
    const cancel = new Date(
      new Date(iso(form.from)).getTime() - Number(form.cancelMin) * 60000,
    ).toISOString();
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
      setNotice("publish", t("published"), false);
      await load();
    } catch (err) {
      setNotice("publish", reason(err));
    }
  }

  const now = Date.now();
  // MEH-2702: the group for the town of the point bags are published from,
  // national fallback otherwise.
  const leftoverHref = leftoverGroupUrl(exactLocation?.city);
  // MEH-2703: bags not collected once the window closed (the server returns
  // 0 before pickup_end), and how many of them the business gave away.
  const leftoverRows = offers.filter((o) => Number(o.leftover) > 0);
  const leftoverTotal = leftoverRows.reduce((n, o) => n + Number(o.leftover), 0);
  const donatedTotal = leftoverRows.reduce((n, o) => n + Number(o.qty_donated || 0), 0);
  // Today's bags whose window is still open: the box will appear after it,
  // so the business is told where to look instead of finding it by chance.
  const upcoming = offers.some((o) => o.status === "active" && new Date(o.pickup_end).getTime() > now);
  const chosenQty = donateQty === null ? leftoverTotal : Math.min(donateQty, leftoverTotal);
  // No recipient in the link: the business picks the contact or group in
  // WhatsApp itself, so nothing about who receives it is stored here.
  const shareHref = `https://wa.me/?text=${encodeURIComponent(
    t("leftover_share_text", {
      count: leftoverTotal,
      name: businessName,
      city: exactLocation?.city || "",
    }),
  )}`;

  // `total` bags spread over today's offers in order, each capped at its own
  // leftover. A set, not an increment, so 0 undoes the report.
  async function markDonated(total) {
    setDonating(true);
    clearNotice();
    try {
      let rest = total;
      for (const o of leftoverRows) {
        const qty = Math.min(Number(o.leftover), rest);
        rest -= qty;
        await api.put(`/producers/me/rescue/offers/${o.id}/donated`, { qty });
      }
      setDonateQty(null);
    } catch (err) {
      setNotice("leftover", reason(err));
    } finally {
      // Reload even after a failure: earlier offers in the loop may already
      // be saved, and the box must show what the server holds.
      await load();
      setDonating(false);
    }
  }

  // One message on screen at most, rendered inside the box it belongs to.
  const noticeAt = (at) =>
    notice?.at === at ? (
      <p
        className="font-body-sm text-sm text-text"
        role={notice.error ? "alert" : "status"}
        data-testid="rescue-tab-notice"
      >
        {notice.text}
      </p>
    ) : null;

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

      <div className="space-y-2" data-notice-scope="code">
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
          <Button
            type="button"
            onClick={handByCode}
            data-testid="rescue-code-submit"
            variant="primary"
          >
            {t("hand_over")}
          </Button>
        </div>
        {noticeAt(AT.code)}
      </div>

      <section data-notice-scope="orders">
        <h3 className="font-headline-md text-base font-black text-text mb-2">{t("orders_title")}</h3>
        {orders === null && <p className="font-body-sm text-sm text-fg-muted">{t("loading")}</p>}
        {orders?.length === 0 && (
          <p className="font-body-sm text-sm text-fg-muted" data-testid="rescue-orders-empty">
            {t("orders_empty")}
          </p>
        )}
        <ul className="space-y-2">
          {sortedOrders.map((o) => {
            // «לא הגיע» is only legal after the window closed — the server
            // refuses it earlier, so the button must not offer it earlier.
            const windowClosed = new Date(o.pickup_end).getTime() <= now;
            return (
              <li
                key={o.id}
                data-testid="rescue-order-row"
                // A fixed grid, so code and quantity line up whatever the
                // status cell holds (two buttons, a time, or one word).
                className="grid grid-cols-[3.5rem_4rem_1fr] items-center gap-2 border border-border rounded-md px-3 py-2"
              >
                <span dir="ltr" className="font-headline-md font-black tracking-[0.2em]" data-testid="rescue-order-code">
                  {o.pickup_code}
                </span>
                <span className="font-body-sm text-sm text-fg-muted">{t("qty", { qty: o.qty })}</span>
                {o.status === "handed" ? (
                  <span className="justify-self-end font-body-sm text-sm text-fg-muted" data-testid="rescue-order-handed">
                    {t("handed_at", { time: israelTime(o.handed_at) || "" })}
                  </span>
                ) : o.status === "reserved" ? (
                  <span className="justify-self-end flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === o.id}
                      onClick={() => act(o, "handed")}
                      data-testid="rescue-order-hand"
                      className="whitespace-nowrap bg-primary text-white px-3 py-1 rounded-md font-body-sm text-sm disabled:opacity-50"
                    >
                      {t("hand_over")}
                    </button>
                    <button
                      type="button"
                      disabled={!windowClosed || busyId === o.id}
                      title={windowClosed ? undefined : t("no_show_too_early")}
                      onClick={() => act(o, "no_show")}
                      data-testid="rescue-order-noshow"
                      className="whitespace-nowrap border border-border px-3 py-1 rounded-md font-body-sm text-sm disabled:opacity-40"
                    >
                      {t("no_show")}
                    </button>
                  </span>
                ) : (
                  <span className="justify-self-end font-body-sm text-sm text-fg-muted">{t(`status.${o.status}`)}</span>
                )}
              </li>
            );
          })}
        </ul>
        {noticeAt(AT.orders)}
      </section>

      {locationsLoaded && !exactLocation ? (
        // MEH-2702: say what is missing up front, instead of an error after «לפרסם».
        <section
          className="border border-border rounded-md px-4 py-4 space-y-3"
          data-testid="rescue-needs-address"
        >
          <p className="font-body-sm text-sm text-text">{t("needs_address")}</p>
          <p className="font-body-sm text-sm text-fg-muted">{t("needs_address_privacy")}</p>
          <LocaleLink
            href="/producer/dashboard/edit#locations"
            data-testid="rescue-needs-address-link"
            className="block w-full text-center bg-primary text-white py-2 rounded-md font-medium"
          >
            {t("needs_address_cta")}
          </LocaleLink>
        </section>
      ) : (
        <section className="border border-border rounded-md px-4 py-4 space-y-3" data-notice-scope="publish">
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
            <label className="font-body-sm text-sm min-w-0">
              {t("field.from")}
              {/* MEH-2730: iOS Safari draws a time input wider than its grid
                  column (it overflowed the card on Sapir's iPhone); min-w-0
                  on both the grid item and the input lets it shrink. */}
              <input
                type="time"
                value={form.from}
                onChange={(e) => setForm({ ...form, from: e.target.value })}
                data-testid="rescue-publish-from"
                className="block w-full min-w-0 border border-border rounded-md px-2 py-1 mt-1"
              />
            </label>
            <label className="font-body-sm text-sm min-w-0">
              {t("field.to")}
              {/* MEH-2730: min-w-0 for iOS, see the «from» field above. */}
              <input
                type="time"
                value={form.to}
                onChange={(e) => setForm({ ...form, to: e.target.value })}
                data-testid="rescue-publish-to"
                className="block w-full min-w-0 border border-border rounded-md px-2 py-1 mt-1"
              />
            </label>
            <label className="font-body-sm text-sm col-span-2">
              {t("field.cancel")}
              <select
                value={form.cancelMin}
                onChange={(e) => setForm({ ...form, cancelMin: Number(e.target.value) })}
                data-testid="rescue-publish-cancel"
                className="w-full border border-border rounded-md px-2 py-1 mt-1 bg-surface-card text-text"
              >
                {CANCEL_CUTOFFS.map(([minutes, key]) => (
                  <option key={minutes} value={minutes}>
                    {t(`field.cancel_${key}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Button
            type="button"
            onClick={() => publish(0)}
            data-testid="rescue-publish-today"
            variant="primary" className="w-full"
          >
            {t("publish_today", { price: shekels(Number(form.price) * 100) ?? form.price })}
          </Button>
          <Button
            type="button"
            onClick={() => publish(1)}
            data-testid="rescue-publish-tomorrow"
            variant="outlined" className="w-full"
          >
            {t("publish_tomorrow", { n: form.qty_total })}
          </Button>
          {noticeAt(AT.publish)}
        </section>
      )}

      <section className="border border-border rounded-md px-4 py-4 space-y-2" data-notice-scope="items">
        <h3 className="font-headline-md text-base font-black text-text">{t("items_title")}</h3>
        <p className="font-body-sm text-sm text-fg-muted">{t("items_help")}</p>
        <input
          value={items}
          onChange={(e) => setItems(e.target.value)}
          aria-label={t("items_title")}
          data-testid="rescue-items-input"
          className="w-full border border-border rounded-md px-3 py-2"
        />

        {/* MEH-2752: what this business declares about ITS bag. Before this,
            every bag showed one fixed sentence naming four allergens — a
            statement about food nobody had made. */}
        <div className="mt-3">
          <p id="rescue-allergens-heading" className="font-body-sm text-sm text-text font-medium">
            {t("allergens_title")}
          </p>
          <p className="font-body-sm text-sm text-fg-muted mb-2">{t("allergens_help")}</p>
          <div
            role="group"
            aria-labelledby="rescue-allergens-heading"
            data-testid="rescue-allergens-group"
            className="flex flex-wrap gap-2"
          >
            {ALLERGEN_CODES.map((code) => {
              const pressed = allergens.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => setAllergens((prev) => toggleAllergen(prev, code))}
                  data-testid={`rescue-allergen-${code}`}
                  className={`inline-flex items-center min-h-touch rounded-full border px-4 py-2 font-body-sm text-sm transition focus-ring ${
                    pressed
                      ? "border-primary bg-green-50 text-primary"
                      : "border-border text-fg-muted hover:border-primary"
                  }`}
                >
                  {tProducts(`allergen_${code}`)}
                </button>
              );
            })}
          </div>
        </div>

        <Button
          type="button"
          onClick={saveItems}
          data-testid="rescue-items-save"
          variant="outlined"
        >
          {t("items_save")}
        </Button>
        {noticeAt(AT.items)}
      </section>

      {/* MEH-2703: only once the window closed and something was not
          collected; before that a bag may still be reserved or picked up. */}
      {leftoverTotal > 0 && (
        <section
          className="border border-border rounded-md px-4 py-4 space-y-3"
          data-testid="rescue-leftover"
          data-notice-scope="leftover"
        >
          <h3 className="font-headline-md text-base font-black text-text" data-testid="rescue-leftover-count">
            {t("leftover_title", { count: leftoverTotal })}
          </h3>
          <p className="font-body-sm text-sm text-fg-muted">{t("leftover_hint")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* Without the business name the text would carry an empty slot. */}
            {businessName && (
              <a
                href={shareHref}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="rescue-leftover-share"
                className="block text-center bg-primary text-white py-2 rounded-md font-medium"
              >
                {t("leftover_share")}
              </a>
            )}
            <a
              href={leftoverHref}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="rescue-leftover-link"
              className="block text-center border border-primary text-primary py-2 rounded-md font-medium"
            >
              {t("leftover_link")}
            </a>
          </div>
          {donatedTotal > 0 ? (
            <p className="font-body-sm text-sm text-text" data-testid="rescue-leftover-done">
              {t("leftover_done", { count: donatedTotal })}{" "}
              <button
                type="button"
                onClick={() => markDonated(0)}
                disabled={donating}
                data-testid="rescue-leftover-undo"
                className="underline text-primary font-medium disabled:opacity-60"
              >
                {t("leftover_undo")}
              </button>
            </p>
          ) : (
            <div className="space-y-2 border-t border-border pt-3">
              <div className="flex items-center gap-2">
                <label htmlFor="rescue-leftover-qty" className="font-body-sm text-sm text-text">
                  {t("leftover_qty_label")}
                </label>
                <select
                  id="rescue-leftover-qty"
                  value={chosenQty}
                  onChange={(e) => setDonateQty(Number(e.target.value))}
                  data-testid="rescue-leftover-qty"
                  className="border border-border rounded-md px-2 py-1 bg-surface text-text"
                >
                  {Array.from({ length: leftoverTotal }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                onClick={() => markDonated(chosenQty)}
                disabled={donating}
                data-testid="rescue-leftover-donated"
                variant="outlined" className="w-full"
              >
                {t("leftover_donated")}
              </Button>
              <p className="font-body-sm text-xs text-fg-muted">{t("leftover_donated_help")}</p>
            </div>
          )}
          {noticeAt(AT.leftover)}
        </section>
      )}
      {leftoverTotal === 0 && upcoming && (
        <p
          className="border border-dashed border-border rounded-md px-4 py-3 font-body-sm text-sm text-fg-muted"
          data-testid="rescue-leftover-upcoming"
        >
          {t("leftover_upcoming")}
        </p>
      )}
    </div>
  );
}
