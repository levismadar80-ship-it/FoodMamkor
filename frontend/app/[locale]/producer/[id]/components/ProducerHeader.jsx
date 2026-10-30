import { Fragment, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Star, StarOfDavid } from "@phosphor-icons/react";

import AlertPrefsPanel from "@/components/AlertPrefsPanel";
import BadgeRow from "@/components/BadgeRow";
import FavoriteButton from "@/components/FavoriteButton";
import KashrutBadgeStrip from "@/components/KashrutBadgeStrip";
import ProducerUpdatesButton from "@/components/ProducerUpdatesButton";
import ShareButton from "@/components/ShareButton";
import { useAuth } from "@/lib/auth-context";
import {
  ensureFavoritesLoaded,
  isFavorited as isFavoritedCache,
  subscribeFavorites,
} from "@/lib/favorites-cache";
import { allBadges, isKashrutCurrent } from "@/lib/badges";
import { getOrderWindowStatus } from "@/lib/orderWindow";
import ReviewExcerpt from "./ReviewExcerpt";
import { categoryListingHref, getVacationReturnDate } from "../lib/producer-format";
import { resolveCategoryGlyph, styleForProducer } from "@/lib/category-registry";
// MEH-1546: the meta-line status is the page's ONLY order-status element, so
// order_window feeds THAT branch rather than adding a second line — see
// lib/order-status.js for the precedence and the contradiction it avoids.
// (Copy itself lives in messages/{he,en}.json; comments stay English per
// docs/CLAUDE-REVIEW.md rule 5.)
import { israelDayKey, israelTime, resolveHeaderStatus, statusTagTone } from "../lib/order-status";
import { humanTime } from "@/lib/time-format";
import { isFullThisWeek } from "@/lib/availability";

// MEH-2592: the kosher chip — outlined, on the card surface, 13px text-text so
// it reads as a fact tag next to the tinted status tag, never as a second
// status (no tint, no dot, no colour of its own).
const KOSHER_CHIP =
  "inline-flex min-h-[28px] items-center rounded-full border border-border bg-surface-card px-2.5 py-0.5 text-[13px] text-text";

// The «·» between facts on the one line. aria-hidden: a screen reader gets the
// facts as separate runs already.
function FactsSeparator() {
  return (
    <span aria-hidden="true" className="opacity-60">
      ·
    </span>
  );
}

// The category's own glyph + colour from lib/category-registry (the same pair
// as its map pin), 16px, before the category name. An unknown or renamed
// category resolves to the registry fallback → render nothing rather than a
// green Leaf (CategorySelector's policy, MEH-2163). `styleForProducer`
// validates the hex, so the inline colour is safe to interpolate.
function CategoryGlyph({ category }) {
  const { glyph: Glyph, isFallback } = resolveCategoryGlyph(category);
  if (isFallback) return null;
  const { color } = styleForProducer({ categories: [category] });
  return (
    <Glyph
      size={16}
      weight="regular"
      style={{ color }}
      aria-hidden="true"
      data-testid="producer-header-category-glyph"
    />
  );
}

/**
 * Main-column header block for the producer detail page.
 *
 * MEH-1334 (Quiet Direction v3): restructured from the ~9-element stack to 4
 * visual groups — [name + single ✓ seal] · [one-liner] · [rating | "חדש"] ·
 * [meta line with the page's ONLY status + one quiet kosher line] — plus the
 * quiet actions row (שמירה · מעקב · desktop שיתוף) and the restyled
 * pull-quote. Removed per decision 4: premium chip, favorites count,
 * TrustBadge, secondary-category chips, grass_fed/delivery highlight chips,
 * contact_name line (relocated to OwnerCard). Kept: declared explainer
 * (ADR-022 gate 1) + the full_this_week banner. The vacation banner was
 * removed in chunk 3 — it repeated the return date the meta status owns.
 *
 * The 3-state order status lives HERE and only here (one green per page —
 * revision-2 #2): open = primary, closed = muted, vacation = gold-deep
 * (#7a5a10 on cream #f5f0e8 = 5.61:1, AA ✓; the pre-revision #8B6914 failed).
 *
 * Sits inside the main column of the two-column grid in ProducerDetail.jsx —
 * breadcrumb, gallery, and mobile tab bar live OUTSIDE the grid.
 */
export default function ProducerHeader({
  producer,
  isVacation,
  primaryCategory,
  hasImages = true,
  shareUrl,
  alertsOpen = false,
  onOpenAlerts,
  onCloseAlerts,
  panelKey = 0,
  onUpdatesChanged,
  updatesSignal,
}) {
  const t = useTranslations();
  const locale = useLocale();

  // MEH-1609 built the page's only AlertPrefsPanel mount here, reached by an
  // alerts_reentry bell in the actions row. MEH-1693 keeps the MOUNT (its
  // position — normal flow, outside the lg:absolute-pinned row — is what makes
  // the panel survivable) and retires the bell: the panel now opens from the
  // save itself, which is the moment the ask belongs to.
  //
  // `alertsOpen` is owned by ProducerDetail, not here, because the mobile heart
  // that opens it lives on the hero (ImageGallery) — a SIBLING of this
  // component, so the page is their only common ancestor. Favorited state is
  // still read locally from the shared favorites-cache (MEH-1325), the same
  // source both hearts write, so this gate stays correct no matter which one
  // the visitor tapped.
  const { user } = useAuth();
  const [favorited, setFavorited] = useState(false);

  useEffect(() => {
    if (!user) {
      setFavorited(false);
      return undefined;
    }
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

  // Un-favoriting while the panel is open must not leave `alertsOpen` armed —
  // otherwise re-saving the business would silently re-open the panel. The
  // state moved to the page (MEH-1693) but the guard stays here, because this
  // is where the cache subscription lives; it fires for an un-save from EITHER
  // heart, and from a card heart on another surface in the same session.
  useEffect(() => {
    if (!favorited) onCloseAlerts?.();
  }, [favorited, onCloseAlerts]);

  const showAlerts = Boolean(favorited && user);

  // MEH-1334: 3-state status. Anything not closed/vacation reads as open —
  // matches the old ContactCard OPEN_STATES default-open behavior.
  // MEH-1854: the helper returns the CANONICAL enum, so the legacy "full"
  // twin is already normalised to full_this_week and no longer needs its own
  // comparison here.
  const isClosed = !isVacation && isFullThisWeek(producer);
  const vacationDate = getVacationReturnDate(producer, locale);

  // MEH-1546: order_window status is time-derived, so it must not run during
  // SSR — the server and the client would disagree and React would flag a
  // hydration mismatch (MEH-1531). Until mounted, orderStatus stays null and
  // resolveHeaderStatus falls through to branch 5, i.e. exactly the pre-1546
  // output. `mounted` also re-runs nothing on a timer: the status refreshes on
  // the next navigation/render, which is honest enough for a weekly window.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // MEH-2264: today's special_hours override (if any) wins over the weekly day.
  const orderStatus = mounted
    ? getOrderWindowStatus(producer.order_window, new Date(), producer.special_hours)
    : null;
  const status = resolveHeaderStatus({ isVacation, isClosed, orderStatus });
  const statusLabel = {
    vacation: () =>
      vacationDate
        ? t("producer.detail.header.status.vacation", { date: vacationDate })
        : t("producer.detail.header.status.vacation_no_date"),
    closed: () => t("producer.detail.header.status.closed"),
    // The mapper guarantees nextChange is a Date on this branch. The dayKey
    // fallback covers the residual case where ICU returns an abbreviation we
    // don't recognise — better the plain closed copy than `weekdays.undefined`.
    orders_closed: () => {
      const dayKey = israelDayKey(status.nextChange);
      return dayKey
        ? t("producer.detail.header.status.orders_closed", {
            day: t(`opening_hours.weekdays.${dayKey}`),
            time: humanTime(israelTime(status.nextChange)),
          })
        : t("producer.detail.header.status.closed");
    },
    orders_open: () =>
      t("producer.detail.header.status.orders_open", {
        time: humanTime(israelTime(status.nextChange)),
      }),
    open: () => t("producer.detail.header.status.open"),
  }[status.branch]();

  // Single verified seal next to the name — every other earned badge left the
  // header (MEH-1334 decision 4). hideKeys derives from the live badge set so
  // a future lib/badges key can't sneak back in. Imageless profiles anchor the
  // seal in the Tinted Masthead (MEH-1168 P2), so it hides here too and
  // BadgeRow renders nothing.
  const badgeHideKeys = allBadges(producer)
    .map((b) => b.key)
    .filter((k) => (hasImages ? k !== "verified" : true));

  // The facts line, as an array so the «·» separators fall only BETWEEN
  // present facts (0 / 1 / many — no leading or trailing dot in any cell).
  // At zero reviews the rating slot is simply absent (Sapir, 30/10): Wolt,
  // Booking and Airbnb show nothing in the rating's place until a review
  // exists, and a line announcing the absence only underlined it. The
  // MEH-1411 «אין ביקורות עדיין» pill (MEH-1746 wording) is retired with it;
  // the jump bar still leads to the reviews section.
  const facts = [];
  if (producer.reviews_count > 0) {
    facts.push(
      <a
        key="rating"
        href="#reviews"
        // MEH-1249 chunk 8: the rating anchor's twin — ReviewExcerpt's
        // pull-quote — is ALSO an `a[href="#reviews"]` inside this header, so
        // an href selector resolves to two elements; the id keeps them apart.
        data-testid="trust-strip-rating"
        className="inline-flex items-center gap-1.5 rounded text-text hover:text-primary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40 transition-colors"
      >
        <Star size={18} weight="fill" className="text-accent" aria-hidden="true" />
        <span className="numeric font-headline-md text-lg font-bold" dir="ltr">
          {Number(producer.avg_rating).toFixed(1)}
        </span>
        <span className="text-[13px] text-muted underline underline-offset-4">
          {t("producer.detail.header.review_count", { count: producer.reviews_count })}
        </span>
        {/* MEH-1048 a11y: sr-only nav hint so AT users hear the link scrolls to reviews */}
        <span className="sr-only">{t("producer.detail.header.review_excerpt_aria")}</span>
      </a>,
    );
  }
  if (primaryCategory) {
    facts.push(
      <Link
        key="category"
        href={categoryListingHref(primaryCategory.id)}
        className="inline-flex min-h-[24px] items-center gap-1 font-medium text-text underline-offset-[3px] hover:underline hover:text-primary transition"
        data-testid="producer-header-category-link"
      >
        <CategoryGlyph category={primaryCategory} />
        {primaryCategory.name}
      </Link>,
    );
  }
  if (producer.city) facts.push(<span key="city">{producer.city}</span>);
  // MEH-1541: quiet "מאז {שנה}" heritage fact — a veteran-business trust
  // signal in the magazine voice, NOT a badge (no icon / gold / border; the
  // single-green rule stays with the status tag). Year numerals dir="ltr".
  if (producer.established_year) {
    facts.push(
      <span key="since" className="text-fg-muted" data-testid="established-year">
        {t("producer.detail.header.since_prefix")}{" "}
        <span dir="ltr" className="numeric">
          {producer.established_year}
        </span>
      </span>,
    );
  }

  return (
    <div className="relative" data-testid="producer-header">
      {/* Group 1 — name + single ✓מאומתת seal (richer popover in BadgeRow).
          MEH-815: imageless profiles carry the h1 in the Tinted Masthead, so
          it is omitted here to keep the name singular. lg:pe-72 reserves the
          title row's inline-end for the absolutely-pinned actions row (pe-56
          until MEH-2562 added the third action, «קבלת עדכונים»). */}
      <div className="flex items-center flex-wrap gap-2 lg:pe-72">
        {hasImages && (
          <h1 className="font-headline-lg text-4xl font-black text-text me-3">
            {producer.name}
          </h1>
        )}
        <BadgeRow producer={producer} hideKeys={badgeHideKeys} />
      </div>

      {/* Group 2 — one-liner. Imageless profiles have no h1 row here (the
          masthead owns it), so the one-liner is the header's FIRST line and
          must clear the absolutely-pinned desktop actions row itself —
          adversarial-review fix (imageless-desktop overlap). */}
      {producer.short_description && (
        // MEH-2596: a muted 17px deck under the name, not body text.
        <p className={`text-[17px] leading-relaxed text-fg-muted mt-2.5${hasImages ? "" : " lg:pe-72"}`}>
          {producer.short_description}
        </p>
      )}

      {/* Groups 3+4 — ONE facts line, the status line, then a tags row
          (MEH-2592, 30/10/2026; replaces MEH-2403's "category · city" line —
          see docs/DESIGN.md § Quiet Direction v3). The Google Maps / Airbnb /
          Yelp shape: everything a reader scans before deciding sits on one
          muted line — «★ 4.8 · 12 ביקורות · [glyph] קטגוריה · עיר · מאז 1998»
          — the status keeps a line of its own, and the fact tags follow it.
          The rating keeps its #reviews anchor (MEH-1048); at zero reviews the
          slot is empty (see `facts` above). The category is the
          line's one tappable fact (Yelp/TripAdvisor make categories links), so
          it carries the registry glyph in the category's own colour
          (lib/category-registry — the same glyph + colour as its map pin)
          and darker text; an unknown category gets no glyph (same policy as
          CategorySelector — never a green Leaf that mis-signals produce).
          Rating decimal stays dir="ltr" + .numeric so RTL can't flip
          "4.8" → "8.4" (MEH-763). */}
      {facts.length > 0 && (
        <p
          className="flex items-center flex-wrap gap-x-2 gap-y-1 text-sm text-muted mt-3"
          data-testid="producer-header-meta"
        >
          {facts.map((fact, i) => (
            <Fragment key={fact.key}>
              {i > 0 && <FactsSeparator />}
              {fact}
            </Fragment>
          ))}
        </p>
      )}

      {/* Status line — the status ALONE (Sapir, 30/10: a separate line, so a
          longer tags row never crowds it; this keeps MEH-2403's "status alone"
          half). It is the page's ONLY order-status element (MEH-1546:
          five-branch precedence in resolveHeaderStatus; order_window feeds it
          instead of adding a second line) and the page's one green. MEH-2596
          tag styling: dot + 10% tint of its own colour via color-mix on
          currentColor. */}
      <p className="mt-2.5 text-sm" data-testid="producer-header-status-line">
        <span
          className={`inline-flex items-start gap-1.5 rounded-xl px-2.5 py-0.5 font-semibold bg-[color-mix(in_srgb,currentColor_10%,transparent)] ${statusTagTone(status.tone)}`}
          data-testid={status.testid}
        >
          <span
            className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-current"
            aria-hidden="true"
          />
          {statusLabel}
        </span>
      </p>

      {/* Tags row — the fact tags under the status: today the kosher chip,
          tomorrow whatever else earns a tag. Kosher renders ONCE and as ONE
          chip however many certificates it lists (up to 8 codes): a chip per
          certificate would crowd the row, one chip wraps inside itself. Badge
          codes via the quiet strip (owns the MEH-1260 expiry gate), else the
          generic label — gated on admin-verified kashrut only, never the
          free-text producer.kosher (MEH-986 ch3a, חוק איסור הונאה בכשרות).
          Absent from the DOM when there is nothing to tag (no empty gap). */}
      {(producer.kashrut_badges?.length > 0 || isKashrutCurrent(producer)) && (
        <div
          className="flex flex-wrap items-center gap-2 mt-2"
          data-testid="producer-header-tags"
        >
          {producer.kashrut_badges?.length > 0 ? (
            <KashrutBadgeStrip
              variant="quiet"
              className={KOSHER_CHIP}
              badges={producer.kashrut_badges}
              verified_at={producer.kashrut_verified_at}
              expires_at={producer.kashrut_expires_at}
              /* MEH-1672: badge codes only — the certificate itself is fetched
               through our proxy, so no Cloudinary URL reaches the client. */
              certs={producer.kashrut_certs}
              producerId={producer.id}
            />
          ) : isKashrutCurrent(producer) ? (
            /* MEH-2518: same expiry gate as the strip — this line used to check
             kashrut_verified_at only, so a lapsed certificate still read «כשר». */
            <p className={`flex items-center gap-1.5 ${KOSHER_CHIP}`}>
              <StarOfDavid size={14} aria-hidden="true" />
              {t("producer.detail.header.attr.kosher")}
            </p>
          ) : null}
        </div>
      )}

      {/* MEH-1508 ch2 Phase B — gluten production-facility line. A sentence,
          so it stays plain text under the tags, not a tag: no badge / icon /
          checkmark (MEH-1259 self-declaration pattern, NOT the MEH-1087
          verified pattern — a checkmark would imply a certificate). Renders
          ONLY for shared / dedicated; 'unknown' shows nothing. §6.4. */}
      {producer.gluten_free_facility === "shared" && (
        <p
          className="text-xs text-fg-muted leading-relaxed max-w-prose mt-2"
          data-testid="gluten-facility-shared"
        >
          {t("producer.detail.header.gluten_facility.shared")}
        </p>
      )}
      {producer.gluten_free_facility === "dedicated" && (
        <p
          className="text-xs text-fg-muted leading-relaxed max-w-prose mt-2"
          data-testid="gluten-facility-dedicated"
        >
          {t("producer.detail.header.gluten_facility.dedicated")}
        </p>
      )}

      {/* MEH-1170: declared (tier 2) carries NO chip — ADR-022 gate 1 requires
          the badge absence to stay "affirmatively explained in consumer copy",
          so this block survives the MEH-1334 restructure (decision 4). */}
      {producer.verification_tier === "declared" && (
        <p className="text-xs text-fg-muted leading-relaxed mt-2 max-w-prose">
          {t("producer.badge.declared_explainer")}
        </p>
      )}

      {/* Quiet actions row (MEH-1334): שמירה · שיתוף. DESKTOP ONLY.
          Desktop: absolutely pinned to the title row's inline-end, two labeled
          actions. MEH-1363 (decision A, MEH-1362): FollowButton removed — the
          heart is the single interest control.
          MEH-1693: the row no longer renders below lg. Mobile's heart moved up
          to the hero overlay beside the share circle (ImageGallery), which is
          an explicit override of MEH-1334 decision 6 — that decision pulled the
          heart OFF the hero to avoid a ❤️-hero/עקבו-row duplication, and the
          duplication died with the mobile row. This also retires MEH-1411's
          lone-heart problem by removing the surface it lived on. The share
          child's own `hidden lg:inline-flex` wrapper went with it: redundant
          once the row itself is desktop-only, and misleading to the next
          reader. 44px tap target + aria-pressed still live in FavoriteButton. */}
      <div
        className="hidden lg:flex items-center gap-5 mt-2 lg:absolute lg:top-0 lg:end-0 lg:mt-0"
        data-testid="producer-actions-row"
      >
        <FavoriteButton
          producerId={producer.id}
          producerName={producer.name}
          variant="quiet"
          onFavorited={onOpenAlerts}
        />
        <ShareButton
          variant="quiet"
          url={shareUrl}
          title={producer.name}
          description={producer.description}
          city={producer.city}
          category={primaryCategory?.name}
        />
        {/* MEH-2526 permanent updates toggle; MEH-2562 moved it into this row
            (desktop) and onto the hero circles (mobile, ImageGallery) — as a
            lone pill under the header it read as an orphan. */}
        <ProducerUpdatesButton
          variant="quiet"
          producerId={producer.id}
          onOpenAlerts={onOpenAlerts}
          onChanged={onUpdatesChanged}
          refreshSignal={updatesSignal ?? alertsOpen}
        />
      </div>

      {/* MEH-1609 built this mount; MEH-1693 keeps it and changes only what
          opens it. It sits OUTSIDE the actions row, in normal flow: the row is
          `lg:absolute`-pinned to the title's inline-end, so a block panel
          inside it would be pinned too — the exact layout break MEH-1334 cited
          when it suppressed the auto-open panel for variant="quiet". It is
          ALSO outside the hero overlay, which is why the mobile hero heart can
          reuse it instead of needing a second mount. One panel, both hearts,
          both viewports.

          TRADE-OFF (conscious, MEH-1693 §4): retiring the bell gives up the
          RE-ENTRY case MEH-1609 existed for — editing alert prefs on a later
          visit, when no save is happening. That path now lives on /favorites
          (per-card bell). Accepted so the ask lands at the moment of interest
          rather than before it. Restoring re-entry here means a new control,
          not a revert of this wiring. */}
      {showAlerts && alertsOpen && (
        <div className="mt-3" data-testid="alerts-reentry-panel">
          <AlertPrefsPanel
            key={panelKey}
            producerId={producer.id}
            producerName={producer.name}
            onClose={onCloseAlerts}
          />
        </div>
      )}

      {/* MEH-291 — full_this_week banner (response-time hint, not a closure
          signal; kept per decision 4 alongside the closed status text).
          Suppressed during vacation since that banner already dominates. */}
      {producer.availability_state === "full_this_week" && !isVacation && (
        <div className="mx-0 mt-3 bg-background border border-border rounded-xl p-3">
          <p className="text-sm font-bold text-text">{t("producer.detail.header.slow_response")}</p>
        </div>
      )}

      {/* MEH-1334 chunk 3: the vacation banner was REMOVED — it repeated the
          return date the gold meta status already owns ("one home per fact").
          A banner returns here only when an owner-authored free-text vacation
          message field exists (MEH-1335 family); until then the status line is
          vacation's single surface. */}

      {/* Pull-quote (MEH-1048) — moved below the header groups per the mockup;
          self-guards on reviews_count (zero → hidden entirely, per 1e). */}
      <ReviewExcerpt producerId={producer.id} reviewsCount={producer.reviews_count} />
    </div>
  );
}
