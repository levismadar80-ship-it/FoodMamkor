"use client";

import Link from "next/link";
import { Leaf } from "@phosphor-icons/react";
import { useTranslations, useLocale } from "next-intl";
import { formatEventDate } from "@/lib/format-date";
// MEH-1140: canonical shekel format ("35₪") — one owner in lib/utils.
import { formatPrice } from "@/lib/utils";
import { optimizeCloudinary } from "@/lib/cloudinary";
import { BRAND_NAME } from "@/lib/constants";

/**
 * Card for an experience (community workshop). Rendered by the
 * /experiences grid (ExperiencesClient) — the sole consumer (MEH-863:
 * the prior "/events" + "/experiences/mine" entries were stale; those
 * surfaces no longer import this component).
 *
 * Reuses the visual language of the EventCard inline in EventsClient.jsx
 * so experiences and producer events feel consistent. Deliberately does
 * NOT show status badges — the public grid only ever lists approved
 * experiences.
 */

function formatTime(t) {
  if (!t) return "";
  return t.slice(0, 5);
}

export default function ExperienceCard({ experience: ex }) {
  const t = useTranslations("experiences.card");
  const locale = useLocale();

  // MEH-1140: free semantics stay here; numeric formatting is lib/utils canon.
  const priceDisplay = (p) => {
    if (p == null || Number(p) === 0) return t("free");
    return <span dir="ltr">{formatPrice(p)}</span>;
  };

  const spotsBadge =
    ex.spots_left != null && ex.spots_left > 0 && ex.spots_left <= 5
      ? t("spots_left", { n: ex.spots_left })
      : ex.spots_left === 0
      ? t("sold_out")
      : null;

  return (
    <Link
      href={`/experiences/${ex.id}`}
      // MEH-1143 (Assembly v2): flat surface-card, 1px border, sharp corners,
      // NO shadow-lift — hover = border color shift only. Mirrors RecipeCard:42.
      // focus-visible ring matches UpcomingEventsPreview (cross-surface a11y parity).
      className="bg-surface-card border border-border rounded-none overflow-hidden transition-colors duration-base ease-quart hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 flex flex-col"
    >
      {ex.image_url ? (
        <div className="relative">
          {/* MEH-863 F7: route the (possibly user-submitted) image through the
              Cloudinary helper for f_auto,q_auto + width cap; non-Cloudinary
              URLs pass through unchanged. F8: role+aria-label so the
              CSS-background image is announced to assistive tech. */}
          <div
            className="h-44 bg-cover bg-center"
            style={{ backgroundImage: `url(${optimizeCloudinary(ex.image_url, { width: 800 })})` }}
            role="img"
            aria-label={ex.title}
          />
          {spotsBadge && (
            <span
              className={`absolute top-3 end-3 text-xs px-2 py-1 rounded-full ${
                ex.spots_left === 0
                  ? "bg-text/80 text-white"
                  : "bg-accent text-white"
              }`}
            >
              {spotsBadge}
            </span>
          )}
        </div>
      ) : (
        <div
          className="h-44 flex flex-col items-center justify-center bg-background gap-2"
          data-testid="experience-image-missing"
        >
          {/* MEH-1143: canonical no-photo state — cream surface + Leaf glyph +
              brand name (replaces the MEH-862 CookingPot; default per issue note,
              cross-surface consistency with ProducerCard/RecipeCard). */}
          <Leaf size={40} weight="light" className="text-primary/70" aria-hidden="true" />
          <span className="font-headline-md text-sm font-bold text-primary/80">
            {BRAND_NAME}
          </span>
        </div>
      )}
      <div className="p-4 flex-1 flex flex-col">
        <p className="text-primary text-sm font-semibold mb-1">
          {formatEventDate(ex.event_date, locale)}
          {ex.event_time && ` · ${formatTime(ex.event_time)}`}
        </p>
        {/* MEH-863 F2: h2 (not h3) — card titles sit directly under the page
            h1 with no h2 between, and this matches GroupBuyCard's level. */}
        <h2 className="font-headline-md text-xl font-bold text-text mb-1">
          {ex.title}
        </h2>
        <p className="text-sm text-fg-muted mb-2">
          {ex.host?.name || t("host_fallback")}
          {ex.city ? ` · ${ex.city}` : ""}
        </p>
        {ex.description && (
          <p className="text-sm text-text/85 line-clamp-2 mb-3">
            {ex.description}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between pt-3 border-t border-border">
          {ex.category && (
            <span className="bg-green-50 text-primary text-xs px-2 py-1 rounded-full">
              {ex.category}
            </span>
          )}
          <span className="text-accent font-semibold text-sm">
            {priceDisplay(ex.price_per_person)}
          </span>
        </div>
      </div>
    </Link>
  );
}
