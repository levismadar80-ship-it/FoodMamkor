"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import Image from "next/image";
import {
  HeartStraight,
  Leaf,
  WhatsappLogo,
  Phone,
  Globe,
  EnvelopeSimple,
  Star,
} from "@phosphor-icons/react";
import BadgeRow from "./BadgeRow";
import TrustBadge from "./TrustBadge";
import { optimizeCloudinary } from "@/lib/cloudinary";
import { highlightMatch } from "@/lib/highlightMatch";
import { useUserLocation } from "@/lib/user-location";
import { haversineKm, formatDistance } from "@/lib/distance";
import { getPrimaryMethod } from "@/lib/contact-method";
import { badgeCount } from "@/lib/badges";
import { useAuth } from "@/lib/auth-context";
import { showToast } from "@/lib/toast";
import { BRAND_NAME } from "@/lib/constants";
import { enqueueFavoriteOnLogin } from "@/lib/post-login-action";
import {
  ensureFavoritesLoaded,
  isFavorited as isFavoritedCache,
  setFavoritedLocal,
  subscribeFavorites,
} from "@/lib/favorites-cache";
import api from "@/lib/api";

// Decorative footer hint for the producer's preferred contact channel.
const METHOD_ICON = {
  whatsapp: WhatsappLogo,
  phone: Phone,
  website: Globe,
  email: EnvelopeSimple,
};

// MEH-473: METHOD_LABEL maps to translation keys so the labels resolve per locale.
const METHOD_LABEL_KEY = {
  whatsapp: null, // literal "WhatsApp"
  phone: "producer.card.contact.phone",
  website: "producer.card.contact.website",
  email: "producer.card.contact.email",
};

// MEH-643 (Assembly v2): availability dot is fully tokenized — no raw hex.
// available_today → primary (brand green); on_vacation / full_this_week →
// fg-muted (recedes, no separate status color); accepting_orders → no dot.
// Continues the MEH-717 line (eliminated the multi-color status palette);
// v4 routes non-available states through fg-muted. Returns a token class.
function availabilityDot(producer) {
  const status =
    producer.availability_state ||
    (producer.availability_status === "vacation"
      ? "on_vacation"
      : producer.is_available_today
        ? "available_today"
        : "accepting_orders");
  let cls = null;
  if (status === "available_today") cls = "bg-primary";
  else if (status === "on_vacation" || status === "full_this_week") cls = "bg-fg-muted";
  return { cls, status };
}

/**
 * Card-level heart. Distinct from <FavoriteButton> (producer detail):
 *   - No fetch on mount (reads from favorites-cache hydrated once).
 *   - Logged-out guests get optimistic local fill + snackbar-with-link.
 *   - Hidden when the viewer owns this producer.
 * MEH-643: green ink (NEVER red, MEH-636) — outline default, green fill saved.
 */
function CardHeart({ producer, onCountChange }) {
  const t = useTranslations();
  const { user } = useAuth();
  const [favorited, setFavorited] = useState(false);
  const [guestSaved, setGuestSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    // MEH-730 (restored from pre-v4): clear the guest-saved flag the moment a
    // user logs in — otherwise a heart saved as guest stays visually stuck
    // "on" even when the account's real favorites say otherwise.
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

  if (user && user.producer_id === producer.id) return null;

  const filled = favorited || guestSaved;

  const toggle = async (e) => {
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
      showToast.info(t("producer.card.favorites.saved_login_prompt"), {
        duration: 5000,
        action: {
          label: t("producer.card.favorites.login_cta"),
          href: `/login?redirect=${encodeURIComponent(nextPath)}`,
        },
      });
      return;
    }

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
      // MEH-730 (restored from pre-v4): 404 on DELETE means the favorite was
      // already gone server-side — keep the heart un-filled and only revert
      // the optimistic count decrement; a full state revert would re-fill
      // the heart for a favorite that doesn't exist.
      if (!next && err?.response?.status === 404) {
        onCountChange?.(1);
        return;
      }
      setFavorited(!next);
      setFavoritedLocal(producer.id, !next);
      onCountChange?.(next ? -1 : 1);
      showToast.error(t("error.generic"));
    }
  };

  // MEH-643/MEH-472: single gerund aria "שמירה" (matches the "טעינה" pattern).
  // MEH-991 (CARD-05): cream circle per Populated frame; 44px box kept (touch-target floor >= design 40px).
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t("producer.card.favorites.aria")}
      aria-pressed={filled}
      title={t("producer.card.favorites.aria")}
      data-testid="card-heart"
      className="absolute top-3 start-3 z-10 w-11 h-11 bg-background/90 hover:bg-background rounded-full flex items-center justify-center transition-colors duration-base ease-quart focus-ring"
    >
      {/* Green ink, never red (MEH-636): outline default, green fill when saved. */}
      <HeartStraight
        size={22}
        weight={filled ? "fill" : "regular"}
        className="text-primary"
        aria-hidden="true"
      />
    </button>
  );
}

export default function ProducerCard({ producer, active, onClick, referrer, fridayMode = false, highlightQuery = null }) {
  const t = useTranslations();
  const router = useRouter();
  const [localFavCount, setLocalFavCount] = useState(producer.favorites_count ?? 0);
  useEffect(() => {
    setLocalFavCount(producer.favorites_count ?? 0);
  }, [producer.favorites_count]);
  const imgSrc = optimizeCloudinary(producer.images?.[0], { aspectRatio: "4:3" });

  const baseHref = producer.slug ? `/${producer.slug}` : `/producer/${producer.id}`;
  const producerHref = referrer ? `${baseHref}?from=${referrer}` : baseHref;

  const priceLabel = producer.price_range || producer.starting_price_label;
  const category = producer.categories?.[0]?.name;

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

  const { cls: dotClass, status: dotStatus } = availabilityDot(producer);
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
        // MEH-643 (Assembly v2): flat surface-card, 1px border, sharp corners,
        // NO shadow-lift on hover — hover = border color shift only.
        // MEH-991 (CARD-22): pressed feedback per v4 spec — opacity .95 + scale .98.
        "bg-surface-card overflow-hidden border flex flex-col rounded-none group transition-colors duration-base ease-quart active:opacity-95 active:scale-[0.98]",
        active ? "border-primary ring-2 ring-primary" : "border-border hover:border-primary",
        onClick ? "cursor-pointer" : "",
      ].join(" ")}
    >
      <div className="relative">
        {/* MEH-991 (CARD-23): inset ring — the card's overflow-hidden clips the
            outward .focus-ring box-shadow on this edge-flush link (ImageGallery.jsx:100 idiom). */}
        <Link
          href={producerHref}
          className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
        >
          <div className="relative w-full aspect-square lg:aspect-[4/3] overflow-hidden bg-background">
            {imgSrc ? (
              <Image
                src={imgSrc}
                alt={producer.name}
                fill
                className="object-cover object-center transition-transform duration-300 ease-quart group-hover:scale-[1.02]"
                sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
              />
            ) : (
              // MEH-643: canonical no-photo state — cream surface + leaf glyph + brand name.
              <div
                className="absolute inset-0 flex flex-col items-center justify-center bg-background gap-2"
                aria-label={t("producer.card.aria.image_missing", { name: producer.name })}
              >
                <Leaf size={60} weight="light" className="text-primary/[0.32]" data-testid="leaf-icon" aria-hidden="true" />
                <span className="font-headline-md text-base font-bold text-primary/50">
                  {BRAND_NAME}
                </span>
              </div>
            )}
          </div>
        </Link>

        {/* Badge row — bottom-start over the image (Assembly v2), max 2.
            MEH-76 chunk 4 (S12 §04-B): list density — verified renders the
            icon-only seal; declared shows nothing (no placeholder). */}
        <div className="absolute bottom-3 start-3 z-[2] flex flex-wrap items-center gap-1.5">
          <BadgeRow producer={producer} limit={2} surface="card" />
          {badgeCount(producer) > 2 && (
            // MEH-991 (CARD-09): v4 LOCK — third badge collapses to +N.
            <span
              className="inline-flex items-center rounded-full bg-surface-card/95 border border-border text-fg-muted px-1.5 py-0.5 text-[11px] font-medium"
              data-testid="badge-overflow"
              dir="ltr"
            >
              +{badgeCount(producer) - 2}
            </span>
          )}
          {(producer.trust_tier ?? 1) >= 3 && (
            <TrustBadge tier={producer.trust_tier} compact />
          )}
          {producer.has_physical_location === false && producer.offers_delivery && (
            <span className="inline-flex items-center rounded-full bg-surface-card border border-border text-text px-2 py-0.5 text-[11px]">
              {t("producer.card.badges.delivery_only")}
            </span>
          )}
        </div>

        <CardHeart producer={producer} onCountChange={(delta) => setLocalFavCount((c) => Math.max(0, c + delta))} />
      </div>

      <div className="p-4 flex flex-col gap-2">
        {/* Eyebrow = CATEGORY (uppercase, tracked) — Assembly v2. */}
        {category && (
          <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-fg-muted truncate">
            {category}
          </p>
        )}

        <div className="grid grid-cols-[1fr_auto] gap-3 items-baseline">
          <Link href={producerHref} className="block min-w-0 focus-ring">
            <h3 className="font-headline-md font-bold text-[20px] text-text group-hover:text-primary transition-colors duration-base ease-quart leading-snug line-clamp-2">
              {highlightQuery
                ? highlightMatch(producer.name, highlightQuery)
                : producer.name}
            </h3>
          </Link>
          {hasRating && (
            <span
              className="text-[13px] text-fg-muted shrink-0 whitespace-nowrap"
              dir="ltr"
              data-testid="card-rating"
            >
              <Star size={13} weight="fill" className="text-accent inline align-[-1px]" aria-hidden="true" /> {Number(producer.avg_rating).toFixed(1)} · {producer.reviews_count}
            </span>
          )}
        </div>

        <p
          className="text-[13px] text-fg-muted truncate flex items-center gap-1.5"
          data-testid="location-line"
        >
          {dotClass && (
            <span
              className={`inline-block w-2 h-2 rounded-full shrink-0 ${dotClass}`}
              data-testid="availability-dot"
              data-status={dotStatus}
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
            className="text-sm text-text/85 line-clamp-1"
            data-testid="card-description"
          >
            {descriptionText}
          </p>
        )}

        {fridayMode && producer.is_available_today && (
          <span className="inline-flex w-fit items-center rounded-full bg-primary/10 border border-primary/30 text-primary px-2 py-0.5 text-[11px] font-semibold">
            {t("producer.card.badges.available_today")}
          </span>
        )}

        {localFavCount >= 5 && (
          <p className="flex items-center gap-1 text-[12px] text-fg-muted">
            {/* MEH-643/MEH-636: count heart recedes to fg-muted — never red. */}
            <HeartStraight size={14} weight="fill" className="text-fg-muted" aria-hidden="true" />
            {t("producer.card.favorites_count_short", { count: localFavCount })}
          </p>
        )}

        <div className="mt-auto pt-3 flex items-center justify-between gap-2">
          {priceLabel ? (
            // MEH-1031 (A6): bidi-isolate the price (number+unit+currency)
            // so it can't flip inside RTL — mirrors the ProducerCard.jsx:345
            // distance-pill and ProducerCard.jsx:320 rating idiom (the only
            // prior unwrapped numeric span).
            <span
              className="font-body-md font-semibold text-accent text-sm truncate max-w-[120px]"
              dir="ltr"
            >
              {priceLabel}
            </span>
          ) : (
            <span />
          )}
          {MethodIcon && (
            <span
              role="img"
              className="inline-flex items-center text-primary shrink-0"
              aria-label={t("producer.card.aria.primary_contact", { method: METHOD_LABEL_KEY[primaryMethod] ? t(METHOD_LABEL_KEY[primaryMethod]) : "WhatsApp" })}
              data-testid="primary-method-hint"
              data-method={primaryMethod}
            >
              <MethodIcon size={18} aria-hidden="true" />
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
