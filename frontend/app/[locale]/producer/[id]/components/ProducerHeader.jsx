import { useTranslations } from "next-intl";
import { MapPin, Heart, Star, Truck } from "@phosphor-icons/react";

import AvailabilityBadge from "@/components/AvailabilityBadge";
import BadgeRow from "@/components/BadgeRow";
import CategoryTag from "@/components/CategoryTag";
import KashrutBadgeStrip from "@/components/KashrutBadgeStrip";
import TrustBadge from "@/components/TrustBadge";

/**
 * Main-column header block for the producer detail page.
 *
 * Verbatim extraction from ProducerDetail.jsx:281-423 — name + badge
 * row + trust tier + reviews chip + premium chip + favorites count +
 * AvailabilityBadge + daily-availability dot + short description +
 * contact name + city/category line + top-product/price line +
 * secondary-category tags + highlights strip + KashrutBadgeStrip +
 * vacation banner.
 *
 * Sits inside the main column of the two-column grid in
 * ProducerDetail.jsx — the breadcrumb, gallery, and mobile tab bar
 * (ProducerDetail.jsx:218-274) live OUTSIDE the grid and remain
 * inline in ProducerDetail.
 */
export default function ProducerHeader({
  producer,
  isVacation,
  vacationReturnLabel,
  primaryCategory,
}) {
  const t = useTranslations();
  return (
    <>
      {/* Header: name + trust badges */}
      <div className="flex items-center flex-wrap gap-2 mb-2">
        <h1 className="font-headline-lg text-4xl font-bold text-text">
          {producer.name}
        </h1>
        {/* MEH-18: unified badge row (all earned badges on Detail — no limit). */}
        <BadgeRow producer={producer} />
        {/* MEH-51: trust tier badge */}
        <TrustBadge tier={producer.trust_tier} />
        {producer.reviews_count > 0 && (
          <span
            className="inline-flex items-center gap-1 bg-green-50 text-accent border border-accent/20 text-xs px-3 py-1 rounded-full"
            title={t("producer.detail.header.review_count", { count: producer.reviews_count })}
          >
            {/* MEH-76: emoji star -> Phosphor; rating digits bidi-isolated
                (.numeric, MEH-763 convention). */}
            <Star size={12} weight="fill" aria-hidden="true" />
            <span className="numeric">{Number(producer.avg_rating).toFixed(1)} ({producer.reviews_count})</span>
          </span>
        )}
        {producer.plan === "premium" && (
          <span className="bg-accent text-white text-xs px-3 py-1 rounded-full">
            {t("producer.detail.header.premium")}
          </span>
        )}
        {(producer.favorites_count ?? 0) >= 5 && (
          <span className="inline-flex items-center gap-1 text-[13px] text-fg-muted">
            <Heart size={14} weight="fill" className="text-primary" aria-hidden="true" />
            {t("producer.detail.header.favorites_count", { count: producer.favorites_count })}
          </span>
        )}
        {/* MEH-291 — unified 4-state availability. Backend dual-writes to the
            legacy availability_status during the overlap, so the badge
            falls back to the legacy field if a stale row hasn't picked
            up availability_state yet. */}
        <AvailabilityBadge
          status={producer.availability_state || producer.availability_status}
          variant="detail"
        />
      </div>

      {producer.short_description && (
        <p className="text-sm md:text-base text-fg-muted line-clamp-1 mt-1">
          {producer.short_description}
        </p>
      )}

      {producer.contact_name && (
        <p className="text-[12px] text-fg-muted mt-0.5">
          {t("producer.detail.header.behind", { name: producer.contact_name })}
        </p>
      )}

      <p className="text-fg-muted text-sm flex items-center gap-1.5 mt-2 mb-3">
        <MapPin size={14} weight="duotone" />
        {producer.city}
        {primaryCategory && (
          <>
            <span className="mx-1">·</span>
            {primaryCategory.emoji} {primaryCategory.name}
          </>
        )}
      </p>

      {(producer.top_product_name || producer.starting_price_label) && (
        <p className="mt-1 text-sm mb-3">
          {producer.top_product_name && (
            <span className="text-text">{producer.top_product_name}</span>
          )}
          {producer.top_product_name && producer.starting_price_label && (
            <span className="text-fg-muted"> · </span>
          )}
          {producer.starting_price_label && (
            <span className="text-accent font-semibold">{producer.starting_price_label}</span>
          )}
        </p>
      )}

      {/* Categories */}
      {producer.categories?.length > 1 && (
        <div className="flex flex-wrap gap-2 mt-4">
          {producer.categories.map((cat) => (
            <CategoryTag key={cat.id} category={cat} />
          ))}
        </div>
      )}

      {/* Highlights strip — grass_fed / organic / delivery / kosher */}
      {(producer.grass_fed || producer.organic_certified || producer.delivery_areas?.length > 0 || producer.kosher) && (
        <div className="flex flex-wrap gap-2 mt-3">
          {producer.grass_fed && (
            <span className="bg-green-50 text-text border border-border rounded-xl text-[11px] px-[10px] py-[4px]">
              {t("producer.detail.header.attr.grass_fed")}
            </span>
          )}
          {producer.organic_certified && (
            <span className="bg-green-50 text-text border border-border rounded-xl text-[11px] px-[10px] py-[4px]">
              {t("producer.detail.header.attr.organic")}
            </span>
          )}
          {producer.delivery_areas?.length > 0 && (
            <span className="bg-green-50 text-text border border-border rounded-xl text-[11px] px-[10px] py-[4px]">
              <Truck size={14} className="text-current ms-1" aria-hidden="true" /><span className="hidden sm:inline"> {t("producer.detail.header.attr.delivery")}</span>
            </span>
          )}
          {producer.kosher && (
            <span className="bg-green-50 text-text border border-border rounded-xl text-[11px] px-[10px] py-[4px]">
              ✡️<span className="hidden sm:inline"> {t("producer.detail.header.attr.kosher")}</span>
            </span>
          )}
        </div>
      )}

      {/* MEH-51: kashrut badge strip (rendered even when kosher text exists — additive) */}
      {producer.kashrut_badges?.length > 0 && (
        <div className="mt-3">
          <KashrutBadgeStrip
            badges={producer.kashrut_badges}
            verified_at={producer.kashrut_verified_at}
            expires_at={producer.kashrut_expires_at}
          />
        </div>
      )}

      {/* MEH-291 — full_this_week banner (response-time hint, not a closure
          signal). Suppressed during vacation since that banner already
          dominates the messaging. MEH-76: amber → ADR-019 (cream + fg-muted). */}
      {producer.availability_state === "full_this_week" && !isVacation && (
        <div className="mx-0 mt-3 bg-background border border-border rounded-xl p-3">
          <p className="text-sm font-bold text-text">{t("producer.detail.header.slow_response")}</p>
        </div>
      )}

      {/* Vacation banner — the page's SINGLE vacation surface (S6 state a:
          one muted editorial banner, never two). MEH-76 chunk 1: the sidebar
          + sticky-bar copies were removed; slate → ADR-019 cream + fg-muted. */}
      {isVacation && (
        <div className="mx-0 mt-3 bg-background border border-border rounded-xl p-3">
          <p className="text-sm font-bold text-text">{t("producer.detail.header.vacation")}</p>
          <p className="text-xs text-fg-muted mt-1">
            {t("producer.detail.header.vacation_return", { label: vacationReturnLabel })}
          </p>
        </div>
      )}
    </>
  );
}
