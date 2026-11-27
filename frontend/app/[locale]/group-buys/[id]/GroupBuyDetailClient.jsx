// @ts-check
"use client";

import SeedBurst from "@/components/brand/SeedBurst";
import { useEffect, useRef, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import Breadcrumb from "@/components/Breadcrumb";
import HistoryBackLink from "@/components/HistoryBackLink";
import BackLink from "@/components/ui/BackLink";
import { MagnifyingGlass, MapPin, Clock, Storefront, ShoppingCart, Truck, ShareNetwork, Check } from "@phosphor-icons/react";
import Image from "next/image";
import OwnerRow from "@/components/OwnerRow";
import { optimizeCloudinary, IMAGE_RATIOS } from "@/lib/cloudinary";
import { useTranslations, useLocale } from "next-intl";
import { groupBuyPrepay } from "@/lib/payment-info";
import { formatEventDate } from "@/lib/format-date";
import { useAuth } from "@/lib/auth-context";
import { detailToMessage } from "@/lib/errors";
import { showToast } from "@/lib/toast";
// MEH-1140: canonical shekel format ("35₪") — one owner in lib/utils.
import { formatPrice } from "@/lib/utils";
import { groupBuyDiscountPct, groupBuyGoalReached, groupBuySpotsLeft } from "@/lib/group-buy-progress"; // MEH-2544 · MEH-3588
import { GroupBuyProgressMark, SEEDS_BESIDE_TEXT } from "@/app/[locale]/producer/[id]/components/ProducerActivities"; // MEH-2827 PR 7: one mark, card + page
import Input from "@/components/ui/Input";
import DeliveryChecker from "@/components/DeliveryChecker";
import api from "@/lib/api";
import { GroupBuyProducerDeliverySchema } from "@/lib/api-responses";
import { SkeletonDetail } from "@/components/Skeleton";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import { shareOrCopyText } from "@/lib/share-link";
import SectionHeading from "@/components/ui/SectionHeading";
import HubFaqLink from "@/components/HubFaqLink"; // MEH-3949
import InlineMessage from "@/components/ui/InlineMessage";
import { parseNaiveUtc } from "@/lib/dates";
import DirectoryDisclaimer from "@/components/DirectoryDisclaimer";
import LoginPromptModal from "@/components/LoginPromptModal";
import StruckPrice from "@/components/ui/StruckPrice";
// MEH-3597: the offer-page blocks shared with the rescue bag page.
import WhereSection from "@/components/offer-detail/WhereSection";
import HowSteps from "@/components/offer-detail/HowSteps";
import AllergenSection from "@/components/offer-detail/AllergenSection"; // MEH-3610
import PickupLine from "@/components/offer-detail/PickupLine"; // MEH-3610
import { cancelUntilText, pickupWindowText } from "@/lib/group-buy-pickup"; // MEH-3597 · MEH-3610
import GroupBuyCalendarButton from "@/components/group-buy/GroupBuyCalendarButton"; // MEH-3597
// MEH-3592: the join card's member / waitlist / line-total parts.
import GroupBuyMemberPanel from "@/components/group-buy/GroupBuyMemberPanel";
import GroupBuyWaitlistPanel from "@/components/group-buy/GroupBuyWaitlistPanel";
import GroupBuyLineTotal from "@/components/group-buy/GroupBuyLineTotal";
import { clearMyOrdersNavGate } from "@/lib/my-orders-nav-cache"; // MEH-3698

// MEH-975: schema bounds for GroupBuyCommitRequest.quantity
// (backend/app/schemas/schemas.py:1602 — int, ge=1, le=100). Clamp the
// number input to these before POST so a cleared field (Number("")===0)
// or an over-cap value never produces a 422 (which renders an array detail
// and crashed the tree — React #31).
const QTY_MIN = 1;
const QTY_MAX = 100;

function clampQuantity(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return QTY_MIN;
  return Math.min(QTY_MAX, Math.max(QTY_MIN, n));
}

// MEH-3130: a guest's chosen quantity survives the trip to /login and back
// (the «כניסה להצטרפות» button), as the review row keeps a tapped star.
const QTY_DRAFT_KEY = (gbId) => `group_buy_draft_qty_${gbId}`;

function saveDraftQuantity(gbId, value) {
  try {
    sessionStorage.setItem(QTY_DRAFT_KEY(gbId), String(clampQuantity(value)));
  } catch {}
}

/** Read and clear the kept quantity; null when none (or storage is blocked). */
function takeDraftQuantity(gbId) {
  try {
    // eslint-disable-next-line no-restricted-syntax -- restores a draft the visitor typed on this page earlier; the field it fills is already on screen
    const raw = sessionStorage.getItem(QTY_DRAFT_KEY(gbId));
    if (raw === null) return null;
    sessionStorage.removeItem(QTY_DRAFT_KEY(gbId));
    return clampQuantity(raw);
  } catch {}
  return null;
}

export default function GroupBuyDetailClient({ id }) {
  const t = useTranslations("group_buys.detail");
  // MEH-848: shared generic error copy (collapsed from group_buys.detail.errors.generic).
  const tError = useTranslations("error");
  // MEH-2827 PR 7: the price-tile labels the owner's form already uses, and
  // the site-wide «שתפו» + copied toast — no new copy.
  const tForm = useTranslations("group_buys.dashboard.form");
  const tShare = useTranslations("share");
  const tSharePage = useTranslations("share_page");
  // MEH-2857: breadcrumb labels — the events page's «בית» crumb and the
  // group-buys list's own heading, so no new copy.
  const tEvents = useTranslations("events.detail");
  const tList = useTranslations("group_buys.list");
  const locale = useLocale();
  const { user, loading: authLoading } = useAuth();
  const [gb, setGb] = useState(null);
  const [loading, setLoading] = useState(true);
  // A string while typing, clamped back to a number on blur.
  const [quantity, setQuantity] = useState(/** @type {number | string} */ (1));
  useEffect(() => {
    if (!user) return;
    const kept = takeDraftQuantity(id);
    if (kept) setQuantity(kept);
  }, [user, id]);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  // MEH-1250: destructive cancel-commitment confirm dialog (replaces native confirm()).
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  // MEH-3679: a guest's «כניסה להצטרפות» opens the shared sign-in window
  // (Google inside, MEH-3661) instead of leaving for /login. A Google sign-in
  // there joins by itself; «היכנסו» still goes to /login and back.
  const [showLoginModal, setShowLoginModal] = useState(false);
  // State, not a ref: the sign-in can set the user before or after
  // onSignedIn runs (auth-context replays a pending action in between), and
  // the effect below must see both, in either order. The ref guards one send.
  const [joinPending, setJoinPending] = useState(false);
  const joinSent = useRef(false);
  const commitRef = useRef(/** @type {null | (() => Promise<void>)} */ (null));
  const [error, setError] = useState("");
  // MEH-2453: the business's delivery data, for «מגיעים אלייך?». Null until
  // fetched and valid; on any failure the checker simply stays away. (The
  // «מאת {name}» link to its page is MEH-2472's and needs no fetch.)
  // MEH-3023: stored with the id it was fetched for, and read only while that
  // id is still the group's — so the render that shows another group can never
  // carry the previous business's checker, whenever the effect below runs.
  const [producerEntry, setProducerEntry] = useState(null);
  // MEH-2544: a photo url that fails to load falls back to the cart tile.
  const [failedHero, setFailedHero] = useState(null);

  const load = async () => {
    try {
      const r = await api.get(`/group-buys/${id}`);
      const data = r.data;
      setGb(data);
    } catch {
      setGb(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // MEH-2453: once per business, not on the 30-second refresh above — the
  // delivery areas do not move while someone reads the page.
  const producerId = gb?.producer_id;
  const producer = producerEntry && producerEntry.id === producerId ? producerEntry.data : null;
  useEffect(() => {
    // Drop the previous business first: if this instance is reused for another
    // group, its link and checker must not sit beside the new group meanwhile.
    setProducerEntry(null);
    if (!producerId) return undefined;
    let alive = true;
    api
      .get(`/producers/${producerId}`)
      .then((r) => {
        const parsed = GroupBuyProducerDeliverySchema.safeParse(r.data);
        // MEH-2491: the checker hiding is the right fallback, but a payload
        // the schema refuses is a contract drift someone should hear about.
        if (alive && !parsed.success) {
          Sentry.captureMessage("Group-buy business delivery payload failed schema validation", {
            level: "warning",
            extra: { producerId, issues: parsed.error.issues },
          });
        }
        if (alive) setProducerEntry(parsed.success ? { id: producerId, data: parsed.data } : null);
      })
      .catch(() => {
        if (alive) setProducerEntry(null);
      });
    return () => {
      alive = false;
    };
  }, [producerId]);

  // MEH-3679: the join the guest asked for, sent once the Google sign-in in
  // the window has set the user. In a microtask, not in the effect body.
  useEffect(() => {
    if (!user || !joinPending) return;
    Promise.resolve().then(() => {
      if (joinSent.current) return;
      joinSent.current = true;
      setJoinPending(false);
      commitRef.current?.();
    });
  }, [user, joinPending]);

  const handleCommit = async (e) => {
    e.preventDefault();
    if (!user) {
      // MEH-2982: the quantity survives the trip to /login and back.
      saveDraftQuantity(id, quantity);
      setShowLoginModal(true);
      return;
    }
    await commit();
  };

  const commit = async () => {
    setError("");
    setSubmitting(true);
    try {
      // MEH-975: send a schema-valid quantity (1–100) regardless of input state.
      // MEH-1651: no phone in the payload — the field is no longer collected.
      await api.post(`/group-buys/${id}/commit`, {
        quantity: clampQuantity(quantity),
      });
      clearMyOrdersNavGate(); // MEH-3698: «ההזמנות שלי» now has something
      await load();
    } catch (err) {
      // MEH-975: route through detailToMessage so a 422 `detail` ARRAY never
      // renders as a React child (React #31). Falls back to generic Hebrew copy.
      setError(detailToMessage(err.response?.data?.detail) || tError("generic"));
      // MEH-3679: a join sent right after sign-in ran on the guest's copy of
      // the group (e.g. she had already joined); show the real state.
      load();
    } finally {
      setSubmitting(false);
    }
  };

  // Refreshed in an effect, not during render (react-hooks/refs).
  useEffect(() => {
    commitRef.current = commit;
  });

  // MEH-2199 → MEH-3096: the keyboard layer (Tab trap, Escape closes and
  // never confirms, focus back to the trigger) lives in ui/Dialog.

  // MEH-1250: open the confirm modal instead of the native window.confirm().
  const handleCancel = () => {
    setConfirmCancelOpen(true);
  };

  const doCancel = async () => {
    setConfirmCancelOpen(false);
    setCancelling(true);
    try {
      await api.delete(`/group-buys/${id}/commit`);
      clearMyOrdersNavGate(); // MEH-3698: that may have been her only item
      await load();
      showToast.success(t("toast_cancelled")); // MEH-1446
    } catch (err) {
      // MEH-975: same array-detail crash guard as handleCommit.
      setError(detailToMessage(err.response?.data?.detail) || t("errors.cancel_failed"));
    } finally {
      setCancelling(false);
    }
  };

  if (loading || authLoading) {
    return (
      <SkeletonDetail hero={false} width="max-w-6xl" label={t("loading")} />
    );
  }

  if (!gb) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <MagnifyingGlass size={40} className="text-fg-muted mx-auto mb-4" aria-hidden="true" />
        <p className="text-lg font-medium text-text">{t("not_found_title")}</p>
        <BackLink href="/group-buys" label={t("back_to_list")} className="mt-4" />
      </div>
    );
  }

  const funded = gb.status === "funded";
  // MEH-2621 split (UI): pickup / delivery as two answers; old groups carry only the
  // pre-split fulfillment_note.
  const hasSplitNotes = Boolean(gb.pickup_note || gb.delivery_note);
  // MEH-3597: rows + map for WhereSection. The map pins the business's own
  // locations (as on its page) unless the group is delivery-only.
  const whereRows = hasSplitNotes
    ? [
        ["pickup", MapPin, gb.pickup_note],
        ["delivery", Truck, gb.delivery_note],
      ]
        .filter(([, , note]) => note)
        .map(([kind, Icon, note]) => ({ key: kind, Icon, label: t(`${kind}_label`), text: note, testId: `group-buy-${kind}-note` }))
    : gb.fulfillment_note
      ? [{ key: "note", Icon: MapPin, text: gb.fulfillment_note, testId: "group-buy-fulfillment-note" }]
      : [];
  // MEH-3597: the structured pickup window leads the rows, as the bag's hours do.
  // A delivery-only group shows no pickup time, even if one was saved (review, MEH-3597).
  const deliveryOnly = Boolean(gb.delivery_note) && !gb.pickup_note && !gb.fulfillment_note;
  const pickupWhen = deliveryOnly ? null : pickupWindowText(gb.pickup_starts_at, gb.pickup_ends_at, locale);
  // MEH-3610: the time moved under the title (as the bag's); the branch, when
  // the business chose one, leads the rows and is the one pin on the map.
  const place = deliveryOnly ? null : gb.pickup_location;
  const placeText = place && [place.label, [place.address, place.city].filter(Boolean).join(", ")].filter(Boolean).join(" — ");
  if (placeText) whereRows.unshift({ key: "place", Icon: Storefront, label: t("pickup_place_label"), text: placeText, testId: "group-buy-pickup-place" });
  const placePin = place && typeof place.lat === "number" && typeof place.lng === "number";
  const whereMap = placePin
    ? { lat: place.lat, lng: place.lng, name: place.label || gb.producer_name || "" }
    : producer && typeof producer.lat === "number" && typeof producer.lng === "number" && !deliveryOnly
      ? { lat: producer.lat, lng: producer.lng, name: producer.name, locations: producer.locations, producer }
      : null;
  const cancelUntil = cancelUntilText(gb.deadline, locale);
  const showWhere = whereRows.length > 0 || Boolean(whereMap);
  const deliveryChecker = producer && (
    <DeliveryChecker
      offersDelivery={producer.offers_delivery}
      nationwide={producer.delivery_nationwide}
      excluded={producer.delivery_excluded_cities}
      areas={producer.delivery_areas}
      producer={producer}
    />
  );
  const fulfilled = gb.status === "fulfilled";
  const cancelled = gb.status === "cancelled";
  const open = gb.status === "open";
  // MEH-3219 B13: deadline is naive UTC — parsed as UTC, not device-local.
  const expired = parseNaiveUtc(gb.deadline) < new Date();
  // MEH-3289: a funded group still takes joiners until it is full or the
  // deadline passes (group_buys.py commit route); leaving stays open the same way.
  const joinable = (open || funded) && !expired;
  // MEH-3592: full = no room for one more person with one unit (either cap).
  const full = (typeof gb.max_participants === "number" && gb.commits_count >= gb.max_participants) || gb.units_left === 0;
  const joinsClosed = Boolean(gb.joins_closed);
  // MEH-3691: the business's own account cannot join its group (the commit
  // route answers 403), so the owner sees no join form or waitlist.
  const isOwner = Boolean(user?.producer_id) && user.producer_id === gb.producer_id;
  const qtyMax = typeof gb.units_left === "number" ? Math.min(QTY_MAX, gb.units_left) : QTY_MAX;
  const discount = groupBuyDiscountPct(gb.price_per_unit_regular, gb.price_per_unit_group);
  const heroSrc = gb.producer_image_url
    ? optimizeCloudinary(gb.producer_image_url, { aspectRatio: IMAGE_RATIOS.banner, width: 1200 })
    : null;
  const showHero = heroSrc && failedHero !== heroSrc;
  // MEH-2827 PR 7: «שתפו» opens the phone's own share sheet (WhatsApp,
  // Instagram, Facebook… are inside it) — no WhatsApp-only link. The text is
  // the existing share_text minus its URL line; the URL goes ONLY as `url`, so
  // iOS shares a link card instead of a text blob.
  const shareText = t("share_text", { title: gb.title, city: gb.city || t("share_default_region"), id })
    .split("\n")
    .filter((line) => !/^https?:\/\//.test(line.trim()))
    .join("\n");
  const handleShare = async () => {
    const url = `${window.location.origin}${window.location.pathname}`;
    // MEH-2996: the site's one share sequence (lib/share-link.js).
    const outcome = await shareOrCopyText({ data: { title: gb.title, text: shareText, url }, copyText: url });
    if (outcome === "copied") showToast.success(tShare("copied_toast"), { icon: <Check size={18} /> });
    // No sheet and no clipboard: say so (existing copy) instead of a button
    // that silently does nothing.
    else if (outcome === "failed") showToast.error(tSharePage("copy_failed_toast"));
  };
  // MEH-3289: past the minimum the group keeps filling, so «7 מתוך 5» would read
  // as an error — the count alone is shown instead.
  // MEH-3588: «2 מתוך 2» read as «full»; from the goal on, the count alone.
  const goalReached = groupBuyGoalReached(gb.commits_count, gb.min_participants);
  const spotsLeft = groupBuySpotsLeft(gb.commits_count, gb.max_participants);
  const progressLabel = goalReached
    ? t("progress_joined", { commits: gb.commits_count })
    : t("progress_label", { commits: gb.commits_count, min: gb.min_participants });
  const remaining = Math.max(0, gb.min_participants - gb.commits_count);
  // Stacked (count above, mark full width) for the bar and for 6–10 seeds;
  // side by side only while the seeds fit beside the count at 375.
  const stacked = gb.min_participants > SEEDS_BESIDE_TEXT;
  const showRemaining = !expired && open && remaining > 0;
  const showGoalReached = joinable && goalReached;
  const showSpots = joinable && spotsLeft !== null && spotsLeft > 0;
  const hasMax = spotsLeft !== null;
  // MEH-3588: «how it works» stays while the group can be joined, and says the
  // group keeps filling past the goal (Groupon / Kickstarter: the deal stays on).
  const howLines = funded
    ? [t("how_join"), t("how_funded_price"), hasMax ? t("how_after_goal_max", { max: gb.max_participants }) : t("how_after_goal")]
    : [t("how_join"), t("how_unlock", { min: gb.min_participants }), hasMax ? t("how_after_goal_max", { max: gb.max_participants }) : t("how_after_goal"), t("how_no_commit")];
  const statusLines = (
    <>
      {showRemaining && <p className="text-sm font-bold text-text">{t("remaining_to_open", { n: remaining })}</p>}
      {showGoalReached && <p className="text-sm font-bold text-primary" data-testid="group-buy-goal-reached">{t("goal_reached")}</p>}
      <p className="text-xs text-fg-muted">{progressLabel}</p>
      {showSpots && <p className="text-xs font-semibold text-text" data-testid="group-buy-spots-left">{t("spots_left", { n: spotsLeft })}</p>}
    </>
  );

  const joinCard = (
    <div className="rounded-lg border border-border bg-surface-card p-5 md:p-6" data-testid="group-buy-join-card">
      {/* MEH-2827 PR 7 (FinalGroupBuyFlow): two price tiles — the group price
          framed in primary, the regular price beside it, struck through. */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border-2 border-primary bg-background px-3 py-2.5" data-testid="group-buy-price-group">
          <p className="text-xs font-semibold text-primary">{tForm("price_group_label")}</p>
          <p className="mt-0.5 flex items-baseline gap-1">
            <span dir="ltr" className="font-headline-md text-4xl font-black text-primary leading-none">
              {formatPrice(Number(gb.price_per_unit_group).toFixed(0))}
            </span>
            {gb.unit && <span className="text-xs text-fg-muted">{t("unit_suffix", { unit: gb.unit })}</span>}
          </p>
        </div>
        <div className="rounded-lg border border-border px-3 py-2.5" data-testid="group-buy-price-regular">
          <p className="text-xs font-medium text-fg-muted">{tForm("price_regular_label")}</p>
          <p className="mt-0.5">
            {/* Not decorative: the box's own label («מחיר רגיל») names it. */}
            <StruckPrice decorative={false} className="text-2xl leading-none">
              {formatPrice(Number(gb.price_per_unit_regular).toFixed(0))}
            </StruckPrice>
          </p>
        </div>
      </div>
      {discount > 0 && <p className="mt-2 text-sm font-semibold text-gold-deep">{t("discount_hint", { discount })}</p>}

      <div className="mt-4 rounded-lg bg-background-alt px-3 py-3" data-testid="group-buy-progress">
        {stacked ? (
          <>
            <div className="text-end mb-2">
              {statusLines}
            </div>
            <GroupBuyProgressMark size="lg" commits={gb.commits_count} min={gb.min_participants} funded={funded || fulfilled} label={progressLabel} />
          </>
        ) : (
          <div className="flex items-end justify-between gap-3">
            <span className="min-w-0 flex-1">
              <GroupBuyProgressMark size="lg" commits={gb.commits_count} min={gb.min_participants} funded={funded || fulfilled} label={progressLabel} />
            </span>
            <div className="text-end shrink-0">
              {statusLines}
            </div>
          </div>
        )}
        <p className="mt-2.5 border-t border-accent/35 pt-2 flex w-full items-center gap-1 text-xs text-fg-muted">
          <Clock size={14} aria-hidden="true" />
          {t("deadline_prefix", { date: formatEventDate(parseNaiveUtc(gb.deadline), locale, { day: "numeric", month: "long", year: "numeric" }) })}
        </p>
      </div>

      <div className="mt-5">
        {/* Commit form */}
        {joinable && !full && !joinsClosed && !gb.user_committed && !isOwner && (
          <form onSubmit={handleCommit} className="space-y-4">
            {/* MEH-1145 Wave E2: number field → ui/Input; the clamp-on-blur and
                the ltr end-anchored digits (a text-align via className, not a
                physical inset) pass through ...rest + className unchanged.
                MEH-1651: the phone field that sat below was removed — it asked
                for a number nothing read and implied a callback nobody made. */}
            <Input
              type="number"
              label={gb.unit ? t("quantity_label_unit", { unit: gb.unit }) : t("quantity_label")}
              min={QTY_MIN}
              max={qtyMax}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              onBlur={(e) => setQuantity(clampQuantity(e.target.value))}
              // rtl-ok — dir="ltr" numeric quantity: physical right IS the
              // inline start of an LTR field inside the RTL form. Same
              // documented exception as the licence number in
              // RegisterProducerClient.jsx:815. MEH-1721 P7 filed this under
              // F-1 (locale-breaking); it belongs in F-5 (correct use, marker
              // missing) — swapping to text-start would misalign it.
              className="text-right"
              dir="ltr"
            />
            <GroupBuyLineTotal gb={gb} quantity={quantity} />
            {error && <InlineMessage>{error}</InlineMessage>}
            <Button
              type="submit"
              disabled={submitting}
              variant="primary" size="lg" className="w-full"
            >
              {submitting ? t("submitting") : user ? t("submit_join") : t("submit_login")}
            </Button>
            {/* MEH-2999: the «יש להתחבר כדי להצטרף…» line under the button is
                gone — the button already says «כניסה להצטרפות». */}
            {/* MEH-3597: when she pays, before she joins (Sapir 21/11). */}
            <p className="text-xs text-fg-muted text-center" data-testid="group-buy-pay-line">{t("pay_line")}</p>
          </form>
        )}

        {/* Already committed — MEH-3592: quantity edit + the last-day leave rule. */}
        {gb.user_committed && (
          <GroupBuyMemberPanel
            gb={gb} joinable={joinable} full={full} cancelling={cancelling} onCancel={handleCancel} onChanged={load}
            // MEH-3895: the business's own prepay link, once the group is
            // funded — never while it can still fail.
            prepay={groupBuyPrepay(gb, producer?.payment_info)}
          />
        )}

        {/* MEH-3287: the daily job cancels a group that missed its minimum by the
            deadline — that page says the deadline passed, not «בוטלה». */}
        {expired && (open || cancelled) && (
          <div className="rounded-md bg-border px-4 py-3 text-fg-muted text-sm text-center">
            {t("deadline_passed")}
          </div>
        )}
        {/* MEH-3592: the business stopped joins — said plainly, no waitlist. */}
        {joinable && joinsClosed && !gb.user_committed && (
          <div className="rounded-md bg-border px-4 py-3 text-fg-muted text-sm text-center" data-testid="group-buy-joins-closed">
            {t("joins_closed")}
          </div>
        )}
        {joinable && full && !joinsClosed && !gb.user_committed && !isOwner && (
          <GroupBuyWaitlistPanel gb={gb} user={user} onChanged={load} />
        )}
      </div>
      <div className="mt-5 pt-5 border-t border-border">
        <button
          type="button"
          onClick={handleShare}
          data-testid="group-buy-share"
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background text-text min-h-touch text-sm font-medium hover:border-primary transition focus-ring"
        >
          <ShareNetwork size={18} aria-hidden="true" />
          {tShare("trigger")}
        </button>
      </div>
      {/* MEH-3398: the buyer commits to an order HERE, through the site's own
          tools, so this is where «not a party to the transaction» has to be
          read. Same locked legal line as the business page; no new copy. */}
      <DirectoryDisclaimer className="mt-4" />
    </div>
  );

  return (
    <>
      {/* MEH-2544 — Groupon / Kickstarter shape: photo up top, story +
          pickup + business on the start side, the join card (price, progress,
          deadline, action, share) on the end side from lg, sticky. It renders
          ONCE: on a phone, source order puts it right after the title; from lg
          the grid moves it to column 2 across both rows. */}
      <div className="max-w-6xl mx-auto px-4 py-6 md:py-8">
        {/* MEH-2857 (Sapir 09/11): «→ חזרה» returns to wherever the visitor
            came from (e.g. the business page) — the old fixed «→ חזרה לקבוצות
            הרכישה» led to a list she had never seen. The breadcrumb says where
            this page lives on the site; both use existing copy. */}
        <HistoryBackLink />
        <Breadcrumb
          items={[
            { href: "/", label: tEvents("breadcrumb_home") },
            { href: "/group-buys", label: tList("hero_title") },
            { label: gb.title },
          ]}
          className="mb-4"
        />

        {funded && (
          <div className="mb-5 rounded-md bg-primary text-white px-5 py-4 text-center" data-testid="group-buy-funded">
            {/* MEH-2833 (seed layer, board 5 v2): the funded moment is the logo
                opening into seeds (on-dark set), above the headline — replacing
                the full-screen canvas confetti, whose colours were not ours. */}
            <SeedBurst variant="dark" />
            <p className="text-xl font-bold">{t("funded_title")}</p>
            {/* MEH-3588: «contact the business» is for those who joined; a
                visitor who can still join is told she can. */}
            <p className="text-sm mt-1 opacity-90">
              {/* MEH-3592: a visitor who can no longer join is not sent to the business. */}
              {gb.user_committed
                ? t("funded_subtitle", { name: gb.producer_name })
                : joinable && !full && !joinsClosed
                  ? t(hasMax ? "funded_subtitle_join_max" : "funded_subtitle_join")
                  : t("funded_subtitle_closed")}
            </p>
          </div>
        )}
        {cancelled && !expired && (
          <div className="mb-5 rounded-md bg-border px-5 py-3 text-center text-fg-muted text-sm">{t("cancelled")}</div>
        )}
        {fulfilled && (
          <div className="mb-5 rounded-md bg-green-50 border border-primary/20 px-5 py-3 text-center text-primary text-sm font-medium">{t("fulfilled")}</div>
        )}

        <div className="grid gap-6 lg:gap-x-10 lg:grid-cols-[1fr_380px] lg:items-start">
          <div className="min-w-0">
            <div className="relative aspect-[16/9] rounded-lg overflow-hidden bg-green-50">
              {showHero ? (
                <Image
                  src={heroSrc}
                  alt=""
                  fill
                  priority
                  sizes="(max-width: 1023px) calc(100vw - 32px), 700px"
                  className="object-cover"
                  onError={() => setFailedHero(heroSrc)}
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center" data-testid="group-buy-image-missing">
                  <ShoppingCart size={64} weight="regular" className="text-primary/70" aria-hidden="true" />
                </div>
              )}
              {/* MEH-2827 PR 7: no -% pill on the photo — the price tiles say it. */}
            </div>

            <div className="mt-5">
              <p className="text-sm text-fg-muted">{gb.city}</p>
              <h1 className="font-headline-lg text-3xl md:text-4xl font-black text-text mt-1 leading-tight">{gb.title}</h1>
              {/* MEH-2472: the product being bought. */}
              {gb.product_name && (
                <p className="text-base font-medium text-text mt-2" data-testid="group-buy-product-name">{gb.product_name}</p>
              )}
              {/* MEH-3610: the pickup time right under the title, as on the bag
                  page — on a phone the «where» section starts below the fold. */}
              {pickupWhen && <PickupLine label={t("pickup_label")} text={pickupWhen} testId="group-buy-pickup-window" className="mt-3" />}
            </div>
          </div>

          <aside className="lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-24 lg:self-start">
            {joinCard}
          </aside>

          <div className="min-w-0 lg:col-start-1">
            {gb.description && (
              <p className="text-lg text-text/90 leading-relaxed whitespace-pre-line">{gb.description}</p>
            )}

            {/* MEH-3597 (Sapir 21/11): the same blocks, in the same order and
                look, as the rescue bag page — where and when (with the map and
                Waze / Google), how it works, cancelling. One look for two offers,
                as Airbnb draws stays and experiences from one set of sections. */}
            {/* MEH-3610: one white card, sections split by hairlines — the bag
                page's look (RescueOfferDetails); loose headings on the beige page
                read as one long list. */}
            <div
              className="mt-8 bg-surface border border-border rounded-lg divide-y divide-border [&>section]:p-5 [&>section:empty]:hidden"
              data-testid="group-buy-details"
            >
              {/* MEH-2615 / MEH-2621: pickup and delivery under one heading; a
                  group made before the split carries only fulfillment_note.
                  The heading rides on a note or the map: the checker can hide
                  itself (DeliveryChecker gates 1–3), and a heading over
                  nothing would be an orphan. */}
              {showWhere ? (
                <WhereSection
                  title={t("fulfillment_title")}
                  headingId="group-buy-where"
                  rows={whereRows}
                  map={whereMap}
                  testId="group-buy-fulfillment"
                >
                  {gb.user_committed && pickupWhen && <GroupBuyCalendarButton gb={gb} />}
                  {producer && <div className="mt-4">{deliveryChecker}</div>}
                </WhereSection>
              ) : (
                producer && <section data-testid="group-buy-fulfillment">{deliveryChecker}</section>
              )}

              {/* MEH-3610: what the business declares, as the bag does. */}
              <AllergenSection allergens={gb.allergens} headingId="group-buy-allergens" testId="group-buy-allergens" />

              {/* MEH-2544: how a group buy works, while it can still be joined. */}
              {joinable && !full && (
                <HowSteps title={t("how_title")} steps={howLines} headingId="group-buy-how-title" testId="group-buy-how" />
              )}

              {/* MEH-3597: the leave rule as its own section, like the bag's. */}
              {joinable && (
                <section aria-labelledby="group-buy-cancel" data-testid="group-buy-cancel">
                  <SectionHeading size="content" id="group-buy-cancel" className="mb-3">{t("cancel_title")}</SectionHeading>
                  <p className="text-base text-text">{t(funded ? "cancel_body_funded" : "cancel_body_open", { date: cancelUntil || "" })}</p>
                </section>
              )}

              {/* MEH-3949: the rest of the questions live on the hub page. */}
              <HubFaqLink hub="groupBuys" variant="detail" className="px-5 py-4" />
            </div>

            {/* MEH-2472: the business, as a tappable row (MEH-2538 OwnerRow);
                without a producer_id the row is plain text, never a dead link.
                MEH-2615: last, as Eventbrite's «Organized by». */}
            {gb.producer_name && (
              <div className="mt-6 max-w-md">
                <OwnerRow href={gb.producer_id ? `/producer/${gb.producer_id}` : undefined} name={gb.producer_name} testId="group-buy-producer-link">
                  {t("by_producer", { name: gb.producer_name })}
                </OwnerRow>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MEH-1250: destructive cancel-commitment confirm — dedicated modal
          replacing native confirm() (error-idiom unification, MEH-999
          JUDGMENT). MEH-3096: on the shared ui/Dialog (ordinary modal tier,
          above the sticky header z-1050 and BottomNav z-1000). Initial
          focus stays on the first button (MEH-2199 test); no dismiss while
          the DELETE is in flight. */}
      <LoginPromptModal
        open={showLoginModal}
        reason="group_buy"
        title={t("login_prompt_title")}
        message={t("login_prompt_message")}
        nextPath={typeof window !== "undefined" ? window.location.pathname + window.location.search : "/"}
        onSignedIn={() => {
          joinSent.current = false;
          setJoinPending(true);
          setShowLoginModal(false);
        }}
        onClose={() => setShowLoginModal(false)}
      />

      {confirmCancelOpen && (
        <Dialog labelledBy="gb-cancel-title" size="sm" dismissible={!cancelling} onClose={() => setConfirmCancelOpen(false)}>
            <h2
              id="gb-cancel-title"
              className="font-headline-md text-lg font-bold text-text mb-4"
            >
              {t("cancel_confirm")}
            </h2>
            <div className="flex gap-3">
              <Button
                onClick={doCancel}
                disabled={cancelling}
                variant="primary" size="sm" className="flex-1"
              >
                {cancelling ? t("cancelling") : t("cancel_cta")}
              </Button>
              {/* MEH-3461: ui/Button, like the confirm beside it (was a
                  hand-written pill). Outlined = the house «keep» action in a
                  confirm dialog. */}
              <Button
                disabled={cancelling}
                onClick={() => setConfirmCancelOpen(false)}
                variant="outlined" size="sm" className="flex-1"
              >
                {t("cancel_dismiss")}
              </Button>
            </div>
        </Dialog>
      )}
    </>
  );
}
