"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import Image from "next/image";
import {
  HeartStraight,
  Heart,
  WhatsappLogo,
  Phone,
  Globe,
  EnvelopeSimple,
} from "@phosphor-icons/react";
import BadgeRow from "./BadgeRow";
import TrustBadge from "./TrustBadge";
import { optimizeCloudinary } from "@/lib/cloudinary";
import { highlightMatch } from "@/lib/highlightMatch";
import { useUserLocation } from "@/lib/user-location";
import { haversineKm, formatDistance } from "@/lib/distance";
import { getPrimaryMethod } from "@/lib/contact-method";
import { useAuth } from "@/lib/auth-context";
import { showToast } from "@/lib/toast";
import { enqueueFavoriteOnLogin } from "@/lib/post-login-action";
import {
  ensureFavoritesLoaded,
  isFavorited as isFavoritedCache,
  setFavoritedLocal,
  subscribeFavorites,
} from "@/lib/favorites-cache";
import api from "@/lib/api";

// Decorative footer hint for the producer's preferred contact channel.
// The list DTO doesn't carry phone/website so a link would often dead-
// end; the icon is a signal, the card itself is the tap target.
const METHOD_ICON = {
  whatsapp: WhatsappLogo,
  phone: Phone,
  website: Globe,
  email: EnvelopeSimple,
};

// MEH-473: METHOD_LABEL maps to translation keys so the labels resolve
// per locale. The brand string "WhatsApp" stays as a constant (Q6 brand
// convention from MEH-471). Resolved at render time via t().
const METHOD_LABEL_KEY = {
  whatsapp: null, // literal "WhatsApp"
  phone: "producer.card.contact.phone",
  website: "producer.card.contact.website",
  email: "producer.card.contact.email",
};

// MEH-291 Phase 3 — badge color per the 4-state Decision tree.
// accepting_orders → no dot, available_today → green, full_this_week → orange,
// on_vacation → accent-warm. Read source switched from is_available_today +
// availability_status to the unified availability_state. The legacy fields
// stay populated by Phase 2's dual-write during the 7-day overlap, so the
// fallback chain handles any race where the API hasn't caught up yet.
function availabilityDotColor(producer) {
  const state = producer.availability_state;
  if (state === "on_vacation") return "#EF9F27"; // accent-warm
  if (state === "full_this_week") return "#f97316"; // orange
  if (state === "available_today") return "#4cb08b"; // secondary (green)
  if (state === "accepting_orders") return null;
  // Fallback during overlap if availability_state is missing on a stale row.
  if (producer.availability_status === "vacation") return "#EF9F27";
  if (producer.is_available_today) return "#4cb08b";
  return null;
}

/**
 * Card-level heart. Distinct from <FavoriteButton> (producer detail):
 *   - No fetch on mount (reads from favorites-cache hydrated once).
 *   - Logged-out guests get optimistic local fill + snackbar-with-link
 *     via showToast({ action }), not a login modal.
 *   - Hidden when the viewer owns this producer (own-card edge case).
 */
function CardHeart({ producer, onCountChange }) {
  const t = useTranslations();
  const { user } = useAuth();
  const [favorited, setFavorited] = useState(false);
  // Independent "guest tapped" state — preserves visual feedback across
  // remounts even though the cache doesn't persist guest intent.
  const [guestSaved, setGuestSaved] = useState(false);

  // Hydrate from the module cache. Re-renders on any favorite change.
  useEffect(() => {
    if (!user) return;
    // Clear guest-tap state on login so filled = favorited, not guestSaved.
    // Without this, a guest who tapped hearts then logged in would see
    // filled hearts where toggle computes next = !favorited (false) → POST
    // instead of DELETE, making the heart appear permanently stuck.
    setGuestSaved(false);
    let alive = true;
    ensureFavoritesLoaded().then(() => {
      if (alive) setFavorited(isFavoritedCache(producer.id));
    });
    const unsub = subscribeFavorites(() => {
      if (alive) setFavorited(isFavoritedCache(producer.id));
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [user, producer.id]);

  // Hide on the viewer's own producer card.
  if (user && user.producer_id === producer.id) return null;

  const filled = favorited || guestSaved;

  const toggle = async (e) => {
    // Don't let the button propagate into the card's Link / onClick.
    e.stopPropagation();
    e.preventDefault();

    if (!user) {
      if (guestSaved) return; // one-shot for guests per session
      setGuestSaved(true);
      enqueueFavoriteOnLogin(producer.id);
      const nextPath =
        typeof window !== "undefined"
          ? window.location.pathname + window.location.search
          : "/";
      showToast(
        t("producer.card.favorites.saved_login_prompt"),
        "info",
        5000,
        {
          action: {
            label: t("producer.card.favorites.login_cta"),
            href: `/login?next=${encodeURIComponent(nextPath)}`,
          },
        },
      );
      return;
    }

    // Optimistic fill + count update; revert on error.
    const next = !favorited;
    setFavorited(next);
    setFavoritedLocal(producer.id, next);
    onCountChange?.(next ? 1 : -1);
    try {
      if (next) {
        await api.post(`/users/me/favorites/${producer.id}`);
      } else {
        await api.delete(`/users/me/favorites/${producer.id}`);
      }
    } catch (err) {
      // 404 on DELETE means the record was already gone (stale cache /
      // removed from another device) — desired state achieved (heart already
      // unfilled). But the user wasn't in the server count, so revert the
      // optimistic -1 we applied; don't revert the heart UI itself.
      if (!next && err?.response?.status === 404) {
        onCountChange?.(1);
        return;
      }
      setFavorited(!next);
      setFavoritedLocal(producer.id, !next);
      onCountChange?.(next ? -1 : 1);
      showToast(t("producer.card.favorites.error"), "error");
    }
  };

  const label = filled ? t("producer.card.favorites.remove") : t("producer.card.favorites.add");
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      aria-pressed={filled}
      title={label}
      data-testid="card-heart"
      className="absolute top-3 start-3 z-10 w-11 h-11 bg-white/95 hover:bg-white rounded-full flex items-center justify-center shadow-md transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <HeartStraight
        size={22}
        weight={filled ? "fill" : "regular"}
        className={filled ? "text-primary" : "text-site-text"}
        aria-hidden="true"
      />
    </button>
  );
}

export default function ProducerCard({ producer, active, onClick, referrer, fridayMode = false, highlightQuery = null }) {
  const t = useTranslations();
  const router = useRouter();
  const [localFavCount, setLocalFavCount] = useState(producer.favorites_count ?? 0);
  // Keep in sync when the parent re-fetches the list (filter/pagination).
  useEffect(() => {
    setLocalFavCount(producer.favorites_count ?? 0);
  }, [producer.favorites_count]);
  const imgSrc = optimizeCloudinary(producer.images?.[0], { aspectRatio: "4:3" });

  const baseHref = producer.slug ? `/${producer.slug}` : `/producer/${producer.id}`;
  const producerHref = referrer ? `${baseHref}?from=${referrer}` : baseHref;

  const priceLabel = producer.price_range || producer.starting_price_label;

  const userLoc = useUserLocation();
  const distanceLabel =
    userLoc && producer.lat != null && producer.lng != null
      ? formatDistance(
          haversineKm(userLoc.lat, userLoc.lng, producer.lat, producer.lng),
        )
      : null;

  const hasRating =
    typeof producer.reviews_count === "number" &&
    producer.reviews_count >= 3 &&
    producer.avg_rating != null &&
    Number.isFinite(Number(producer.avg_rating)) &&
    Number(producer.avg_rating) > 0;

  const rawDescription =
    (producer.short_description || producer.top_product_name || "").trim();
  const descriptionText =
    rawDescription.length > 80
      ? rawDescription.slice(0, 80).trimEnd() + "…"
      : rawDescription;

  const dotColor = availabilityDotColor(producer);
  const primaryMethod = getPrimaryMethod(producer);
  const MethodIcon = METHOD_ICON[primaryMethod];

  const handleRootClick = (e) => {
    if (e.target.closest("a, button")) return;
    if (onClick) {
      onClick(producer);
    } else {
      router.push(producerHref);
    }
  };

  return (
    <article
      onClick={handleRootClick}
      data-testid="producer-card"
      className={[
        "bg-background overflow-hidden border transition flex flex-col rounded-2xl",
        "hover:shadow-[0_8px_32px_rgba(46,104,83,0.12)] hover:-translate-y-0.5",
        active ? "border-primary ring-2 ring-primary" : "border-border",
        onClick ? "cursor-pointer" : "",
      ].join(" ")}
    >
      <div className="relative">
        <Link href={producerHref} className="block">
          <div className="relative w-full aspect-square lg:aspect-[4/3] overflow-hidden rounded-t-2xl bg-background">
            {imgSrc ? (
              <Image
                src={imgSrc}
                alt={producer.name}
                fill
                className="object-cover object-center transition duration-300 hover:scale-105"
                sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
              />
            ) : (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center bg-light px-2"
                aria-label={t("producer.card.aria.image_missing", { name: producer.name })}
              >
                <span className="text-5xl leading-none" aria-hidden="true">
                  {producer.categories?.[0]?.emoji || "🌿"}
                </span>
                {producer.categories?.[0]?.name && (
                  <span className="font-headline text-sm font-bold text-primary mt-2 opacity-80 w-full text-center truncate">
                    {producer.categories[0].name}
                  </span>
                )}
              </div>
            )}
          </div>
        </Link>
        <CardHeart producer={producer} onCountChange={(delta) => setLocalFavCount((c) => Math.max(0, c + delta))} />
      </div>

      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-baseline gap-2 justify-between">
          <Link href={producerHref} className="block flex-1 min-w-0">
            <h3 className="font-headline font-bold text-[18px] text-site-text hover:text-primary transition leading-snug line-clamp-2">
              {highlightQuery
                ? highlightMatch(producer.name, highlightQuery)
                : producer.name}
            </h3>
          </Link>
          {hasRating && (
            <span
              className="text-sm text-site-text/80 shrink-0 whitespace-nowrap"
              dir="ltr"
              data-testid="card-rating"
            >
              ★ {Number(producer.avg_rating).toFixed(1)} · {producer.reviews_count}
            </span>
          )}
        </div>

        <p
          className="text-[13px] text-site-muted mt-1 truncate flex items-center gap-1.5"
          data-testid="location-line"
        >
          {dotColor && (
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: dotColor }}
              data-testid="availability-dot"
              data-status={
                producer.availability_state ||
                (producer.availability_status === "vacation"
                  ? "on_vacation"
                  : producer.is_available_today
                    ? "available_today"
                    : "accepting_orders")
              }
              aria-hidden="true"
            />
          )}
          <span className="truncate">
            {producer.city}
            {distanceLabel && (
              <>
                {" · "}
                <span dir="ltr" data-testid="distance-pill">
                  {distanceLabel}
                </span>
              </>
            )}
          </span>
        </p>

        {descriptionText && (
          <p
            className="text-sm text-site-text/85 mt-1.5 line-clamp-1"
            data-testid="card-description"
          >
            {descriptionText}
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <BadgeRow producer={producer} limit={2} />
          {(producer.trust_tier ?? 1) >= 3 && (
            <TrustBadge tier={producer.trust_tier} compact />
          )}
          {/* MEH-213: delivery-only badge — shown when no physical storefront */}
          {producer.has_physical_location === false && producer.offers_delivery && (
            <span className="inline-flex items-center rounded-full bg-light border border-border text-site-text px-2 py-0.5 text-[11px]">
              {t("producer.card.badges.delivery_only")}
            </span>
          )}
          {fridayMode && producer.is_available_today && (
            <span className="inline-flex items-center rounded-full bg-secondary/10 border border-secondary/30 text-secondary px-2 py-0.5 text-[11px] font-semibold">
              {t("producer.card.badges.available_today")}
            </span>
          )}
        </div>

        {localFavCount >= 5 && (
          <p className="mt-1 flex items-center gap-1 text-[12px] text-site-muted">
            <Heart size={14} weight="fill" style={{ color: "#A32D2D" }} aria-hidden="true" />
            {t("producer.card.favorites_count_short", { count: localFavCount })}
          </p>
        )}

        <div className="mt-auto pt-3 flex items-center justify-between gap-2">
          {priceLabel ? (
            <span className="font-body font-semibold text-accent text-sm truncate max-w-[120px]">
              {priceLabel}
            </span>
          ) : (
            <span />
          )}
          {MethodIcon && (
            <span
              className="inline-flex items-center text-primary shrink-0"
              aria-label={t("producer.card.aria.primary_contact", { method: METHOD_LABEL_KEY[primaryMethod] ? t(METHOD_LABEL_KEY[primaryMethod]) : "WhatsApp" })}
              data-testid="primary-method-hint"
              data-method={primaryMethod}
            >
              <MethodIcon size={18} weight="duotone" aria-hidden="true" />
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
