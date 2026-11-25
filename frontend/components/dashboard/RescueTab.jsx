// @ts-check
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link as LocaleLink } from "@/i18n/navigation";

import api from "@/lib/api";
import { israelToday } from "@/lib/israel-date";
import { israelWallClockToIso } from "@/lib/dates";
import AllergenPicker from "@/components/AllergenPicker"; // MEH-3610
import { MyPilotLocationsProducersMeRescuePilotLocationsGetResponse as PilotLocationsOut } from "@/lib/generated/api.zod";
import { detailToMessage, errorMessage, isUnverifiedEmailError } from "@/lib/errors";
import { bagDay, israelTime, leftoverGroupUrl, shekels } from "@/lib/rescue";
import Button from "@/components/ui/Button";
import UnverifiedEmailNotice from "@/components/UnverifiedEmailNotice";
import { useOptionalAuth } from "@/lib/auth-context";
import useIsraelToday from "@/lib/use-israel-today";
import { showToast } from "@/lib/toast";
import { shareOrCopyText } from "@/lib/share-link";
import Input from "@/components/ui/Input";
import TimeOfDaySelect from "@/components/ui/TimeOfDaySelect"; // MEH-3823


/**
 * Module:   RescueTab
 * Purpose:  The counter tool — today's codes, «אשר מסירה», «לא הגיע», the
 *           publish form, and the «בדרך כלל» editor.
 * Does NOT: take money or show who the buyer is. Handing a bag over needs
 *           four digits; the API deliberately returns no buyer identity.
 * Related:  backend GET /producers/me/rescue/orders · POST /rescue/orders/{id}/handed
 *           · POST /rescue/orders/{id}/no-show · PUT /producers/me/rescue/typical-items
 * History:  MEH-2649 (creation, chunk 5 of the rescue-bags pilot MEH-2643)
 *           · MEH-3823 (allergens folded, «שווי הסל», publish first, 24-hour
 *           times, each cancel link names its bag)
 */

const DAY_MS = 86_400_000; // MEH-3702: one calendar day, for the publish date
const MAX_QTY = 20;

const ORDER_RANK = { reserved: 0, handed: 1, no_show: 2, cancelled: 3 };
// Minutes before pickup_start that free cancellation ends, and the message key.
const CANCEL_CUTOFFS = [
  [30, "half_hour"],
  [60, "hour"],
  [120, "two_hours"],
];

// MEH-2730: the boxes a message can belong to (see `notice` below).
const AT = { code: "code", orders: "orders", cancel: "cancel", publish: "publish", items: "items", leftover: "leftover" };

export default function RescueTab() {
  const day = useIsraelToday(); // MEH-3805: «מחר» becomes «היום» at midnight without a reload
  const t = useTranslations("rescue.dashboard");
  const emailUnverified = useOptionalAuth()?.user?.email_verified === false; // MEH-2918
  const [unverifiedHits, setUnverifiedHits] = useState(0);
  const tShare = useTranslations("share");
  const tCopied = useTranslations("dashboard.producer.vanity_link");
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
  const [form, setForm] = useState(
    /** @type {{ qty_total: number | string, price: number | string, worth: number | string, from: string, to: string, cancelMin: number | string }} */ ({
      qty_total: 4,
      price: 15,
      // MEH-3823: «שווי הסל», optional. Empty sends no value, and buyers see
      // no struck price (worthAgorot shows one only above the price).
      worth: "",
      from: "18:00",
      to: "20:00",
      cancelMin: 30,
    }),
  );
  // MEH-2678: the tab loads its own pickup points. It used to take them as a
  // prop that the only page rendering it never passed, so every publish
  // answered «צריך נקודת איסוף». The API lists the primary first.
  const [locations, setLocations] = useState([]);
  // Known only after the list answers: the "add an address" box must not
  // flash while it loads, nor replace the form when the request failed.
  const [locationsLoaded, setLocationsLoaded] = useState(false);
  // MEH-2921: which of those points are in a town where bags are open. null =
  // not known (still loading, or the read failed): the form is not withheld
  // on a guess, the server still refuses a town outside the pilot.
  const [pilotIds, setPilotIds] = useState(/** @type {string[] | null} */ (null));
  // Answered (or failed) — until then the form waits, so an out-of-pilot
  // point never flashes a form it cannot submit (reviewer finding).
  const [pilotChecked, setPilotChecked] = useState(false);

  // MEH-2703: today's bags with what was not collected. Reloaded with the
  // orders, so marking «לא הגיע» updates the leftover count at once.
  const [offers, setOffers] = useState([]);
  // MEH-3823: where the publish card sits is decided once, on the first load
  // that read both lists: first (true) when nothing is out today or
  // tomorrow, in its usual place (false) otherwise. A failed read counts as
  // «something may be out» (false). Deciding once keeps the form from
  // jumping — and remounting — when a publish fills the list.
  const [setupFirst, setSetupFirst] = useState(/** @type {boolean | null} */ (null));
  const [businessName, setBusinessName] = useState("");
  // MEH-2784: the business status, from the /producers/me read below. null
  // until it answers; the publish form waits for it, so a pending business
  // never sees a form it cannot submit (the server 403s it, rescue.py:351).
  const [producerStatus, setProducerStatus] = useState(null);
  const [donating, setDonating] = useState(false);
  // How many of the leftover bags were given away; null = all of them.
  const [donateQty, setDonateQty] = useState(null);
  // MEH-2738: the bag whose «לבטל את הסל» question is open, and the one
  // being cancelled right now.
  const [askingOffer, setAskingOffer] = useState(null);
  const [cancellingOffer, setCancellingOffer] = useState(null);

  const load = useCallback(async () => {
    let orderRows = null;
    let offerRows = null;
    try {
      const res = await api.get("/producers/me/rescue/orders");
      orderRows = Array.isArray(res.data) ? res.data : [];
    } catch {
      orderRows = null;
    }
    try {
      const res = await api.get("/producers/me/rescue/offers");
      offerRows = Array.isArray(res.data) ? res.data : [];
    } catch {
      offerRows = null;
    }
    setOrders(orderRows ?? []);
    setOffers(offerRows ?? []);
    setSetupFirst((prev) => prev ?? (orderRows !== null && offerRows !== null && orderRows.length === 0 && offerRows.length === 0));
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
      .get("/producers/me/rescue/pilot-locations")
      .then((r) => {
        const parsed = PilotLocationsOut.safeParse(r.data);
        if (parsed.success) setPilotIds(parsed.data.location_ids.map(String));
      })
      .catch(() => {})
      .finally(() => setPilotChecked(true));
    api
      .get("/producers/me")
      .then((r) => {
        setBusinessName(typeof r.data?.name === "string" ? r.data.name : "");
        setProducerStatus(typeof r.data?.status === "string" ? r.data.status : "unknown");
      })
      // A failed read hides the WhatsApp button (no name). An unknown status falls back to the form; the server still guards.
      .catch(() => setProducerStatus("unknown"));
    api
      .get("/producers/me/rescue/typical-items")
      .then((r) => {
        setItems((r.data?.items || []).join(", "));
        setAllergens(r.data?.allergens || []);
      })
      .catch(() => {});
  }, [load]);

  // MEH-3702: the counter tool is today's; tomorrow's orders get their own list.
  const todayOrders = useMemo(() => (orders || []).filter((o) => bagDay(o.date, day) === "today"), [orders, day]);
  const tomorrowOrders = useMemo(() => (orders || []).filter((o) => bagDay(o.date, day) === "tomorrow"), [orders, day]);
  // Three counters, derived from one list so they cannot disagree with it.
  const counters = useMemo(() => {
    const rows = todayOrders;
    return {
      reserved: rows.filter((o) => o.status === "reserved").length,
      handed: rows.filter((o) => o.status === "handed").length,
      no_show: rows.filter((o) => o.status === "no_show").length,
    };
  }, [todayOrders]);
  // Orders still waiting at the counter first, cancelled ones last; the
  // server order is kept inside each group.
  const byRank = (rows) => [...rows].sort((a, b) => (ORDER_RANK[a.status] ?? 9) - (ORDER_RANK[b.status] ?? 9));
  const sortedOrders = useMemo(() => byRank(todayOrders), [todayOrders]);
  const sortedTomorrow = useMemo(() => byRank(tomorrowOrders), [tomorrowOrders]);

  // One order row. MEH-3702: tomorrow's rows only say their status — a bag
  // is handed over, or marked «לא הגיע», on its own day.
  function orderRow(o, tomorrow = false) {
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
        ) : o.status === "reserved" && !tomorrow ? (
          <span className="justify-self-end flex gap-2">
            <button
              type="button"
              disabled={busyId === o.id}
              onClick={() => act(o, "handed")}
              data-testid="rescue-order-hand"
              className="whitespace-nowrap bg-primary text-white px-3 py-1 rounded-full font-body-sm text-sm disabled:opacity-50"
            >
              {t("hand_over")}
            </button>
            <button
              type="button"
              disabled={!windowClosed || busyId === o.id}
              title={windowClosed ? undefined : t("no_show_too_early")}
              onClick={() => act(o, "no-show")}
              data-testid="rescue-order-noshow"
              className="whitespace-nowrap border border-border px-3 py-1 rounded-md font-body-sm text-sm disabled:opacity-50"
            >
              {t("no_show")}
            </button>
          </span>
        ) : (
          <span className="justify-self-end font-body-sm text-sm text-fg-muted">{t(`status.${o.status}`)}</span>
        )}
      </li>
    );
  }

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
    const match = todayOrders.find(
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
  // MEH-2921 (c): the point bags go out from — exact AND in a pilot town.
  // An exact point outside the pilot used to get the full form and a refusal
  // only after «לפרסם».
  const publishLocation = locations.find(
    (l) => l.location_precision === "exact" && (pilotIds === null || pilotIds.includes(String(l.id))),
  );

  async function publish(dayOffset = 0) {
    clearNotice();
    const location = publishLocation;
    if (!location) {
      setNotice("publish", t("no_location"));
      return;
    }
    // MEH-3702: the day and the hours on the Israel clock, not the device's —
    // a device on another zone sent the hours off by its own offset.
    const day = israelToday(new Date(Date.parse(`${israelToday()}T12:00:00Z`) + dayOffset * DAY_MS));
    const iso = (hhmm) => israelWallClockToIso(`${day}T${hhmm}`);
    // MEH-2722: the business picks how long before pickup free cancellation
    // ends (Sapir 6/11); half an hour is the default and the old fixed value.
    const cancel = new Date(
      new Date(iso(form.from)).getTime() - Number(form.cancelMin) * 60000,
    ).toISOString();
    try {
      await api.post("/rescue/offers", {
        producer_location_id: location.id,
        date: day, // Israel calendar day, not UTC (MEH-2678)
        qty_total: Number(form.qty_total),
        price_agorot: Number(form.price) * 100,
        pickup_start: iso(form.from),
        pickup_end: iso(form.to),
        cancel_until: cancel,
        // Buyers see a worth only above the price (worthAgorot), so one at
        // or below it is not sent at all.
        ...(Number(form.worth) > Number(form.price) ? { value_min_agorot: Math.round(Number(form.worth) * 100) } : {}),
      });
      setNotice("publish", t("published"), false);
      await load();
    } catch (err) {
      // MEH-2918: one email notice, not the 403 text beside it a second time.
      if (isUnverifiedEmailError(err)) {
        clearNotice();
        setUnverifiedHits((h) => h + 1);
      } else setNotice("publish", reason(err));
    }
  }

  // MEH-2738: the business cancels today's bag. The server cancels every
  // open reservation with it and emails each buyer.
  async function cancelOffer(offerId) {
    setCancellingOffer(offerId);
    clearNotice();
    try {
      await api.post(`/rescue/offers/${offerId}/cancel`);
      await load();
    } catch (err) {
      setNotice(AT.cancel, reason(err));
    } finally {
      setAskingOffer(null);
      setCancellingOffer(null);
    }
  }

  const now = Date.now();
  // Bags that can still be cancelled: active, window not over (the server
  // refuses after pickup_end — every bag is collected or a no-show by then).
  const cancellable = offers
    .filter((o) => o.status === "active" && new Date(o.pickup_end).getTime() > now)
    // MEH-3702: today's first, so «הסלים של מחר» heads one run of rows.
    .sort((a, b) => Number(bagDay(a.date, day) === "tomorrow") - Number(bagDay(b.date, day) === "tomorrow"));
  const tomorrowBags = offers.some((o) => o.status === "active" && bagDay(o.date, day) === "tomorrow");
  // MEH-3823: «18:00–20:00» inside Hebrew text reverses to «20:00–18:00»
  // unless it is isolated left-to-right (LRI … PDI).
  const pickupWindow = (o) => `\u2066${israelTime(o.pickup_start) || ""}–${israelTime(o.pickup_end) || ""}\u2069`;
  const openOn = (offerId) =>
    (orders || []).filter((o) => o.offer_id === offerId && o.status === "reserved").length;
  // MEH-2702: the group for the town of the point bags are published from,
  // national fallback otherwise.
  // MEH-2921: the point bags actually go out from, when there is one.
  const bagLocation = publishLocation ?? exactLocation;
  const leftoverHref = leftoverGroupUrl(bagLocation?.city);
  // MEH-2703: bags not collected once the window closed (the server returns
  // 0 before pickup_end), and how many of them the business gave away.
  const leftoverRows = offers.filter((o) => Number(o.leftover) > 0);
  const leftoverTotal = leftoverRows.reduce((n, o) => n + Number(o.leftover), 0);
  const donatedTotal = leftoverRows.reduce((n, o) => n + Number(o.qty_donated || 0), 0);
  // Today's bags whose window is still open: the box will appear after it,
  // so the business is told where to look instead of finding it by chance.
  // MEH-3702: today's only — tomorrow's bag says nothing about today's leftovers.
  const upcoming = offers.some(
    (o) => o.status === "active" && bagDay(o.date, day) === "today" && new Date(o.pickup_end).getTime() > now,
  );
  const chosenQty = donateQty === null ? leftoverTotal : Math.min(donateQty, leftoverTotal);
  // No recipient in the link: the business picks the contact or group in
  // WhatsApp itself, so nothing about who receives it is stored here.
  // MEH-2827 PR 8: «שתפו» opens the phone's own share sheet (a WhatsApp
  // group, an Instagram story, a neighbourhood Facebook group…) with the same
  // message. No sheet → the message is copied. Still no recipient stored.
  const leftoverText = t("leftover_share_text", {
    count: leftoverTotal,
    name: businessName,
    city: bagLocation?.city || "",
  });
  async function shareLeftover() {
    // MEH-2996: the site's one share sequence (lib/share-link.js).
    const outcome = await shareOrCopyText({ data: { text: leftoverText }, copyText: leftoverText });
    if (outcome === "copied") showToast.success(tCopied("copied"));
  }

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

  // MEH-2784 (Sapir 6/11, option א׳): an unapproved business is told up
  // front, and gets no form. Pending reads «we are reviewing»; any other
  // non-approved status (draft, rejected, suspended) gets the server's line.
  const gated = producerStatus !== null && producerStatus !== "approved" && producerStatus !== "unknown";
  // MEH-2935 + MEH-3823: «what is in the bag» then the publish form, one
  // block. It comes first for a business with nothing out today or tomorrow
  // (a new business, or a quiet day): publishing is then the only thing to
  // do here. The API lists only today's and tomorrow's bags, so «never
  // published» is read as «nothing out now».
  const setupBlock = (
    <>
      {/* MEH-2935: what is in the bag and its allergens come BEFORE the publish
          buttons — buyers see them before they reserve, so they are filled first. */}
      <section className="border border-border rounded-md px-4 py-4 space-y-2" data-notice-scope="items" data-testid="rescue-items-section">
        <h3 className="font-headline-md text-base font-black text-text">{t("items_title")}</h3>
        <p className="font-body-sm text-sm text-fg-muted">{t("items_help")}</p>
        <Input inline size="sm"
          value={items}
          onChange={(e) => setItems(e.target.value)}
          aria-label={t("items_title")}
          data-testid="rescue-items-input"
          className="w-full"
        />

        {/* MEH-2752: what this business declares about ITS bag. Before this,
            every bag showed one fixed sentence naming four allergens — a
            statement about food nobody had made. */}
        {/* MEH-3823 (the Too Good To Go pattern): fifteen chips are optional
            work, so they sit behind a closed disclosure. Buyers always see a
            fixed «ask at pickup» line whatever is marked here. */}
        <details className="mt-3" data-testid="rescue-allergens-disclosure">
          <summary className="cursor-pointer font-body-sm text-sm text-text font-medium" data-testid="rescue-allergens-summary">
            <span id="rescue-allergens-heading">{t("allergens_toggle")}</span>
            {allergens.length > 0 && (
              <span className="text-fg-muted font-normal" data-testid="rescue-allergens-count">
                {" · "}
                {t("allergens_count", { count: allergens.length })}
              </span>
            )}
          </summary>
          <p className="font-body-sm text-sm text-fg-muted mt-2 mb-2">{t("allergens_help")}</p>
          {/* MEH-3610: the picker is shared with the group buy. */}
          <AllergenPicker value={allergens} onChange={setAllergens} labelledBy="rescue-allergens-heading" testId="rescue-allergen" groupTestId="rescue-allergens-group" />
        </details>

        <Button
          type="button"
          onClick={saveItems}
          data-testid="rescue-items-save"
          variant="outlined"
        >
          {t("items_save")}
        </Button>
        {noticeAt(AT.items)}
        {/* MEH-3593: «הוראות איסוף» belong to the pickup point, so they are
            written with the address in the locations editor, not here. */}
        <p className="mt-3 font-body-sm text-sm text-fg-muted" data-testid="rescue-pickup-note-pointer">
          {t("pickup_note_pointer")}{" "}
          <LocaleLink href="/producer/dashboard/edit#locations" className="text-primary underline">
            {t("pickup_note_pointer_link")}
          </LocaleLink>
        </p>
      </section>

      {/* MEH-2784: only the publish form is gated. Codes, orders and «לא הגיע»
          stay, so a business suspended with bags already out can still close
          its open orders. */}
      {producerStatus === null ? null : gated ? (
        producerStatus === "pending" && (
          <section className="border border-border rounded-md px-4 py-4 space-y-2">
            <h3 className="font-headline-md text-base font-black text-text">{t("publish_title")}</h3>
            <p className="font-body-sm text-sm text-fg-muted">{t("pending_form_note")}</p>
          </section>
        )
      ) : locationsLoaded && !exactLocation ? (
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
      ) : locationsLoaded && !pilotChecked ? null : locationsLoaded && !publishLocation ? (
        // MEH-2921 (c): exact point, but its town is not open for bags yet.
        <section
          className="border border-border rounded-md px-4 py-4 space-y-2"
          data-testid="rescue-not-in-pilot"
        >
          <h3 className="font-headline-md text-base font-black text-text">{t("publish_title")}</h3>
          <p className="font-body-sm text-sm text-text">{t("not_in_pilot", { city: exactLocation?.city || "" })}</p>
        </section>
      ) : (
        <section className="border border-border rounded-md px-4 py-4 space-y-3" data-notice-scope="publish">
          <h3 className="font-headline-md text-base font-black text-text">{t("publish_title")}</h3>
          {/* MEH-2918: say it before the fields — publish 403s without it (rescue.py:340). */}
          {(emailUnverified || unverifiedHits > 0) && <UnverifiedEmailNotice key={unverifiedHits} live={unverifiedHits > 0} focusOnMount={unverifiedHits > 0} />}
          {/* MEH-2921 (e): the numbers below are a suggestion, not a setting. */}
          <p className="font-body-sm text-sm text-fg-muted" data-testid="rescue-publish-suggestion">{t("publish_suggestion")}</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="font-body-sm text-sm">
              {t("field.qty")}
              <Input inline size="xs"
                type="number"
                min={1}
                max={MAX_QTY}
                value={form.qty_total}
                onChange={(e) => setForm({ ...form, qty_total: e.target.value })}
                data-testid="rescue-publish-qty"
                className="w-full mt-1"
              />
            </label>
            <label className="font-body-sm text-sm">
              {t("field.price")}
              <Input inline size="xs"
                type="number"
                min={0}
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                data-testid="rescue-publish-price"
                className="w-full mt-1"
              />
            </label>
            <div className="font-body-sm text-sm col-span-2">
              <label>
                {t("field.worth")}
                <Input inline size="xs"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={form.worth}
                  onChange={(e) => setForm({ ...form, worth: e.target.value })}
                  aria-describedby="rescue-publish-worth-help"
                  data-testid="rescue-publish-worth"
                  className="w-full mt-1"
                />
              </label>
              <p id="rescue-publish-worth-help" className="text-xs text-fg-muted mt-1">{t("field.worth_help")}</p>
            </div>
            {/* MEH-3823: hour and minute selects, not <input type="time">,
                which shows AM/PM on an iPhone set to English. min-w-0 keeps
                the row inside its column on iOS (MEH-2730). */}
            <div className="font-body-sm text-sm min-w-0" role="group" aria-labelledby="rescue-publish-from-label">
              <span id="rescue-publish-from-label">{t("field.from")}</span>
              <TimeOfDaySelect
                value={form.from}
                onChange={(v) => setForm({ ...form, from: v })}
                hourLabel={t("field.from_hour")}
                minuteLabel={t("field.from_minute")}
                testId="rescue-publish-from"
                className="mt-1"
              />
            </div>
            <div className="font-body-sm text-sm min-w-0" role="group" aria-labelledby="rescue-publish-to-label">
              <span id="rescue-publish-to-label">{t("field.to")}</span>
              <TimeOfDaySelect
                value={form.to}
                onChange={(v) => setForm({ ...form, to: v })}
                hourLabel={t("field.to_hour")}
                minuteLabel={t("field.to_minute")}
                testId="rescue-publish-to"
                className="mt-1"
              />
            </div>
            <label className="font-body-sm text-sm col-span-2">
              {t("field.cancel")}
              <select
                value={form.cancelMin}
                onChange={(e) => setForm({ ...form, cancelMin: Number(e.target.value) })}
                data-testid="rescue-publish-cancel"
                className="w-full border border-border rounded-sm px-2 py-1 mt-1 bg-surface-card text-text focus-ring"
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
            {t("publish_today", { n: Number(form.qty_total) || 0, price: shekels(Number(form.price) * 100) ?? form.price })}
          </Button>
          <Button
            type="button"
            onClick={() => publish(1)}
            data-testid="rescue-publish-tomorrow"
            variant="outlined" className="w-full"
          >
            {/* MEH-2935: both buttons state the same two facts. */}
            {t("publish_tomorrow", { n: Number(form.qty_total) || 0, price: shekels(Number(form.price) * 100) ?? form.price })}
          </Button>
          {noticeAt(AT.publish)}
        </section>
      )}
    </>
  );
  return (
    <div data-testid="rescue-tab" className="space-y-6">
      {gated &&
        (producerStatus === "pending" ? (
          <div data-testid="rescue-pending-banner" role="status" className="bg-warning-50 border border-warning-200 rounded-md px-4 py-3">
            <p className="font-semibold text-warning-800">{t("pending_title")}</p>
            <p className="font-body-sm text-sm text-warning-800">{t("pending_body")}</p>
          </div>
        ) : (
          <p data-testid="rescue-not-approved" role="status" className="font-body-sm text-sm text-text">
            {t("not_approved")}
          </p>
        ))}
      {setupFirst === true && setupBlock}
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

      {/* MEH-2921 (d): the code box is for handing a bag over. A business
          that cannot publish and has no open order has nothing to hand over. */}
      {orders !== null && (!gated || counters.reserved > 0 || notice?.at === AT.code) && (
      <div className="space-y-2" data-notice-scope="code" data-testid="rescue-code-box">
        <div className="flex gap-2">
          <Input inline size="sm"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            maxLength={4}
            dir="ltr"
            placeholder={t("code_placeholder")}
            aria-label={t("code_label")}
            data-testid="rescue-code-input"
            className="flex-1 text-center tracking-[0.3em]"
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
      )}

      <section data-notice-scope="orders">
        <h3 className="font-headline-md text-base font-black text-text mb-2">{t("orders_title")}</h3>
        {orders === null && <p className="font-body-sm text-sm text-fg-muted">{t("loading")}</p>}
        {orders !== null && todayOrders.length === 0 && (
          <p className="font-body-sm text-sm text-fg-muted" data-testid="rescue-orders-empty">
            {t("orders_empty")}
          </p>
        )}
        <ul className="space-y-2">
          {sortedOrders.map((o) => orderRow(o))}
        </ul>
        {noticeAt(AT.orders)}
      </section>

      {/* MEH-3702: tomorrow's reservations, once there is a bag for tomorrow. */}
      {(tomorrowOrders.length > 0 || tomorrowBags) && (
        <section data-testid="rescue-orders-tomorrow">
          <h3 className="font-headline-md text-base font-black text-text mb-2">{t("orders_title_tomorrow")}</h3>
          {tomorrowOrders.length === 0 && (
            <p className="font-body-sm text-sm text-fg-muted" data-testid="rescue-orders-tomorrow-empty">
              {t("orders_empty_tomorrow")}
            </p>
          )}
          <ul className="space-y-2">{sortedTomorrow.map((o) => orderRow(o, true))}</ul>
        </section>
      )}

      {cancellable.length > 0 && (
        <section className="space-y-3" data-notice-scope="cancel" data-testid="rescue-offer-cancel-box">
          {cancellable.map((o, i) => {
            const open = openOn(o.id);
            // MEH-3702: tomorrow's bags come after today's, under their own line.
            const isTomorrow = bagDay(o.date, day) === "tomorrow";
            const firstTomorrow = isTomorrow && (i === 0 || bagDay(cancellable[i - 1].date, day) !== "tomorrow");
            // MEH-3823: today's run gets its own line too, so no cancel link
            // reads as part of the orders list above it.
            const firstToday = !isTomorrow && i === 0;
            const dayLine = firstTomorrow ? (
              <p key={`day-${o.id}`} className="font-body-sm text-sm font-bold text-text" data-testid="rescue-offers-tomorrow-title">
                {t("offers_title_tomorrow")}
              </p>
            ) : firstToday ? (
              <p key={`day-${o.id}`} className="font-body-sm text-sm font-bold text-text" data-testid="rescue-offers-today-title">
                {t("offers_title_today")}
              </p>
            ) : null;
            const item = askingOffer === o.id ? (
              <div
                key={o.id}
                role="group"
                aria-labelledby={`rescue-offer-cancel-title-${o.id}`}
                data-testid="rescue-offer-cancel-ask"
                className="border border-border rounded-md px-4 py-3 space-y-3 bg-surface-card"
              >
                <p id={`rescue-offer-cancel-title-${o.id}`} className="font-body-sm text-base font-bold text-text">
                  {t(bagDay(o.date, day) === "tomorrow" ? "cancel_offer_title_tomorrow" : "cancel_offer_title")}
                </p>
                <p className="font-body-sm text-sm text-text">
                  {open === 0
                    ? t("cancel_offer_none")
                    : open === 1
                      ? t("cancel_offer_one")
                      : t("cancel_offer_many", { n: open })}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    size="sm"
                    loading={cancellingOffer === o.id}
                    onClick={() => cancelOffer(o.id)}
                    data-testid="rescue-offer-cancel-yes"
                  >
                    {t("cancel_offer_yes")}
                  </Button>
                  <Button
                    variant="outlined"
                    size="sm"
                    disabled={cancellingOffer === o.id}
                    onClick={() => setAskingOffer(null)}
                    data-testid="rescue-offer-cancel-no"
                  >
                    {t("cancel_offer_no")}
                  </Button>
                </div>
              </div>
            ) : (
              // MEH-3823: the link stood alone under «ההזמנות של מחר» and did
              // not say which bag it cancels. Each row now names its pickup
              // window and how many bags it holds.
              <div key={o.id} className="flex items-center justify-between gap-3 flex-wrap" data-testid="rescue-offer-cancel-row">
                <span className="font-body-sm text-sm text-text" data-testid="rescue-offer-cancel-label">
                  {t("cancel_offer_row", { window: pickupWindow(o), count: o.qty_total })}
                </span>
                <Button
                  variant="text"
                  size="sm"
                  onClick={() => {
                    clearNotice();
                    setAskingOffer(o.id);
                  }}
                  aria-label={t("cancel_offer_aria", { window: pickupWindow(o) })}
                  data-testid="rescue-offer-cancel"
                  className="underline"
                >
                  {t("cancel_offer")}
                </Button>
              </div>
            );
            return dayLine ? [dayLine, item] : item;
          })}
          {noticeAt(AT.cancel)}
        </section>
      )}

      {setupFirst === false && setupBlock}

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
              <button
                type="button"
                onClick={shareLeftover}
                data-testid="rescue-leftover-share"
                className="block w-full text-center bg-primary text-background py-2 rounded-full font-medium"
              >
                {tShare("trigger")}
              </button>
            )}
            <a
              href={leftoverHref}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="rescue-leftover-link"
              className="block text-center border border-primary text-primary py-2 rounded-full font-medium"
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
                className="underline text-primary font-medium disabled:opacity-50"
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
                  className="border border-border rounded-sm px-2 py-1 bg-surface text-text focus-ring"
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
