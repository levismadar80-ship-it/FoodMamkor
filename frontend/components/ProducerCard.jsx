"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import Image from "next/image";
import { HeartStraight, Leaf, Star, Truck } from "@phosphor-icons/react";
import BadgeRow, { resolveBadgeLabel } from "./BadgeRow";
import TrustBadge from "./TrustBadge";
import OfferBadge from "./OfferBadge";
import { optimizeCloudinary, IMAGE_RATIOS } from "@/lib/cloudinary";
import { highlightMatch } from "@/lib/highlightMatch";
import { useUserLocation } from "@/lib/user-location";
import { haversineKm, formatDistance } from "@/lib/distance";
import { allBadges, badgeCount } from "@/lib/badges";
import Popover from "@/components/ui/Popover";
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
  // MEH-991 (CARD-05): cream circle per Populated frame.
  // MEH-1028 (CARD-27): mobile density variant — 34px box + 8px inset on <640px;
  // desktop keeps the 44px touch-target box + 12px inset (sm: up). The mobile 34px
  // is below the 44px WCAG touch floor per the v4 design lock (deliberate trade-off).
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t("producer.card.favorites.aria")}
      aria-pressed={filled}
      title={t("producer.card.favorites.aria")}
      data-testid="card-heart"
      className="absolute top-2 start-2 sm:top-3 sm:start-3 z-10 w-[34px] h-[34px] sm:w-11 sm:h-11 bg-background/90 hover:bg-background rounded-full flex items-center justify-center transition-colors duration-base ease-quart focus-ring"
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
  // Same namespace BadgeRow.jsx and KashrutBadgeStrip.jsx:115 use, so the
  // overflow rows read the identical `kashrut.badges.*.label` strings the
  // visible pills and the detail page read.
  const tKashrut = useTranslations("kashrut");
  const router = useRouter();
  const [localFavCount, setLocalFavCount] = useState(producer.favorites_count ?? 0);
  // MEH-1592: collision boundary handed to the +N Popover — see the badge strip
  // below. The panel must clear the whole strip, not just the +N chip.
  const badgeStripRef = useRef(null);
  useEffect(() => {
    setLocalFavCount(producer.favorites_count ?? 0);
  }, [producer.favorites_count]);
  const imgSrc = optimizeCloudinary(producer.images?.[0], { aspectRatio: IMAGE_RATIOS.card });
  // MEH-1211: a present-but-dead image URL renders the browser broken-glyph +
  // overflowing alt. Track load failure and fall back to the canonical no-photo
  // placeholder below (the same else-branch used when imgSrc is absent).
  const [imgError, setImgError] = useState(false);
  useEffect(() => {
    setImgError(false);
  }, [imgSrc]);

  const baseHref = producer.slug ? `/${producer.slug}` : `/producer/${producer.id}`;
  const producerHref = referrer ? `${baseHref}?from=${referrer}` : baseHref;

  const category = producer.categories?.[0]?.name;

  const userLoc = useUserLocation();
  // MEH-1301: distance unit follows the active locale — Hebrew renders 'ק"מ'
  // (digits-first), English keeps the Latin "km". MEH-1307: no " ממך" tail.
  const locale = useLocale();
  const distanceLabel =
    userLoc && producer.lat != null && producer.lng != null
      ? formatDistance(
          haversineKm(userLoc.lat, userLoc.lng, producer.lat, producer.lng),
          { unit: locale === "he" ? "he" : "latin" },
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
        "bg-surface-card overflow-hidden border flex flex-col h-full rounded-none group transition-colors duration-base ease-quart active:opacity-95 active:scale-[0.98]",
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
            {imgSrc && !imgError ? (
              <Image
                src={imgSrc}
                alt={producer.name}
                fill
                className="object-cover object-center transition-transform duration-300 ease-quart group-hover:scale-[1.02]"
                sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                onError={() => setImgError(true)}
              />
            ) : (
              // MEH-643: canonical no-photo state — green-50 tile + leaf glyph + brand name.
              // MEH-1400: bg-background (cream) read as an empty hole on the cream page;
              // aligned to the MEH-1243 locked #EAF3DE (green-50) tile + 70% glyph precedent.
              <div
                className="absolute inset-0 flex flex-col items-center justify-center bg-green-50 gap-2"
                role="img"
                aria-label={t("producer.card.aria.image_missing", { name: producer.name })}
              >
                <Leaf size={60} weight="light" className="text-primary/70" data-testid="leaf-icon" aria-hidden="true" />
                <span className="font-headline-md text-base font-bold text-primary/80">
                  {BRAND_NAME}
                </span>
              </div>
            )}
          </div>
        </Link>

        {/* Badge row — bottom-start over the image (Assembly v2), max 2.
            MEH-76 chunk 4 (S12 §04-B): list density — verified renders the
            icon-only seal; declared shows nothing (no placeholder). */}
        {/* MEH-1547: the z-[2] that used to sit here was REMOVED. `z-index` on
            an absolutely-positioned element creates a stacking context, which
            trapped the +N Popover's mobile bottom sheet (z-[1210]) at level 2 —
            BottomNav (z-[1000], BottomNav.jsx:237) painted over it and the
            disclosed labels were unreadable (caught in self-QA, not by tests).
            The strip is a LATER sibling of the image <Link> in the same
            stacking context, so plain `absolute` already paints it above the
            photo — verified at 375px + 1440px, badges unchanged. z-index ledger:
            .claude/rules/rtl.md (sheet family 1200/1210 > BottomNav 1000). */}
        {/* MEH-1592: the strip is the +N popover's collision boundary — the
            panel is placed so it clears this whole box, which is what makes
            WRAPPED siblings safe too (at 4-col desktop widths the TrustBadge
            "מובילת קהילה" wraps onto a second line directly under the +N chip,
            which is the overlap Sapir's QA screenshot caught). */}
        <div
          ref={badgeStripRef}
          className="absolute bottom-3 start-3 flex flex-wrap items-center gap-1.5"
        >
          <BadgeRow producer={producer} limit={2} surface="card" avoidRef={badgeStripRef} />
          {badgeCount(producer) > 2 && (
            // MEH-991 (CARD-09): v4 LOCK — third badge collapses to +N.
            // MEH-1547: the +N counter becomes a Popover trigger listing the
            // HIDDEN badges (labels only) — it was the one dead element in an
            // otherwise tappable badge row. The v4 LOCK stays: still max 2
            // visible badges, this adds disclosure, not visible badges.
            // REUSES: components/BadgeRow.jsx:233 — Popover trigger pattern
            // (MEH-813 transparent hit-area button wrapping the visible pill;
            // Popover injects the toggle + the card-Link tap guard, and
            // handleRootClick above ignores button descendants anyway).
            // sheetOnMobile: an anchored panel cannot fit inside a 166px-wide
            // mobile grid card (article is overflow-hidden), so below lg it
            // presents as the MEH-1334 bottom sheet.
            // w-max (not a fixed w-40): the card's own overflow-hidden clips
            // the panel, and the popover anchors start-0 from the chip — which
            // sits ~141px into a 294px xl:grid-cols-4 card, so a 160px panel
            // lost 7px off its inline-end (measured in self-QA). Content-sized
            // + nowrap keeps the widest label ("בחירת העורכת") inside the card.
            <Popover
              contentTestId="badge-overflow-popover"
              contentClassName="w-max whitespace-nowrap"
              sheetOnMobile
              // MEH-1592: lg-and-up presentation moves to the overlay layer.
              // The pre-1592 anchored panel opened `top-full` DOWNWARD out of a
              // strip pinned to the photo's bottom edge, so it landed on the
              // card title / rating row (measured 47.9x24.1px of overlap at
              // 1440px) and on any sibling pill that had wrapped below it.
              // Overlay mode places it above the whole strip instead, portalled
              // out of the card's overflow-hidden. Below lg, sheetOnMobile
              // still wins — the sheet was never the colliding surface.
              overlay
              avoidRef={badgeStripRef}
              trigger={
                <button
                  type="button"
                  aria-label={t("producer.card.badges.overflow_aria", {
                    count: badgeCount(producer) - 2,
                  })}
                  data-testid="badge-overflow"
                  dir="ltr"
                  className="group inline-flex items-center justify-center min-h-[44px] min-w-[44px] -m-2.5 focus:outline-none"
                >
                  <span className="inline-flex items-center rounded-full bg-surface-card/95 border border-border text-fg-muted px-1.5 py-0.5 text-[11px] font-medium group-focus-visible:ring-2 group-focus-visible:ring-primary/40">
                    +{badgeCount(producer) - 2}
                  </span>
                </button>
              }
            >
              {/* MEH-1714: the panel opened as a bare label list with no
                  heading, so it read as an orphan pill floating over the
                  photo (Sapir QA 28/07: "למה התג של הכשר נראה ככה"). The
                  labels.md disclosure contract wants the affordance AND the
                  copy that says what is behind it — MEH-1547 shipped the
                  affordance, this is the copy. Muted + one step smaller than
                  the labels so the list stays the primary content; the
                  role="list"/"listitem" tree below is untouched, and the
                  heading sits outside it so it is not announced as an item. */}
              <span className="mb-1.5 block text-[10px] font-medium text-fg-muted">
                {t("producer.card.badges.overflow_heading")}
              </span>
              {/* The overflow used to read `b.label` straight off BADGE_CONFIG,
                  which is the one badge surface that never passes through
                  BadgeRow — so MEH-1711's kashrut resolver did not reach it and
                  a kosher pill in position 3+ said the fallback while the
                  detail page said "חלק". Same shared resolver as the visible
                  pills now (BadgeRow.jsx `resolveBadgeLabel`), imported rather
                  than reimplemented so the two cannot drift. `allBadges` and
                  `.slice(2)` are untouched: this changes what the rows SAY,
                  not which rows are here, so the max-2 visible cap and the
                  MEH-1714 heading above are unaffected. */}
              {/* MEH-1847: each row gains a muted one-line explanation. The
                  panel's heading promises "עוד על העסק הזה" and then delivered a
                  column of bare words — a badge with no explanation is a jargon
                  leak, and this is the surface where it was worst, since a badge
                  in position 3+ has no chip context around it.
                  Copy is BADGE_CONFIG[key].tooltip VERBATIM — the honest
                  any-product wording MEH-1439 already wrote — so this adds zero
                  new strings and inherits that copy review rather than
                  reopening it. Same visual idiom as the FilterSheet subtext
                  rows (MEH-1418/1507): muted, one step down, below the label.
                  REUSES: frontend/components/FilterSheet.jsx:248 (conditional
                  subtext line — `subtext && <p className="text-xs text-fg-muted …">`).
                  The tooltip is read off `b`, which IS the BADGE_CONFIG entry
                  (allBadges maps keys through it), so no extra import.
                  Rendered CONDITIONALLY: a key with no tooltip renders the label
                  alone rather than an empty line. Every key has one today, so
                  that branch is defensive — it exists so adding a tooltip-less
                  badge later cannot open a gap in the panel.
                  gap-1 → gap-2: with two-line rows the old spacing put the next
                  row's label as close to the previous row's description as to
                  its own, which breaks the grouping. Row CONTENT is what changed
                  here — `allBadges` and `.slice(2)` are untouched, so the max-2
                  visible cap, the MEH-1714 heading and the MEH-1593 overlay
                  behaviour are all unaffected. */}
              <span className="flex flex-col gap-2" role="list">
                {allBadges(producer)
                  .slice(2)
                  .map((b) => (
                    <span key={b.key} role="listitem" className="block">
                      <span className="block">
                        {resolveBadgeLabel(b, producer, tKashrut)}
                      </span>
                      {b.tooltip && (
                        <span className="block text-[12px] leading-snug text-fg-muted">
                          {b.tooltip}
                        </span>
                      )}
                    </span>
                  ))}
              </span>
            </Popover>
          )}
          {/* MEH-1120 (MEH-1074 Task B): gate raised 3 → 4. Verification tiers
              (2 phone / 3 business) are owned by the BadgeRow seal above
              (verification_tier / ADR-022) — TrustBadge now only carries the
              recognition tiers (4 community-leader, 5 ambassador), so it no
              longer duplicates the "מאומת" seal on the card. */}
          {(producer.trust_tier ?? 1) >= 4 && (
            <TrustBadge tier={producer.trust_tier} compact avoidRef={badgeStripRef} />
          )}
          {producer.has_physical_location === false && producer.offers_delivery && (
            // MEH-1459: Emoji-LOCK — the delivery emoji baked into the i18n string
            // is replaced by the MEH-1418 delivery glyph (Phosphor Truck, currentColor via the
            // pill's text-text) so it matches the delivery toggle chip. size 14
            // keeps the pill height in line with the sibling text badges.
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-card border border-border text-text px-2 py-0.5 text-[11px]">
              <Truck size={14} className="shrink-0" aria-hidden="true" />
              {t("producer.card.badges.delivery_only")}
            </span>
          )}
        </div>

        <CardHeart producer={producer} onCountChange={(delta) => setLocalFavCount((c) => Math.max(0, c + delta))} />
      </div>

      <div className="p-4 flex flex-col gap-2">
        {/* Eyebrow = CATEGORY. MEH-1073 T10 / MEH-867: no uppercase, no
            letter-spacing — harms RTL legibility and Hebrew has no case. */}
        {category && (
          <p className="text-[11px] font-medium text-fg-muted truncate">
            {category}
          </p>
        )}

        <div className="grid grid-cols-[1fr_auto] gap-3 items-baseline">
          <Link href={producerHref} className="block min-w-0 focus-ring">
            {/* MEH-1028 (CARD-27): mobile density — 16px name on <640px, 20px sm: up. */}
            <h3 className="font-headline-md font-bold text-[16px] sm:text-[20px] text-text group-hover:text-primary transition-colors duration-base ease-quart leading-snug line-clamp-2">
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
              {/* MEH-1243 (🔒 §7): unify to Google format ★ X.X (N) across surfaces. */}
              <Star size={13} weight="fill" className="text-accent inline align-[-1px]" aria-hidden="true" /> {Number(producer.avg_rating).toFixed(1)} ({producer.reviews_count})
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
                <span data-testid="distance-pill">{distanceLabel}</span>
              </>
            )}
          </span>
        </p>

        {descriptionText && (
          // MEH-1028 (CARD-27): one-line description hidden on mobile (<640px),
          // visible sm: up — part of the mobile density variant.
          <p
            className="hidden sm:block text-sm text-text/85 line-clamp-1"
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

        {/* MEH-1823: the active offer, as a short chip. OfferBadge returns null
            when active_offer is absent, so a business without an offer renders
            byte-identically to before — no wrapper, no gap, no flow change. */}
        <OfferBadge offer={producer.active_offer} variant="chip" />
        {/* /MEH-1823 */}

        {localFavCount >= 5 && (
          <p className="flex items-center gap-1 text-[12px] text-fg-muted">
            {/* MEH-643/MEH-636: count heart recedes to fg-muted — never red. */}
            <HeartStraight size={14} weight="fill" className="text-fg-muted" aria-hidden="true" />
            {t("producer.card.favorites_count_short", { count: localFavCount })}
          </p>
        )}

        {/* MEH-1210: price removed from discovery cards ("מגזין, לא marketplace")
            — exact prices are a marketplace signal; they stay at product level
            inside /producer. The prior MEH-1142 price-only footer (mt-auto span)
            is gone; p-4 supplies the card's bottom padding. */}
      </div>
    </article>
  );
}
