"use client";

import SeedBurst from "@/components/brand/SeedBurst";
import { useEffect, useRef, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import HistoryBackLink from "@/components/HistoryBackLink";
import { MagnifyingGlass, MapPin, Clock, ShoppingCart, Truck, ShareNetwork, Check } from "@phosphor-icons/react";
import Image from "next/image";
import OwnerRow from "@/components/OwnerRow";
import { optimizeCloudinary, IMAGE_RATIOS } from "@/lib/cloudinary";
import { useTranslations, useLocale } from "next-intl";
import { formatEventDate } from "@/lib/format-date";
import { useAuth } from "@/lib/auth-context";
import { loginHrefBackHere } from "@/lib/safe-redirect";
import { detailToMessage } from "@/lib/errors";
import { showToast } from "@/lib/toast";
// MEH-1140: canonical shekel format ("35₪") — one owner in lib/utils.
import { formatPrice } from "@/lib/utils";
import { groupBuyDiscountPct } from "@/lib/group-buy-progress"; // MEH-2544
import { GroupBuyProgressMark, SEEDS_BESIDE_TEXT } from "@/app/[locale]/producer/[id]/components/ProducerActivities"; // MEH-2827 PR 7: one mark, card + page
import Input from "@/components/ui/Input";
import DeliveryChecker from "@/components/DeliveryChecker";
import api from "@/lib/api";
import { GroupBuyProducerDeliverySchema } from "@/lib/api-schemas";
import { SkeletonDetail } from "@/components/Skeleton";
import Button from "@/components/ui/Button";
import { shareOrCopyText } from "@/lib/share-link";
import SectionHeading from "@/components/ui/SectionHeading";

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
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [gb, setGb] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  // MEH-1250: destructive cancel-commitment confirm dialog (replaces native confirm()).
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  // MEH-2199: the dialog below declares aria-modal="true" and delivered none of
  // what that promises — no Escape, no focus trap, no focus-return. A keyboard
  // user could Tab straight out into the page behind it, which is worse than a
  // non-modal dialog: the ARIA tells the screen reader the rest of the page is
  // inert while it is not.
  const cancelDialogRef = useRef(null);
  // MEH-2199 follow-up: the focus-return target is captured when the dialog is
  // OPENED, not read out of document.activeElement inside the effect. Reading
  // it in the effect is correct under React's current synchronous commit — no
  // script runs between the click and the effect — but that is a property of
  // today's scheduler, not of this component. Capturing at the interaction is
  // what focus-trap-react and react-aria do, and it costs one line.
  const cancelTriggerRef = useRef(null);
  const [error, setError] = useState("");
  // MEH-2453: the business's delivery data, for «מגיעים אלייך?». Null until
  // fetched and valid; on any failure the checker simply stays away. (The
  // «מאת {name}» link to its page is MEH-2472's and needs no fetch.)
  const [producer, setProducer] = useState(null);
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
  useEffect(() => {
    // Drop the previous business first: if this instance is reused for another
    // group, its link and checker must not sit beside the new group meanwhile.
    setProducer(null);
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
        if (alive) setProducer(parsed.success ? parsed.data : null);
      })
      .catch(() => {
        if (alive) setProducer(null);
      });
    return () => {
      alive = false;
    };
  }, [producerId]);

  const handleCommit = async (e) => {
    e.preventDefault();
    if (!user) {
      // MEH-2982: come back to this group buy after signing in, not to "/".
      router.push(loginHrefBackHere());
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      // MEH-975: send a schema-valid quantity (1–100) regardless of input state.
      // MEH-1651: no phone in the payload — the field is no longer collected.
      await api.post(`/group-buys/${id}/commit`, {
        quantity: clampQuantity(quantity),
      });
      await load();
    } catch (err) {
      // MEH-975: route through detailToMessage so a 422 `detail` ARRAY never
      // renders as a React child (React #31). Falls back to generic Hebrew copy.
      setError(detailToMessage(err.response?.data?.detail) || tError("generic"));
    } finally {
      setSubmitting(false);
    }
  };

  // MEH-2199: the modal keyboard layer, mounted only while the dialog is open.
  // REUSES: frontend/components/Lightbox.jsx:92-112 — same Escape + Tab-cycle
  // mechanism, so the two modals on this site behave identically.
  //
  // Escape CLOSES and never confirms. MEH-1250 replaced a native
  // window.confirm() with this dialog precisely so the DELETE stays deliberate;
  // a key that dismissed and deleted would defeat the ticket that built it.
  //
  // Focus-return rides the effect CLEANUP rather than each close path. There
  // are three ways to close this (Escape, the dismiss button, the overlay), and
  // hanging a restore off each one is three places to forget. The cleanup runs
  // whenever `confirmCancelOpen` goes false — or the component unmounts — so it
  // covers all three and any future fourth by construction.
  useEffect(() => {
    if (!confirmCancelOpen) return undefined;
    const FOCUSABLE =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    // Captured at open time by handleCancel; the activeElement read is only a
    // fallback for a future path that opens the dialog without going through it.
    // Cleared straight after the read, or that fallback could never fire: the
    // ref would still hold the PREVIOUS open's trigger and win the ?? every
    // time, so the documented fallback would be dead by accident rather than
    // by there being no such path yet.
    const trigger = cancelTriggerRef.current ?? document.activeElement;
    cancelTriggerRef.current = null;
    const focusables = () =>
      Array.from(cancelDialogRef.current?.querySelectorAll(FOCUSABLE) ?? []);
    focusables()[0]?.focus();

    const onKey = (e) => {
      if (e.key === "Escape") {
        setConfirmCancelOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const els = focusables();
      if (!els.length) return;
      const first = els[0];
      const last = els.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      // document.contains guards the node having been unmounted while the
      // dialog was open — focusing a detached element silently does nothing and
      // would leave focus on <body>.
      if (trigger instanceof HTMLElement && document.contains(trigger)) {
        trigger.focus();
      }
    };
  }, [confirmCancelOpen]);

  // MEH-1250: open the confirm modal instead of the native window.confirm().
  const handleCancel = () => {
    cancelTriggerRef.current = document.activeElement;
    setConfirmCancelOpen(true);
  };

  const doCancel = async () => {
    setConfirmCancelOpen(false);
    setCancelling(true);
    try {
      await api.delete(`/group-buys/${id}/commit`);
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
        <Link href="/group-buys" className="text-primary underline decoration-[1.5px] underline-offset-[5px] decoration-primary/35 hover:decoration-current mt-4 inline-block">
          {t("back_to_list")}
        </Link>
      </div>
    );
  }

  const funded = gb.status === "funded";
  // MEH-2621 split (UI): pickup / delivery as two answers; old groups carry only the
  // pre-split fulfillment_note.
  const hasSplitNotes = Boolean(gb.pickup_note || gb.delivery_note);
  const hasFulfillment = hasSplitNotes || Boolean(gb.fulfillment_note);
  const fulfilled = gb.status === "fulfilled";
  const cancelled = gb.status === "cancelled";
  const open = gb.status === "open";
  const expired = new Date(gb.deadline) < new Date();
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
  const progressLabel = t("progress_label", { commits: gb.commits_count, min: gb.min_participants });
  const remaining = Math.max(0, gb.min_participants - gb.commits_count);
  // Stacked (count above, mark full width) for the bar and for 6–10 seeds;
  // side by side only while the seeds fit beside the count at 375.
  const stacked = gb.min_participants > SEEDS_BESIDE_TEXT;
  const showRemaining = !expired && open && remaining > 0;

  const joinCard = (
    <div className="rounded-2xl border border-border bg-surface-card p-5 md:p-6" data-testid="group-buy-join-card">
      {/* MEH-2827 PR 7 (FinalGroupBuyFlow): two price tiles — the group price
          framed in primary, the regular price beside it, struck through. */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border-2 border-primary bg-background px-3 py-2.5" data-testid="group-buy-price-group">
          <p className="text-xs font-semibold text-primary">{tForm("price_group_label")}</p>
          <p className="mt-0.5 flex items-baseline gap-1">
            <span dir="ltr" className="font-headline-md text-4xl font-black text-primary leading-none">
              {formatPrice(Number(gb.price_per_unit_group).toFixed(0))}
            </span>
            {gb.unit && <span className="text-xs text-fg-muted">{t("unit_suffix", { unit: gb.unit })}</span>}
          </p>
        </div>
        <div className="rounded-xl border border-border px-3 py-2.5" data-testid="group-buy-price-regular">
          <p className="text-xs font-medium text-fg-muted">{tForm("price_regular_label")}</p>
          <p className="mt-0.5">
            <span dir="ltr" className="text-2xl text-fg-muted line-through leading-none">
              {formatPrice(Number(gb.price_per_unit_regular).toFixed(0))}
            </span>
          </p>
        </div>
      </div>
      {discount > 0 && <p className="mt-2 text-sm font-semibold text-gold-deep">{t("discount_hint", { discount })}</p>}

      <div className="mt-4 rounded-xl bg-background-alt px-3 py-3" data-testid="group-buy-progress">
        {stacked ? (
          <>
            <div className="text-end mb-2">
              {showRemaining && <p className="text-sm font-bold text-text">{t("remaining_to_open", { n: remaining })}</p>}
              <p className="text-xs text-fg-muted">{progressLabel}</p>
            </div>
            <GroupBuyProgressMark size="lg" commits={gb.commits_count} min={gb.min_participants} funded={funded || fulfilled} label={progressLabel} />
          </>
        ) : (
          <div className="flex items-end justify-between gap-3">
            <span className="min-w-0 flex-1">
              <GroupBuyProgressMark size="lg" commits={gb.commits_count} min={gb.min_participants} funded={funded || fulfilled} label={progressLabel} />
            </span>
            <div className="text-end shrink-0">
              {showRemaining && <p className="text-sm font-bold text-text">{t("remaining_to_open", { n: remaining })}</p>}
              <p className="text-xs text-fg-muted">{progressLabel}</p>
            </div>
          </div>
        )}
        <p className="mt-2.5 border-t border-accent/35 pt-2 flex w-full items-center gap-1 text-xs text-fg-muted">
          <Clock size={14} aria-hidden="true" />
          {t("deadline_prefix", { date: formatEventDate(gb.deadline, locale, { day: "numeric", month: "long", year: "numeric" }) })}
        </p>
      </div>

      <div className="mt-5">
        {/* Commit form */}
        {open && !expired && !gb.user_committed && (
          <form onSubmit={handleCommit} className="space-y-4">
            {/* MEH-1145 Wave E2: number field → ui/Input; the clamp-on-blur and
                the ltr end-anchored digits (a text-align via className, not a
                physical inset) pass through ...rest + className unchanged.
                MEH-1651: the phone field that sat below was removed — it asked
                for a number nothing read and implied a callback nobody made. */}
            <Input
              type="number"
              label={t("quantity_label")}
              min={QTY_MIN}
              max={QTY_MAX}
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
            {error && <p className="text-error text-sm" role="alert">{error}</p>}
            <Button
              type="submit"
              disabled={submitting}
              variant="primary" size="lg" className="w-full"
            >
              {submitting ? t("submitting") : user ? t("submit_join") : t("submit_login")}
            </Button>
            {/* MEH-2999: the «יש להתחבר כדי להצטרף…» line under the button is
                gone — the button already says «כניסה להצטרפות». */}
          </form>
        )}

        {/* Already committed */}
        {gb.user_committed && (
          <div className="space-y-3">
            <div className="rounded-md bg-green-50 border border-primary/20 px-4 py-3 text-primary text-sm font-medium text-center">
              {t("committed_confirm")}
              {gb.user_commit?.quantity > 1 && t("committed_units", { count: gb.user_commit.quantity })}
            </div>
            {open && !expired && (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="w-full text-sm text-fg-muted hover:text-error transition text-center"
              >
                {cancelling ? t("cancelling") : t("cancel_cta")}
              </button>
            )}
          </div>
        )}

        {expired && open && (
          <div className="rounded-md bg-border px-4 py-3 text-fg-muted text-sm text-center">
            {t("deadline_passed")}
          </div>
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
            <p className="text-sm mt-1 opacity-90">{t("funded_subtitle", { name: gb.producer_name })}</p>
          </div>
        )}
        {cancelled && (
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
            </div>
          </div>

          <aside className="lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-24 lg:self-start">
            {joinCard}
          </aside>

          <div className="min-w-0 lg:col-start-1">
            {gb.description && (
              <p className="text-lg text-text/90 leading-relaxed whitespace-pre-line">{gb.description}</p>
            )}

            {/* MEH-2544: how a group buy works, while it can still be joined —
                copy approved by Sapir 29/10. */}
            {open && (
              <section className="mt-6 rounded-xl bg-background-alt p-4" data-testid="group-buy-how">
                <SectionHeading size="content" className="mb-3">{t("how_title")}</SectionHeading>
                <ol className="space-y-2">
                  {[t("how_join"), t("how_unlock", { min: gb.min_participants }), t("how_no_commit")].map((line, i) => (
                    <li key={i} className="flex gap-3 text-base text-text">
                      <span
                        aria-hidden="true"
                        className="shrink-0 w-6 h-6 rounded-full bg-primary text-background text-sm font-bold grid place-items-center"
                      >
                        {i + 1}
                      </span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {/* MEH-2615: pickup and delivery as ONE titled section — the
                business's own note («מתי ואיך מקבלים», MEH-1457) and «מגיעים
                אלייך?» under it — instead of two unrelated boxes with the
                business row wedged between them (Eventbrite / Groupon: each
                kind of detail under its own heading, the organizer last).
                The heading rides on the note: the checker can hide itself
                (DeliveryChecker gates 1–3), and a heading over nothing would
                be an orphan. Without a note the checker stands alone, as
                before. */}
            {/* MEH-2621 split (UI): new groups answer pickup and delivery separately,
                each as its own labelled row (MapPin / Truck). A group made
                before the split carries only fulfillment_note and renders as
                it did. */}
            {(hasFulfillment || producer) && (
              // Spacing lives on the children, not the section: when there is
              // no note and the checker hides itself, the section collapses to
              // nothing instead of leaving an empty 2rem gap (review #3900).
              <section data-testid="group-buy-fulfillment">
                {hasFulfillment && (
                  <SectionHeading size="content" className="mt-8 mb-3">{t("fulfillment_title")}</SectionHeading>
                )}
                {hasSplitNotes ? (
                  <dl className="flex flex-col gap-4">
                    {[
                      ["pickup", MapPin, gb.pickup_note],
                      ["delivery", Truck, gb.delivery_note],
                    ]
                      .filter(([, , note]) => note)
                      .map(([kind, Icon, note]) => (
                        // MEH-2708: a <dl> may wrap each dt/dd pair in ONE <div>,
                        // never two (axe definition-list + dlitem). The icon moves
                        // into the <dt>, positioned at the start edge, so the
                        // layout is the same: icon column, then label over note.
                        <div key={kind} className="relative ps-[34px] min-w-0" data-testid={`group-buy-${kind}-note`}>
                          <dt className="text-sm font-bold text-text">
                            <Icon size={22} className="text-primary absolute start-0 top-0.5" aria-hidden="true" />
                            {t(`${kind}_label`)}
                          </dt>
                          <dd className="text-base text-text whitespace-pre-line">{note}</dd>
                        </div>
                      ))}
                  </dl>
                ) : (
                  gb.fulfillment_note && (
                    <p className="flex gap-3 text-base text-text whitespace-pre-line" data-testid="group-buy-fulfillment-note">
                      <MapPin size={24} className="text-primary shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{gb.fulfillment_note}</span>
                    </p>
                  )
                )}
                {/* MEH-2453: «מגיעים אלייך?» from the business's own delivery
                    data, same component and copy as its page. It hides itself
                    for a business that does not deliver, or whose answer is the
                    same for every city (DeliveryChecker gates 1–3). */}
                {producer && (
                  <div className={hasFulfillment ? "mt-4" : "mt-6"}>
                    <DeliveryChecker
                      offersDelivery={producer.offers_delivery}
                      nationwide={producer.delivery_nationwide}
                      excluded={producer.delivery_excluded_cities}
                      areas={producer.delivery_areas}
                      producer={producer}
                    />
                  </div>
                )}
              </section>
            )}

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
          JUDGMENT). z-[9500] matches LoginPromptModal so it clears the sticky
          header (z-1050) + BottomNav (z-1000) on this consumer page; the admin
          feedback-modal idiom (z-50) is unsafe here. */}
      {confirmCancelOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-[9500] flex items-center justify-center p-4"
          onClick={() => setConfirmCancelOpen(false)}
        >
          <div
            ref={cancelDialogRef}
            // MEH-2199 follow-up: the dialog role belongs on the CARD, not on
            // the full-screen backdrop it used to sit on. The backdrop covers
            // the viewport, so declaring it the dialog made the accessible
            // dialog the whole screen — and put the ARIA boundary on a
            // different element from the focus trap, which lives on this ref.
            // Two boundaries that are meant to be one: a focusable control
            // added between the backdrop and this card would have been inside
            // the ARIA dialog and outside the trap.
            role="dialog"
            aria-modal="true"
            aria-labelledby="gb-cancel-title"
            className="bg-background rounded-lg p-6 max-w-sm w-full border border-border"
            onClick={(e) => e.stopPropagation()}
          >
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
              <button
                onClick={() => setConfirmCancelOpen(false)}
                className="flex-1 bg-surface border border-border text-text py-2.5 rounded-full hover:bg-green-50 transition text-sm font-medium"
              >
                {t("cancel_dismiss")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
