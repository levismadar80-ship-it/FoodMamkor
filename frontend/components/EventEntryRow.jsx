"use client";

/**
 * EventEntryRow — the date-rail row for one event or experience (MEH-134
 * "The Almanac"). One owner for that look: /events, /experiences and the home
 * «אירועים קרובים» preview all render through it.
 *
 * MEH-2497: lifted out of EventsClient so the home preview stops drawing its
 * own card. That card always reserved a fixed image area and filled it with a
 * leaf placeholder when the event had no photo (every event, at the time) —
 * the opposite of what MEH-2468 decided here: a thumbnail only when a photo
 * exists, never an empty box. The link is next-intl's, so /en keeps its
 * prefix (next/link dropped it under localePrefix: as-needed).
 */

import { useLocale } from "next-intl";
import {
  Basket,
  CalendarBlank,
  CookingPot,
  Drop,
  MapTrifold,
  Path,
  Plant,
  Storefront,
} from "@phosphor-icons/react";
import { Link } from "@/i18n/navigation";
import { optimizeCloudinary } from "@/lib/cloudinary";
import { formatEventDate } from "@/lib/format-date";
import { formatTimeRange } from "@/lib/time-range";
// MEH-1140: canonical shekel format ("35₪") — one owner in lib/utils.
import { formatPrice } from "@/lib/utils";

// Category glyph per wire value (Phosphor only — ADR-013). Falls back to
// CalendarBlank for any unmapped/free-text category.
const CATEGORY_ICON = {
  "סדנה": CookingPot,
  "סיור": Path,
  "שוק": Storefront,
  "קטיף": Basket,
  "טעימות": Drop,
  "בישול": CookingPot,
  "תזונה": Plant,
  "סיור אוכל": MapTrifold,
  "חקלאות": Plant,
};

// MEH-2547: toEventEntry lives in lib/event-entry.js (no "use client") so the
// server-rendered organizer page can build rows too; re-exported for the
// existing client callers.
export { toEventEntry } from "@/lib/event-entry";

// A quoted, escaped CSS url() — the picture can be an owner-supplied URL, and
// a `)`, quote or space in it must not end the declaration (review #3811).
const cssUrl = (src) => `url(${JSON.stringify(String(src))})`;

// The date-rail row — the page's signature gesture. Date leads (Frank
// Ruhl day numeral on a colored tick down the start edge); Latin
// numerals (time, price) are Cormorant italic, Hebrew stays upright.
export default function EventEntryRow({ entry, freeLabel, compact = false }) {
  const locale = useLocale();
  const isExp = entry.accent === "gold";
  const Icon = CATEGORY_ICON[entry.category] ?? CalendarBlank;
  const accentText = isExp ? "text-accent" : "text-primary";
  const tickBg = isExp ? "bg-accent" : "bg-primary";
  // MEH-2069: bg-accent/10 on the page background (cream, #f5f0e8) computed
  // 4.07:1 — AA fail for text-xs (12px). Same usage-level fix already applied
  // twice (MEH-2025/#2825, MEH-2032/#2909): solid bg-surface-card gets
  // text-accent to 5.19:1.
  const catChip = isExp ? "bg-surface-card text-accent" : "bg-green-50 text-primary";
  const day = formatEventDate(entry.date, locale, { day: "2-digit" });
  const weekday = formatEventDate(entry.date, locale, { weekday: "long" });
  const month = formatEventDate(entry.date, locale, { month: "long" });
  // MEH-2469: «09:30–15:00» when the event has an end time.
  const time = formatTimeRange(entry.time, entry.endTime);
  const meta = [entry.who, entry.city, entry.schedule].filter(Boolean).join(" · ");
  const isFree = !(entry.price > 0);

  // MEH-2546: every row has a picture — the event photo, else the owner's
  // photo (with the owner's initial on it, so it doesn't read as the event's
  // own), else a category tile. Never an empty box, never a stock photo.
  // `compact` (home preview, ~400px rows 3-up from lg): the picture moves to a
  // band across the top of the row there instead of being dropped.
  const picture = entry.image || entry.ownerImage;
  const cols = compact
    ? "grid-cols-[64px_1fr_auto] md:grid-cols-[104px_1fr_auto] lg:grid-cols-[104px_1fr]"
    : "grid-cols-[64px_1fr_auto] md:grid-cols-[104px_1fr_auto]";
  const thumbBg = picture
    ? { backgroundImage: cssUrl(optimizeCloudinary(picture, { aspectRatio: "1:1", width: 224 })) }
    : undefined;
  const tileTone = isExp ? "bg-surface-card text-accent" : "bg-green-50 text-primary";
  const pictureFace = picture ? (
    entry.image || !entry.ownerInitial ? null : (
      <span
        data-testid="event-row-owner-initial"
        className="absolute bottom-1 end-1 w-5 h-5 rounded-full bg-white text-primary text-[10px] font-bold grid place-items-center shadow-sm"
      >
        {entry.ownerInitial}
      </span>
    )
  ) : (
    <Icon size={26} weight="duotone" />
  );

  return (
    <Link
      href={entry.href}
      className={`relative grid ${cols} border-b border-border transition hover:bg-surface-card`}
    >
      {/* species tick — start edge, full height */}
      <span aria-hidden="true" className={`absolute start-0 inset-y-0 w-[3px] ${tickBg}`} />
      {/* date rail */}
      <div className="py-4 md:py-5 grid justify-items-center content-start gap-0.5">
        <span className="font-headline-display font-black text-3xl md:text-5xl leading-none text-text numeric">
          {day}
        </span>
        <span className="text-xs font-semibold text-fg-muted mt-1">{weekday}</span>
        <span className="text-[10px] text-fg-muted">{month}</span>
        {time && (
          <span dir="ltr" className={`font-english italic text-sm mt-1 numeric ${accentText}`}>
            {time}
          </span>
        )}
      </div>
      {/* body */}
      <div className="py-4 md:py-5 ps-3 pe-4 min-w-0">
        {/* MEH-858 F5: category eyebrow removed — it duplicated the pill chip
            below (and uppercase tracking was a no-op on Hebrew). The glyph now
            leads the chip, so the category shows once, still with its icon. */}
        <h3 className="font-headline-md text-lg md:text-2xl font-bold text-text leading-snug">
          {entry.title}
        </h3>
        {/* MEH-2476: line-clamp — a long recurring schedule must not stack
            several lines into a 375px row. */}
        {meta && <p className="text-sm text-fg-muted mt-1 line-clamp-2">{meta}</p>}
        {entry.description && (
          <p className="text-sm text-text/85 line-clamp-2 mt-2 leading-relaxed">{entry.description}</p>
        )}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {entry.category && (
            <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full ${catChip}`}>
              <Icon size={12} weight="bold" aria-hidden="true" />
              {entry.category}
            </span>
          )}
          {isFree ? (
            <span className={`ms-auto text-sm font-semibold ${accentText}`}>{freeLabel}</span>
          ) : (
            <span dir="ltr" className={`ms-auto font-english italic font-semibold numeric ${accentText}`}>
              {formatPrice(entry.price)}
            </span>
          )}
        </div>
      </div>
      {/* Decorative: the row is a link already named by its title. */}
      <div
        aria-hidden="true"
        data-testid="event-row-image"
        data-kind={entry.image ? "event" : entry.ownerImage ? "owner" : "category"}
        className={`relative overflow-hidden my-4 md:my-5 me-4 w-20 h-20 md:w-28 md:h-28 rounded-[10px] bg-cover bg-center grid place-items-center ${picture ? "bg-border" : tileTone}${compact ? " lg:hidden" : ""}`}
        style={thumbBg}
      >
        {pictureFace}
      </div>
      {compact && (
        <div
          aria-hidden="true"
          data-testid="event-row-band"
          className={`hidden lg:grid order-first col-span-full h-28 bg-cover bg-center place-items-center relative ${picture ? "bg-border" : tileTone}`}
          style={
            picture
              ? { backgroundImage: cssUrl(optimizeCloudinary(picture, { aspectRatio: "16:9", width: 640 })) }
              : undefined
          }
        >
          {pictureFace}
        </div>
      )}
    </Link>
  );
}
