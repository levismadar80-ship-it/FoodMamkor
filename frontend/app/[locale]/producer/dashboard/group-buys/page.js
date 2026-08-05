"use client";

import { Link, useRouter } from "@/i18n/navigation";
import { useEffect, useState } from "react";
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

const STATUS_CLS = {
  open: "bg-blue-50 text-blue-700 border-blue-200",
  funded: "bg-[#EAF3DE] text-primary border-primary/20",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200",
  fulfilled: "bg-green-50 text-primary border-primary/30",
};

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
    setSubmitting(true);
    try {
      await api.post("/group-buys", {
        ...form,
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
      <h2 className="font-headline-md text-lg font-bold text-text">{t("heading")}</h2>
      {/* MEH-992: one-line concept intro — what a group-buy is */}
      <p className="text-sm text-fg-muted">{t("concept_intro")}</p>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          {/* MEH-1128 Wave B: single-line fields via ui/Input — labels gain the
              canon htmlFor/id wiring these bare <label>s never had (MEH-1096 class). */}
          <Input
            label={`${t("title_label")}${t("required_marker")}`}
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
            className="w-full border border-border rounded-[10px] px-3 py-2 text-start resize-none"
            dir="rtl"
          />
        </div>

        <Input
          label={`${t("product_name_label")}${t("required_marker")}`}
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
          label={`${t("price_regular_label")}${t("required_marker")}`}
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
            label={`${t("price_group_label")}${t("required_marker")}`}
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
          label={<>{t("min_label")}{t("required_marker")} <InfoTooltip content={t("min_tooltip")} /></>}
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
          label={`${t("deadline_label")}${t("required_marker")}`}
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

        {/* MEH-1457: optional "מתי ואיך מקבלים" — free text (OFN "Ready for"). */}
        <div className="sm:col-span-2">
          <label htmlFor="gb-fulfillment" className="block text-sm font-medium mb-1">
            {t("fulfillment_label")}
          </label>
          <textarea
            id="gb-fulfillment"
            value={form.fulfillment_note}
            onChange={set("fulfillment_note")}
            placeholder={t("fulfillment_placeholder")}
            rows={2}
            className="w-full border border-border rounded-[10px] px-3 py-2 text-start resize-none"
            dir="rtl"
          />
        </div>
      </div>

      {/* MEH-1165: role="alert" so the submit error is announced to AT. */}
      {unverified && <UnverifiedEmailNotice />}
      {error && <p className="text-red-500 text-sm" role="alert">{error}</p>}
      <button
        type="submit"
        disabled={submitting || priceInvalid}
        className="bg-primary text-white px-6 py-2.5 rounded-[10px] hover:bg-primary-dark transition font-medium disabled:opacity-50"
      >
        {submitting ? t("submitting") : t("submit")}
      </button>
    </form>
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
      const [gbRes, dashRes] = await Promise.all([
        api.get("/group-buys", { params: { status: "open" } }),
        api.get("/producers/me/dashboard"),
      ]);
      // Filter to only this producer's group buys
      const producerId = dashRes.data?.producer?.id;
      setProducerCity(dashRes.data?.producer?.city || "");
      setProducerStatus(dashRes.data?.producer?.status || null);
      const mine = gbRes.data.filter((gb) => gb.producer_id === producerId);
      // Also fetch funded/cancelled
      const [fundedRes, cancelledRes, fulfilledRes] = await Promise.all([
        api.get("/group-buys", { params: { status: "funded" } }),
        api.get("/group-buys", { params: { status: "cancelled" } }),
        api.get("/group-buys", { params: { status: "fulfilled" } }),
      ]);
      const allMine = [
        ...mine,
        ...fundedRes.data.filter((gb) => gb.producer_id === producerId),
        ...cancelledRes.data.filter((gb) => gb.producer_id === producerId),
        ...fulfilledRes.data.filter((gb) => gb.producer_id === producerId),
      ];
      allMine.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setItems(allMine);
    } catch {
      setItems([]);
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
          <h1 className="font-headline-md text-2xl font-bold text-text mt-1">
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
            className="bg-primary text-white px-4 py-2 rounded-[10px] text-sm font-medium hover:bg-primary-dark transition"
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
            const cls = STATUS_CLS[gb.status] || "bg-gray-100 text-gray-600 border-gray-200";
            const pct = Math.min(100, Math.round((gb.commits_count / gb.min_participants) * 100));
            return (
              <div key={gb.id} className="bg-white rounded-[14px] border border-border p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h2 className="font-semibold text-text">{gb.title}</h2>
                    <p className="text-xs text-fg-muted mt-0.5">{gb.product_name}</p>
                  </div>
                  <span className={`text-xs border px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>
                    {statusLabel(gb.status)}
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
