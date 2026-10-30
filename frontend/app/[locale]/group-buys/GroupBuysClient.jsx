"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingCart, Clock, MapPin } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import Image from "next/image";
import { optimizeCloudinary, IMAGE_RATIOS } from "@/lib/cloudinary";
// MEH-1140: canonical shekel format ("35₪") — one owner in lib/utils.
import { formatPrice } from "@/lib/utils";
import { groupBuyProgressPct, groupBuyDiscountPct } from "@/lib/group-buy-progress"; // MEH-2540, MEH-2544
import CitySearch from "@/components/CitySearch";

// MEH-797: Sapir-mapped Cloudinary asset (staging/pick-pexels-35113948, 3732×4089)
// replaces the Unsplash hero bg. w_1600 c_limit matches the old delivery width;
// f_auto,q_auto via the helper. CSS cover crops the band; scrim below keeps AA.
// REUSES: app/[locale]/home/HomeHero.jsx (optimizeCloudinary width cap, #1055)
const HERO_BG = optimizeCloudinary(
  "https://res.cloudinary.com/dfzpscjks/image/upload/staging/pick-pexels-35113948.jpg",
  { width: 1600 }
);

// MEH-2544: image-led card (Groupon), the discount as a badge, progress
// framed as how many more are needed (Pinduoduo / Kickstarter), the deadline
// and the pickup line as trust cues. The whole card is the link. The photo is
// the business's first image (producer_image_url) — a group buy has none of
// its own; none, or one that fails to load → the cart on green-50.
export function GroupBuyCard({ gb }) {
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
      className="group bg-white rounded-[16px] border border-border overflow-hidden flex flex-col hover:border-primary transition focus-ring"
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
            <ShoppingCart size={44} weight="light" className="text-primary/70" aria-hidden="true" />
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
          <span className="absolute top-3 end-3 bg-white text-primary text-xs font-bold px-2.5 py-1 rounded-full">
            {t("funded_banner")}
          </span>
        )}
      </div>

      <div className="p-4 flex flex-col gap-2 flex-1">
        <p className="text-[13px] text-fg-muted">
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
          <p className="mt-1.5 text-[13px] font-medium text-text" data-testid="group-buy-progress-line">
            {funded || remaining === 0
              ? t("progress_label", { commits: gb.commits_count, min: gb.min_participants })
              : td("remaining_to_open", { n: remaining })}
          </p>
        </div>

        <div className="mt-auto pt-2 flex flex-col gap-1 text-[13px] text-fg-muted">
          <span className="inline-flex items-center gap-1.5">
            <Clock size={16} aria-hidden="true" className="shrink-0" />
            {daysLeft > 0 ? t("days_left", { days: daysLeft }) : t("expired")}
          </span>
          {gb.fulfillment_note && (
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <MapPin size={16} aria-hidden="true" className="shrink-0" />
              <span className="truncate">{gb.fulfillment_note}</span>
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function GroupBuysClient() {
  const t = useTranslations("group_buys.list");
  const tErr = useTranslations();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [city, setCity] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");

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
      {/* Hero */}
      <section className="relative text-white py-8 md:py-10 overflow-hidden">
        <div
          className="kenburns-right absolute"
          style={{
            inset: "-5%",
            backgroundImage: `url(${HERO_BG})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        {/* MEH-863 F-scrim: gradient via the primary-dark token (was raw rgba). */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary-dark/[0.82] to-primary-dark/[0.92]" />
        <div className="relative max-w-5xl mx-auto px-4 text-center">
          <h1 className="font-headline-display text-3xl md:text-4xl font-bold mb-2">
            {t("hero_title")}
          </h1>
          <p className="text-green-50 text-base md:text-lg">
            {t("hero_subtitle")}
          </p>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 py-6 md:py-10">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6 items-end">
          <div className="w-56 max-w-full">
            <CitySearch
              id="group-buys-city"
              label={t("filter_city_label")}
              value={city}
              onChange={(v) => setCity(v)}
              placeholder={t("filter_city_placeholder")}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { key: "open", label: t("status_open") },
              { key: "funded", label: t("status_funded") },
              { key: "fulfilled", label: t("status_fulfilled") },
            ].map((s) => (
              <button
                key={s.key}
                onClick={() => setStatusFilter(s.key)}
                aria-pressed={statusFilter === s.key}
                className={`min-h-[44px] inline-flex items-center justify-center px-4 py-2 rounded-full text-sm font-medium transition border ${
                  statusFilter === s.key
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-fg-muted border-border hover:border-primary"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 rounded-[16px] bg-border animate-pulse" />
            ))}
          </div>
        ) : error ? (
          // MEH-863 F12: distinct error state with retry (not the empty state).
          <div className="text-center py-20">
            <p className="text-fg-muted mb-4">{tErr("error.generic")}</p>
            <button
              onClick={load}
              className="min-h-[44px] inline-flex items-center justify-center bg-primary text-white px-6 py-2 rounded-full font-medium hover:bg-primary-dark transition"
            >
              {tErr("errors.boundary.retry")}
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 text-fg-muted">
            {/* MEH-862: Phosphor placeholder replaces the empty-state emoji
                (LOCK v2), mirrors the /experiences empty-state icon treatment. */}
            <div className="mb-4 flex justify-center">
              <ShoppingCart size={56} className="text-primary" aria-hidden="true" />
            </div>
            <p className="text-lg font-medium">{t("empty_title")}</p>
            <p className="text-sm mt-1">{t("empty_subtitle")}</p>
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
