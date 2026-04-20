"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  HeartStraight,
  WhatsappLogo,
  Phone,
  Globe,
  EnvelopeSimple,
} from "@phosphor-icons/react";
import BadgeRow from "./BadgeRow";
import TrustBadge from "./TrustBadge";
import { optimizeCloudinary } from "@/lib/cloudinary";
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

function producerInitials(name) {
  return (name || "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("")
    .slice(0, 2);
}

// Decorative footer hint for the producer's preferred contact channel.
// The list DTO doesn't carry phone/website so a link would often dead-
// end; the icon is a signal, the card itself is the tap target.
const METHOD_ICON = {
  whatsapp: WhatsappLogo,
  phone: Phone,
  website: Globe,
  email: EnvelopeSimple,
};

const METHOD_LABEL = {
  whatsapp: "WhatsApp",
  phone: "טלפון",
  website: "אתר",
  email: "אימייל",
};

// Availability dot colors — vacation wins over is_available_today.
function availabilityDotColor(producer) {
  if (producer.availability_status === "vacation") return "#EF9F27"; // accent-warm
  if (producer.is_available_today) return "#4cb08b"; // secondary (green)
  return null;
}

/**
 * Card-level heart. Distinct from <FavoriteButton> (producer detail):
 *   - No fetch on mount (reads from favorites-cache hydrated once).
 *   - Logged-out guests get optimistic local fill + snackbar-with-link
 *     via showToast({ action }), not a login modal.
 *   - Hidden when the viewer owns this producer (own-card edge case).
 */
function CardHeart({ producer }) {
  const { user } = useAuth();
  const [favorited, setFavorited] = useState(false);
  // Independent "guest tapped" state — preserves visual feedback across
  // remounts even though the cache doesn't persist guest intent.
  const [guestSaved, setGuestSaved] = useState(false);

  // Hydrate from the module cache. Re-renders on any favorite change.
  useEffect(() => {
    if (!user) return;
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
        "שמרתי — התחברי לראות את כל המועדפים שלך",
        "info",
        5000,
        {
          action: {
            label: "התחברי",
            href: `/login?next=${encodeURIComponent(nextPath)}`,
          },
        },
      );
      return;
    }

    // Optimistic fill; revert on error.
    const next = !favorited;
    setFavorited(next);
    setFavoritedLocal(producer.id, next);
    try {
      if (next) {
        await api.post(`/users/me/favorites/${producer.id}`);
      } else {
        await api.delete(`/users/me/favorites/${producer.id}`);
      }
    } catch {
      setFavorited(!next);
      setFavoritedLocal(producer.id, !next);
      showToast("משהו השתבש, נסי שוב", "error");
    }
  };

  const label = filled ? "הסר ממועדפים" : "הוסף למועדפים";
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
        className={filled ? "text-red-500" : "text-site-text"}
        aria-hidden="true"
      />
    </button>
  );
}

export default function ProducerCard({ producer, active, onClick, referrer }) {
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
    if (onClick) {
      if (e.target.closest("a, button")) return;
      onClick(producer);
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
                className="absolute inset-0 flex flex-col items-center justify-center bg-light"
                aria-label={`${producer.name} — תמונה חסרה`}
              >
                <span className="text-5xl leading-none" aria-hidden="true">
                  {producer.categories?.[0]?.emoji || "🌿"}
                </span>
                <span className="font-headline text-base font-bold text-primary mt-2 opacity-80">
                  {producerInitials(producer.name)}
                </span>
              </div>
            )}
          </div>
        </Link>
        <CardHeart producer={producer} />
      </div>

      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-baseline gap-2 justify-between">
          <Link href={producerHref} className="block flex-1 min-w-0">
            <h3 className="font-headline font-bold text-[18px] text-site-text hover:text-primary transition leading-snug line-clamp-2">
              {producer.name}
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
                producer.availability_status === "vacation"
                  ? "vacation"
                  : "available-today"
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
        </div>

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
              aria-label={`ערוץ קשר עיקרי: ${METHOD_LABEL[primaryMethod]}`}
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
