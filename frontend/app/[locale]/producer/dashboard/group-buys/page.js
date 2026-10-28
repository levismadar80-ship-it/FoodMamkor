"use client";

import { Link, useRouter } from "@/i18n/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { ShoppingCart } from "@phosphor-icons/react";
import { formatEventDate } from "@/lib/format-date";
import api from "@/lib/api";
import { detailToMessage, isUnverifiedEmailError } from "@/lib/errors";
import { showToast } from "@/lib/toast";
// MEH-1140: canonical shekel format ("35₪") — one owner in lib/utils.
import { formatPrice } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import EmptyState from "@/components/ui/EmptyState";
import Input from "@/components/ui/Input";
import CitySearch from "@/components/CitySearch";
import InfoTooltip from "@/components/InfoTooltip";
import WhatsThis from "@/components/WhatsThis";
import UnverifiedEmailNotice from "@/components/UnverifiedEmailNotice";
// MEH-999: shared back link — one owner for target + arrow direction.
import BackLink from "@/components/ui/BackLink";
// MEH-1640: shared status colours across the four tools spokes.
import { STATUS_CLASSES } from "@/lib/dashboard-status-classes";
import { GroupBuyStatusResultSchema, OwnerGroupBuySchema } from "@/lib/api-schemas";

const STATUS_CLS = {
  open: STATUS_CLASSES.info,
  funded: STATUS_CLASSES.success,
  cancelled: STATUS_CLASSES.neutral,
  fulfilled: STATUS_CLASSES.success,
};

// MEH-2453: the server's floor for the fulfillment note (GroupBuyCreate,
// MEH-555 pattern): at least 3 letters once stripped, counted over the same
// scripts as _LETTER_REGEX (Hebrew, Latin, Arabic). "." or "כן" is not an
// answer to "how do I get this". GroupBuyNoteLetterContract.test.js pins the
// class below to _LETTER_REGEX, so the two cannot drift apart.
const NOTE_MIN_LETTERS = 3;
const NOTE_LETTER = /[\u05d0-\u05eaa-zA-Z\u0621-\u063f\u0641-\u064a\u066e-\u066f\u0671-\u06d3]/g;
const countLetters = (text) => (text.match(NOTE_LETTER) || []).length;

function NewGroupBuyForm({ producerCity, onCreated }) {
  const t = useTranslations("group_buys.dashboard.form");
  // MEH-848: shared generic error copy (collapsed from group_buys.dashboard.form.errors.generic).
  const tError = useTranslations("error");
  const [form, setForm] = useState({
    title: "",
    description: "",
    product_name: "",
    unit: "",
    price_per_unit_regular: "",
    price_per_unit_group: "",
    min_participants: "",
    max_participants: "",
    deadline: "",
    city: producerCity || "",
    fulfillment_note: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // MEH-1164 B: verified-email 403 → resend CTA notice instead of a dead-end.
  const [unverified, setUnverified] = useState(false);
  // MEH-2453: the note is required. Native `required` lets whitespace through,
  // so the blank check is ours; the error sits under the field, not at the end.
  const [noteError, setNoteError] = useState(false);
  const noteRef = useRef(null);

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  // MEH-992: mirror the backend rule (group_buys.py:192, group < regular)
  // client-side so a group≥regular price shows an inline helper instead of a
  // raw 400. Only flags once BOTH prices are entered.
  const priceInvalid =
    form.price_per_unit_regular !== "" &&
    form.price_per_unit_group !== "" &&
    Number(form.price_per_unit_group) >= Number(form.price_per_unit_regular);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setUnverified(false);
    const fulfillmentNote = form.fulfillment_note.trim();
    if (countLetters(fulfillmentNote) < NOTE_MIN_LETTERS) {
      setNoteError(true);
      noteRef.current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/group-buys", {
        ...form,
        fulfillment_note: fulfillmentNote,
        price_per_unit_regular: Number(form.price_per_unit_regular),
        price_per_unit_group: Number(form.price_per_unit_group),
        min_participants: Number(form.min_participants),
        max_participants: form.max_participants ? Number(form.max_participants) : undefined,
        deadline: new Date(form.deadline).toISOString(),
      });
      showToast.success(t("toast_created")); // MEH-1446
      onCreated();
    } catch (err) {
      if (isUnverifiedEmailError(err)) {
        setUnverified(true);
      } else {
        setError(detailToMessage(err.response?.data?.detail) || tError("generic"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-white rounded-[16px] border border-border p-6">
      <h2 className="font-headline-lg text-lg font-bold text-text">{t("heading")}</h2>
      {/* MEH-992: one-line concept intro — what a group-buy is */}
      <p className="text-sm text-fg-muted">{t("concept_intro")}</p>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          {/* MEH-1128 Wave B: single-line fields via ui/Input — labels gain the
              canon htmlFor/id wiring these bare <label>s never had (MEH-1096 class). */}
          <Input
            label={t("title_label")}
            value={form.title}
            onChange={set("title")}
            placeholder={t("title_placeholder")}
            required
            dir="rtl"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium mb-1">{t("description_label")}</label>
          <textarea
            value={form.description}
            onChange={set("description")}
            placeholder={t("description_placeholder")}
            rows={2}
            className="w-full border border-border rounded-[8px] px-3 py-2 text-start resize-none"
            dir="rtl"
          />
        </div>

        <Input
          label={t("product_name_label")}
          value={form.product_name}
          onChange={set("product_name")}
          placeholder={t("product_name_placeholder")}
          required
          dir="rtl"
        />
        <Input
          label={t("unit_label")}
          value={form.unit}
          onChange={set("unit")}
          placeholder={t("unit_placeholder")}
          dir="rtl"
        />

        {/* MEH-1128 D2: MEH-992 ₪ absolute-span → Input startAdornment (D1).
            Behavior identical — ₪ sits at the start (right in RTL) and the
            dir=ltr digits keep their text-end alignment. The price_group soft
            price-rule helper (muted→red, NOT a field error) stays a sibling —
            routing it through Input's error would wrongly add a border-error. */}
        <Input
          type="number"
          min={1}
          step={0.01}
          label={t("price_regular_label")}
          value={form.price_per_unit_regular}
          onChange={set("price_per_unit_regular")}
          required
          startAdornment="₪"
          className="text-end"
          dir="ltr"
        />
        <div>
          <Input
            type="number"
            min={1}
            step={0.01}
            label={t("price_group_label")}
            value={form.price_per_unit_group}
            onChange={set("price_per_unit_group")}
            required
            startAdornment="₪"
            className="text-end"
            dir="ltr"
          />
          {/* MEH-992: pre-submit price-rule helper — muted hint, turns red on violation (pre-400) */}
          <p className={`text-xs mt-1 ${priceInvalid ? "text-red-500" : "text-fg-muted"}`}>
            {t("price_helper")}
          </p>
        </div>

        <Input
          label={<>{t("min_label")} <InfoTooltip content={t("min_tooltip")} /></>}
          type="number"
          min={2}
          value={form.min_participants}
          onChange={set("min_participants")}
          placeholder={t("min_placeholder")}
          required
          dir="ltr"
        />
        <Input
          label={t("max_label")}
          type="number"
          min={2}
          value={form.max_participants}
          onChange={set("max_participants")}
          placeholder={t("max_placeholder")}
          dir="ltr"
        />

        {/* MEH-992 deadline helper (what the date means + Israel time) rides the
            Input helperText slot. */}
        <Input
          label={t("deadline_label")}
          type="datetime-local"
          value={form.deadline}
          onChange={set("deadline")}
          required
          helperText={t("deadline_helper")}
          dir="ltr"
        />
        {/* MEH-1455: canonical CitySearch (was a free-text Input) — a group
            created with a canonical city name is findable under the /group-buys
            city filter (exact-match `GroupBuy.city == city`). Prefill from
            producerCity kept; free typing still allowed (CitySearch default). */}
        <CitySearch
          id="gb-city"
          label={t("city_label")}
          labelVisible
          value={form.city}
          onChange={(val) => setForm({ ...form, city: val })}
        />

        {/* MEH-1457: "מתי ואיך מקבלים" — free text (OFN "Ready for").
            MEH-2453: required, with a helper saying who reads it. A textarea,
            so it cannot ride ui/Input; the label marker, helper and error
            copy Input's markup and aria wiring. */}
        <div className="sm:col-span-2 flex flex-col gap-1.5">
          <label htmlFor="gb-fulfillment" className="text-sm font-medium text-text">
            {t("fulfillment_label")}
            <span className="text-error" aria-hidden="true">
              {" *"}
            </span>
          </label>
          <textarea
            id="gb-fulfillment"
            ref={noteRef}
            value={form.fulfillment_note}
            onChange={(e) => {
              setNoteError(false);
              set("fulfillment_note")(e);
            }}
            placeholder={t("fulfillment_placeholder")}
            required
            maxLength={1000}
            aria-invalid={noteError || undefined}
            aria-describedby={
              noteError ? "gb-fulfillment-helper gb-fulfillment-error" : "gb-fulfillment-helper"
            }
            rows={2}
            className={`w-full border rounded-[8px] px-3 py-2 text-start resize-none ${
              noteError ? "border-error" : "border-border"
            }`}
            dir="rtl"
          />
          <p id="gb-fulfillment-helper" className="text-xs text-fg-muted">
            {t("fulfillment_helper")}
          </p>
          {noteError && (
            <p id="gb-fulfillment-error" role="alert" className="text-xs text-error">
              {t("fulfillment_required")}
            </p>
          )}
        </div>
      </div>

      {/* MEH-1165: role="alert" so the submit error is announced to AT. */}
      {unverified && <UnverifiedEmailNotice />}
      {error && <p className="text-red-500 text-sm" role="alert">{error}</p>}
      <button
        type="submit"
        disabled={submitting || priceInvalid}
        className="bg-primary text-white px-6 py-2.5 min-h-[44px] rounded-[8px] hover:bg-primary-dark transition font-medium disabled:opacity-50"
      >
        {submitting ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}

// MEH-2435 (chunk 3): what the owner may do to a group buy, by state. Mirrors
// OWNER_TRANSITIONS in backend/app/routers/group_buys.py — the server stays the
// authority (anything else is a 409); this only decides which buttons show.
// "close" and "cancel" both write cancelled; they differ in what the owner is
// told, because past the deadline she is not cancelling a live group.
const ACTION_TARGET = { cancel: "cancelled", close: "cancelled", deliver: "fulfilled" };

function ownerActions(gb, deadlinePassed) {
  if (gb.status === "open") return deadlinePassed ? ["close"] : ["cancel"];
  if (gb.status === "funded") return ["deliver", "cancel"];
  return [];
}

// Same dialog contract as the product delete confirm (ProductsSection.jsx,
// MEH-1447): a state flag rather than window.confirm, aria-modal, Escape and
// «חזרה» close it, both buttons locked while the request is in flight.
function GroupBuyActionDialog({ pending, busy, stale, error, onConfirm, onClose }) {
  const t = useTranslations("group_buys.dashboard.actions");

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const { gb, action } = pending;
  const destructive = action !== "deliver";
  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-buy-action-title"
        data-testid="group-buy-action-dialog"
        className="bg-white rounded-[16px] shadow-xl p-6 max-w-sm w-full text-start space-y-3"
      >
        <p id="group-buy-action-title" className="font-medium text-base text-text">
          {t(`${action}_title`)}
        </p>
        <p className="text-sm text-fg-muted">{t(`${action}_body`)}</p>
        {action === "cancel" && gb.status === "funded" && (
          <p data-testid="group-buy-cancel-funded-note" className="text-sm font-medium text-text">
            {t("cancel_funded_note", { count: gb.commits_count })}
          </p>
        )}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3 justify-start pt-1">
          <button
            type="button"
            data-testid="group-buy-action-confirm"
            // stale: the server refused (409) because the group changed while
            // the dialog was open. Confirming again would only repeat the 409;
            // «חזרה» returns her to the card, which now shows the real state.
            disabled={busy || stale}
            onClick={onConfirm}
            className={`px-4 py-2 min-h-[44px] rounded-[10px] text-sm font-medium text-white transition disabled:opacity-50 ${
              destructive ? "bg-red-600 hover:bg-red-700" : "bg-primary hover:bg-primary-dark"
            }`}
          >
            {/* The close and deliver confirms reuse their button's own label —
                the approved copy names a confirm label only for cancel. */}
            {action === "cancel" ? t("cancel_confirm") : t(action)}
          </button>
          {/* Focus lands on the safe choice, so a keyboard user starts inside
              the dialog and Enter never confirms by accident. */}
          <button
            type="button"
            autoFocus
            disabled={busy}
            onClick={onClose}
            className="px-4 py-2 min-h-[44px] rounded-[10px] text-sm border border-border text-fg-muted hover:bg-gray-50 transition disabled:opacity-50"
          >
            {t("back")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProducerGroupBuysPage() {
  const t = useTranslations("group_buys.dashboard");
  // MEH-1115: point-of-decision explainer (top-level whats_this namespace).
  const tWhat = useTranslations("whats_this");
  const locale = useLocale();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [producerCity, setProducerCity] = useState("");
  // MEH-1165 (audit item 1): the backend 403-gates creation on approval
  // (group_buys.py:187), but the form surfaced that only AFTER filling
  // everything. Track status so a pending producer sees a pre-form disabled
  // state + hint instead (availability-card idiom, dashboard/page.js:457).
  // null = unknown (fetch failed) → fail-open to enabled; backend still gates.
  const [producerStatus, setProducerStatus] = useState(null);
  // MEH-2435 (chunk 3): the open confirm dialog — { gb, action } | null.
  const [pending, setPending] = useState(null);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionStale, setActionStale] = useState(false);
  const tActions = useTranslations("group_buys.dashboard.actions");
  const tError = useTranslations("error");

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== "producer") {
      router.push("/login");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  const load = async () => {
    try {
      // MEH-2437: one call for this business's group buys in every status,
      // newest first — it used to fetch the whole site four times (one per
      // status) and filter by producer_id here.
      const [gbRes, dashRes] = await Promise.all([
        api.get("/producers/me/group-buys"),
        api.get("/producers/me/dashboard"),
      ]);
      setProducerCity(dashRes.data?.producer?.city || "");
      setProducerStatus(dashRes.data?.producer?.status || null);
      // Rule 19, per row (the /favorites precedent): one malformed group buy
      // costs its own card, not the owner's whole list.
      const rows = Array.isArray(gbRes.data) ? gbRes.data : [];
      setItems(
        rows.flatMap((row) => {
          const parsed = OwnerGroupBuySchema.safeParse(row);
          return parsed.success ? [{ ...row, ...parsed.data }] : [];
        }),
      );
    } catch {
      setItems([]);
    }
  };

  const openAction = (gb, action) => {
    setActionError("");
    setActionStale(false);
    setPending({ gb, action });
  };

  const closeAction = useCallback(() => {
    setPending(null);
    setActionError("");
    setActionStale(false);
  }, []);

  const confirmAction = async () => {
    if (!pending || acting) return;
    const { gb, action } = pending;
    setActing(true);
    setActionError("");
    try {
      // MEH-2489: send the status this card showed. If the group moved on
      // meanwhile (a last participant joined: open → funded), the server
      // answers 409 rather than cancel a funded group whose double confirm she
      // never saw; the 409 branch below reloads and shows the real state.
      const res = await api.patch(`/group-buys/${gb.id}/status`, {
        status: ACTION_TARGET[action],
        expected_status: gb.status,
      });
      const parsed = GroupBuyStatusResultSchema.safeParse(res.data);
      if (parsed.success) {
        setItems((prev) =>
          prev.map((it) => (it.id === gb.id ? { ...it, status: parsed.data.status } : it)),
        );
      } else {
        // The change went through but the answer is not readable — fetch the
        // list again rather than guess the new status.
        load();
      }
      setPending(null);
      showToast.success(
        tActions(ACTION_TARGET[action] === "fulfilled" ? "toast_fulfilled" : "toast_cancelled"),
      );
    } catch (err) {
      // 409 = the group changed under her (e.g. a participant left and a
      // funded group fell back to open); the server's Hebrew detail says so.
      // Lock the confirm and refresh the list so the card shows the state the
      // server actually holds.
      setActionError(detailToMessage(err.response?.data?.detail) || tError("generic"));
      if (err.response?.status === 409) {
        setActionStale(true);
        load();
      }
    } finally {
      setActing(false);
    }
  };

  if (authLoading || !user) return null;

  const notApproved = producerStatus !== null && producerStatus !== "approved";

  const statusLabel = (status) => {
    const key = STATUS_CLS[status] ? `status.${status}` : null;
    return key ? t(key) : status;
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      {/* MEH-1655: min-h pins the row at CTA height so it doesn't shrink
          when the button unmounts. */}
      <div className="flex items-center justify-between mb-6 min-h-[44px]">
        <div>
          {/* MEH-999: entered from the Tools tab (tools/page.js:92). */}
          <BackLink href="/producer/dashboard/tools" label={t("back")} />
          <h1 className="font-headline-lg text-3xl font-bold text-text mt-1">
            {t("heading")}
          </h1>
          {/* MEH-1115: what a group buy is, under the page heading. */}
          <WhatsThis content={tWhat("group_buy")} testId="whats-this-group-buy" />
        </div>
        {/* MEH-1420: hide the header toggle in the approved empty state so the
            EmptyState CTA is the single create entry point (mirrors MEH-1097 F14
            in recipes/page.js:85). The button returns once a group exists, or
            while the form is open (rendering as "close"). MEH-1655: also hidden
            while loading (items === null) — it used to render then jump to the
            EmptyState CTA on an empty result.
            MEH-1709: notApproved is no longer the exception that kept a
            *disabled* button + a separate aria-describedby hint (MEH-1350 /
            MEH-1165). A muted control that does nothing is the only thing that
            looks pressable on that screen (NN/g). The button is now absent
            while unapproved, and the why-locked string moved into the
            EmptyState description below — so the explanation still has a
            home and nothing on screen invites a dead press. */}
        {items !== null && !notApproved && !(items.length === 0 && !showForm) && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="bg-primary text-white px-4 py-2 min-h-[44px] rounded-[8px] text-sm font-medium hover:bg-primary-dark transition"
          >
            {showForm ? t("btn_close_form") : t("btn_open_form")}
          </button>
        )}
      </div>

      {/* MEH-1165: why-locked hint (availability-card idiom,
          dashboard/page.js:457-461).
          MEH-1709: only when the list is NON-empty. In the empty state the same
          string is now the EmptyState description, and rendering both would say
          it twice. The `id` is gone with the button that pointed at it — the
          aria-describedby target had exactly one consumer (grep: this file
          only). This branch is the suspended-with-existing-groups case: no
          create affordance, but the reason still has to be on screen. */}
      {notApproved && items !== null && items.length > 0 && (
        <p
          data-testid="group-buy-approval-hint"
          className="text-xs text-fg-muted -mt-3 mb-6"
        >
          {t("approval_required_hint")}
        </p>
      )}

      {showForm && (
        <div className="mb-8">
          <NewGroupBuyForm
            producerCity={producerCity}
            onCreated={() => {
              setShowForm(false);
              load();
            }}
          />
        </div>
      )}

      {items === null ? (
        <div className="text-center py-16 text-fg-muted">{t("loading")}</div>
      ) : items.length === 0 ? (
        // MEH-996: empty state and the open create form are mutually
        // exclusive — never mounted together (settings/page.jsx precedent).
        !showForm && (
          <EmptyState
            icon={ShoppingCart}
            title={t("empty_title")}
            // MEH-1709: while unapproved the description IS the why-locked
            // string — one region, one explanation, one (absent) affordance.
            // Structural only: both strings already exist, neither is reworded
            // here. The title still reads as a value proposition rather than a
            // state; that is the copy convention MEH-1710 locks and MEH-1630
            // applies, deliberately out of scope for this fix.
            description={notApproved ? t("approval_required_hint") : t("empty_description")}
            // MEH-1165 / MEH-1709: no CTA while unapproved — both props drop,
            // so EmptyState renders no button at all (ctaLabel && (ctaHref ||
            // ctaOnClick)).
            ctaLabel={notApproved ? undefined : t("empty_cta")}
            ctaOnClick={notApproved ? undefined : () => setShowForm(true)}
          />
        )
      ) : (
        <div className="space-y-4">
          {items.map((gb) => {
            // MEH-2430: an open group buy past its deadline stayed «פתוחה» —
            // nothing moves the status server-side on its own. Display only;
            // since MEH-2435 the owner closes it with «סגירת הקבוצה» below.
            // deadline is a full UTC timestamp (form sends toISOString), so an
            // instant compare is right here, unlike the date-only event lists.
            // It reads the device clock: a skewed clock only swaps «ביטול» and
            // «סגירה», since the server takes both as open → cancelled.
            const deadlinePassed = gb.status === "open" && new Date(gb.deadline) < new Date();
            const actions = ownerActions(gb, deadlinePassed);
            const cls = deadlinePassed
              ? STATUS_CLASSES.neutral
              : STATUS_CLS[gb.status] || STATUS_CLASSES.neutral;
            const pct = Math.min(100, Math.round((gb.commits_count / gb.min_participants) * 100));
            return (
              <div key={gb.id} data-testid="manage-group-buy-card" className="bg-white rounded-[14px] border border-border p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h2 className="font-semibold text-text">{gb.title}</h2>
                    <p className="text-xs text-fg-muted mt-0.5">{gb.product_name}</p>
                  </div>
                  <span className={`text-xs border px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>
                    {deadlinePassed ? t("status_deadline_passed") : statusLabel(gb.status)}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-sm mb-3">
                  <span className="font-bold text-primary">{formatPrice(Number(gb.price_per_unit_group).toFixed(0))}</span>
                  <span className="text-fg-muted line-through">{formatPrice(Number(gb.price_per_unit_regular).toFixed(0))}</span>
                </div>

                <div className="mb-2">
                  <div className="flex justify-between text-xs text-fg-muted mb-1">
                    <span>{t("progress_label", { commits: gb.commits_count, min: gb.min_participants })}</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="w-full bg-border rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full ${gb.status === "funded" || gb.status === "fulfilled" ? "bg-primary" : "bg-primary/40"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-fg-muted">
                  <span>
                    {t("deadline_prefix", { date: formatEventDate(gb.deadline, locale, { day: "numeric", month: "numeric", year: "numeric" }) })}
                  </span>
                  <Link
                    href={`/group-buys/${gb.id}`}
                    className="text-primary hover:underline"
                  >
                    {t("view_public")}
                  </Link>
                </div>

                {/* MEH-2435 (chunk 3): only the moves this state allows;
                    cancelled and fulfilled cards get no action row at all. */}
                {actions.length > 0 && (
                  <div
                    data-testid="group-buy-actions"
                    className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border"
                  >
                    {actions.map((action) => (
                      <button
                        key={action}
                        type="button"
                        data-testid={`group-buy-action-${action}`}
                        onClick={() => openAction(gb, action)}
                        className={
                          action === "deliver"
                            ? "px-4 py-2 min-h-[44px] rounded-[8px] text-sm font-medium bg-primary text-white hover:bg-primary-dark transition"
                            : "px-4 py-2 min-h-[44px] rounded-[8px] text-sm border border-border text-red-700 hover:bg-red-50 transition"
                        }
                      >
                        {tActions(action)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {pending && (
        <GroupBuyActionDialog
          pending={pending}
          busy={acting}
          stale={actionStale}
          error={actionError}
          onConfirm={confirmAction}
          onClose={closeAction}
        />
      )}
    </div>
  );
}
