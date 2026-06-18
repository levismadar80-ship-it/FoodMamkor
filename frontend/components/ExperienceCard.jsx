"use client";

import Link from "next/link";
import { CookingPot } from "@phosphor-icons/react";
import { useTranslations, useLocale } from "next-intl";
import { formatEventDate } from "@/lib/format-date";

/**
 * Card for an experience (community workshop).
 * Shared between:
 *   - /experiences grid
 *   - /events (when the "חוויות" tab is active)
 *   - /experiences/mine (host's own submissions)
 *
 * Reuses the visual language of the existing EventCard inline in
 * EventsClient.jsx so the two feel consistent when rendered side by
 * side. Deliberately does NOT show status badges — approved is the
 * only state the public grid shows, and the owner's "mine" view uses
 * a dedicated status pill in its own client file.
 */

function formatTime(t) {
  if (!t) return "";
  return t.slice(0, 5);
}

export default function ExperienceCard({ experience: ex }) {
  const t = useTranslations("experiences.card");
  const locale = useLocale();

  const formatPrice = (p) => {
    if (p == null || Number(p) === 0) return t("free");
    return <span dir="ltr">{`₪${Number(p).toLocaleString("he-IL")}`}</span>;
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
      className="bg-background border border-border rounded-[16px] overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition flex flex-col"
    >
      {ex.image_url ? (
        <div className="relative">
          <div
            className="h-44 bg-cover bg-center"
            style={{ backgroundImage: `url(${ex.image_url})` }}
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
        <div className="h-44 bg-green-50 flex items-center justify-center">
          {/* MEH-862: Phosphor placeholder replaces the no-image emoji (LOCK v2).
              CookingPot mirrors EventsClient category icon for cooking/workshop. */}
          <CookingPot size={48} weight="duotone" className="text-primary/50" aria-hidden="true" />
        </div>
      )}
      <div className="p-4 flex-1 flex flex-col">
        <p className="text-primary text-sm font-semibold mb-1">
          {formatEventDate(ex.event_date, locale)}
          {ex.event_time && ` · ${formatTime(ex.event_time)}`}
        </p>
        <h3 className="font-headline-md text-xl font-bold text-text mb-1">
          {ex.title}
        </h3>
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
            {formatPrice(ex.price_per_person)}
          </span>
        </div>
      </div>
    </Link>
  );
}
