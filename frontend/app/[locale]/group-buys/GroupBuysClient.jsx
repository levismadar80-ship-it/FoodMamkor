"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { ShoppingCart, Clock, MapPin, Truck } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import HubShell from "@/components/HubShell";
import api from "@/lib/api";
import Image from "next/image";
import { optimizeCloudinary, IMAGE_RATIOS } from "@/lib/cloudinary";
// MEH-1140: canonical shekel format ("35₪") — one owner in lib/utils.
import { formatPrice } from "@/lib/utils";
import { groupBuyProgressPct, groupBuyDiscountPct } from "@/lib/group-buy-progress"; // MEH-2540, MEH-2544
import CitySearch from "@/components/CitySearch";
import ChipScrollRow from "@/components/ChipScrollRow";
import { dropZeroChips } from "@/lib/chip-gate"; // MEH-3128
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonBlock } from "@/components/Skeleton";

// MEH-3013: the hero photo is the hub's shared one (components/HubShell.jsx);
// this page's own MEH-797 photo retired so a tab switch never swaps images.

// MEH-2544: image-led card (Groupon), the discount as a badge, progress
// framed as how many more are needed (Pinduoduo / Kickstarter), the deadline
// and the pickup line as trust cues. The whole card is the link. The photo is
// the business's first image (producer_image_url) — a group buy has none of
// its own; none, or one that fails to load → the cart on green-50.
function GroupBuyCard({ gb }) {
  const t = useTranslations("group_buys.card");
  const td = useTranslations("group_buys.detail");
  const funded = gb.status === "funded";
  const pct = groupBuyProgressPct(gb.commits_count, gb.min_participants);
  const deadline = new Date(gb.deadline);
  const daysLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 86400000));
  const discount = groupBuyDiscountPct(gb.price_per_unit_regular, gb.price_per_unit_group);
  const remaining = Math.max(0, gb.min_participants - gb.commits_count);
  const imgSrc = gb.producer_image_url
    ? optimizeCloudinary(gb.producer_image_url, { aspectRatio: IMAGE_RATIOS.banner, width: 750 })
    : null;
  const [failedSrc, setFailedSrc] = useState(null);
  const showImg = imgSrc && failedSrc !== imgSrc;

  return (
    <Link
      href={`/group-buys/${gb.id}`}
      data-testid="group-buy-card"
      className="group bg-surface rounded-lg border border-border overflow-hidden flex flex-col hover:border-primary transition focus-ring"
    >
      <div className="relative aspect-[16/9] bg-green-50 overflow-hidden">
        {showImg ? (
          <Image
            src={imgSrc}
            alt=""
            fill
            sizes="(max-width: 639px) calc(100vw - 32px), (max-width: 1023px) calc(50vw - 28px), 320px"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            onError={() => setFailedSrc(imgSrc)}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center" data-testid="group-buy-image-missing">
            <ShoppingCart size={48} weight="regular" className="text-primary/70" aria-hidden="true" />
          </div>
        )}
        {discount > 0 && (
          <span
            dir="ltr"
            data-testid="group-buy-discount"
            className="absolute top-3 start-3 bg-primary text-white text-sm font-bold px-2.5 py-1 rounded-full"
          >
            -{discount}%
          </span>
        )}
        {funded && (
          <span className="absolute top-3 end-3 bg-surface text-primary text-xs font-bold px-2.5 py-1 rounded-full">
            {t("funded_banner")}
          </span>
        )}
      </div>

      <div className="p-4 flex flex-col gap-2 flex-1">
        <p className="text-sm text-fg-muted">
          {[gb.producer_name, gb.city].filter(Boolean).join(" · ")}
        </p>
        <h2 className="font-headline-md text-lg font-bold text-text leading-snug line-clamp-2">
          {gb.title}
        </h2>
        {/* MEH-2472: what is being bought. */}
        {gb.product_name && (
          <p className="text-sm text-text" data-testid="group-buy-product-name">
            {gb.product_name}
          </p>
        )}

        {/* MEH-863 F11: dir="ltr" keeps ₪ + digits in order inside RTL. */}
        <div className="flex items-baseline gap-2 mt-1">
          <span dir="ltr" className="text-2xl font-bold text-primary">
            {formatPrice(Number(gb.price_per_unit_group).toFixed(0))}
          </span>
          <span dir="ltr" className="text-sm text-fg-muted line-through">
            {formatPrice(Number(gb.price_per_unit_regular).toFixed(0))}
          </span>
          {gb.unit && <span className="text-xs text-fg-muted">{t("unit_prefix", { unit: gb.unit })}</span>}
        </div>

        <div className="mt-1">
          <div className="w-full bg-border rounded-full h-2.5 overflow-hidden">
            <div className="h-2.5 rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-sm font-medium text-text" data-testid="group-buy-progress-line">
            {funded || remaining === 0
              ? t("progress_label", { commits: gb.commits_count, min: gb.min_participants })
              : td("remaining_to_open", { n: remaining })}
          </p>
        </div>

        <div className="mt-auto pt-2 flex flex-col gap-1 text-sm text-fg-muted">
          <span className="inline-flex items-center gap-1.5">
            <Clock size={16} aria-hidden="true" className="shrink-0" />
            {daysLeft > 0 ? t("days_left", { days: daysLeft }) : t("expired")}
          </span>
          {/* MEH-2621 split (UI): one short line per answer (pickup / delivery); a group
              made before the split shows its single note as before. */}
          {(gb.pickup_note || gb.delivery_note
            ? [
                ["pickup", MapPin, gb.pickup_note],
                ["delivery", Truck, gb.delivery_note],
              ]
            : [["fulfillment", MapPin, gb.fulfillment_note]]
          )
            .filter(([, , note]) => note)
            .map(([kind, Icon, note]) => (
              <span key={kind} className="inline-flex items-center gap-1.5 min-w-0" data-testid={`group-buy-card-${kind}`}>
                <Icon size={16} aria-hidden="true" className="shrink-0" />
                <span className="truncate">{note}</span>
              </span>
            ))}
        </div>
      </div>
    </Link>
  );
}

export default function GroupBuysClient() {
  const t = useTranslations("group_buys.list");
  const tHub = useTranslations("events.list");
  // home.whats_on.eyebrow: «קרוב לבית» / "Close to home" — the tab-neutral
  // eyebrow (events.list.eyebrow_events reads "EVENTS" in en).
  const tWhatsOn = useTranslations("home.whats_on");
  const tErr = useTranslations();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [city, setCity] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const statusKeys = useMemo(() => ({ [statusFilter]: true }), [statusFilter]);
  // MEH-3128: rows per status tab for this city — a tab with 0 is not drawn.
  // null = unknown (loading or failed) → every tab, as before.
  const [statusCounts, setStatusCounts] = useState(null);
  useEffect(() => {
    let live = true;
    setStatusCounts(null);
    api
      .get("/group-buys/counts", { params: city ? { city } : {} })
      .then((r) => live && setStatusCounts(r.data))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [city]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, statusFilter]);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const params = { status: statusFilter };
      if (city) params.city = city;
      const r = await api.get("/group-buys", { params });
      setItems(r.data);
    } catch {
      // MEH-863 F12: surface the failure (error state + retry) instead of
      // swallowing it into the empty state (MEH-325 silent-except pattern).
      setError(true);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* MEH-3013: the hub's shared head — the same photo hero, type and
          tab-row position as /events, /experiences and /rescue (it was a
          short centred hero here). Own H1/subtitle (Sapir
          11/11); the eyebrow is the hub's existing one. */}
      <HubShell
        active="groupBuys"
        eyebrow={tWhatsOn("eyebrow")}
        title={t("hero_title")}
        subtitle={t("hero_subtitle")}
      />

      <div className="max-w-5xl mx-auto px-4 pt-4 pb-16">
        {/* Filters — MEH-3013: the same toolbar shape as the other hub tabs
            (EventsClient): city field (same width and wording), then the chip
            row in the shared ChipScrollRow style. Status stays single-select:
            the click handler sets one key. */}
        <div className="flex items-center gap-2 md:gap-3">
          <CitySearch
            id="group-buys-city"
            label={tHub("filter_city_label")}
            value={city}
            onChange={(v) => setCity(v)}
            placeholder={tHub("filter_city_placeholder")}
            className="flex-1 md:max-w-xs"
          />
        </div>
        <div className="pt-3 mb-3">
          <ChipScrollRow
            variant="toggle"
            chips={dropZeroChips({
              chips: [
                { key: "open", label: t("status_open") },
                { key: "funded", label: t("status_funded") },
                { key: "fulfilled", label: t("status_fulfilled") },
              ],
              counts: statusCounts,
              active: [statusFilter],
            })}
            activeKeys={statusKeys}
            onChipClick={(key) => setStatusFilter(key)}
          />
        </div>

        {/* MEH-2620: one line under the chips says what the selected tab
            holds. «הגיעו ליעד» alone does not tell a first-timer that those
            groups can no longer be joined (commit 400s once funded,
            group_buys.py:247) — copy approved by Sapir 30/10. */}
        <p className="text-sm text-fg-muted mb-6" aria-live="polite" data-testid="group-buys-status-hint">
          {t(`status_hint_${statusFilter}`)}
        </p>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <SkeletonBlock as="div" key={i} className="h-64 rounded-lg" />
            ))}
          </div>
        ) : error ? (
          // MEH-863 F12: distinct error state with retry (not the empty state).
          <div className="text-center py-20">
            <p className="text-fg-muted mb-4">{tErr("error.generic")}</p>
            <Button
              onClick={load}
              variant="primary" size="lg"
            >
              {tErr("errors.boundary.retry")}
            </Button>
          </div>
        ) : items.length === 0 ? (
          // MEH-2994: the shared empty state (was a hand-built copy of it,
          // MEH-862) — same icon and the same two strings.
          <div data-testid="group-buys-empty">
            <EmptyState icon={ShoppingCart} title={t("empty_title")} description={t("empty_subtitle")} />
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map((gb) => (
              <GroupBuyCard key={gb.id} gb={gb} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
