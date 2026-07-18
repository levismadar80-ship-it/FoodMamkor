import { useLocale, useTranslations } from "next-intl";
import { Star, StarOfDavid } from "@phosphor-icons/react";

import BadgeRow from "@/components/BadgeRow";
import FavoriteButton from "@/components/FavoriteButton";
import FollowButton from "@/components/FollowButton";
import KashrutBadgeStrip from "@/components/KashrutBadgeStrip";
import ShareButton from "@/components/ShareButton";
import { allBadges } from "@/lib/badges";
import ReviewExcerpt from "./ReviewExcerpt";
import { getVacationReturnDate } from "../lib/producer-format";

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
}) {
  const t = useTranslations();
  const locale = useLocale();

  // MEH-1334: 3-state status. `full` is the legacy availability_status twin of
  // full_this_week (MEH-291 7-day overlap contract, same as isVacation in
  // ProducerDetail.jsx). Anything not closed/vacation reads as open — matches
  // the old ContactCard OPEN_STATES default-open behavior.
  const availState = producer.availability_state || producer.availability_status;
  const isClosed = !isVacation && (availState === "full_this_week" || availState === "full");
  const vacationDate = getVacationReturnDate(producer, locale);

  // Single verified seal next to the name — every other earned badge left the
  // header (MEH-1334 decision 4). hideKeys derives from the live badge set so
  // a future lib/badges key can't sneak back in. Imageless profiles anchor the
  // seal in the Tinted Masthead (MEH-1168 P2), so it hides here too and
  // BadgeRow renders nothing.
  const badgeHideKeys = allBadges(producer)
    .map((b) => b.key)
    .filter((k) => (hasImages ? k !== "verified" : true));

  return (
    <div className="relative">
      {/* Group 1 — name + single ✓מאומתת seal (richer popover in BadgeRow).
          MEH-815: imageless profiles carry the h1 in the Tinted Masthead, so
          it is omitted here to keep the name singular. lg:pe-56 reserves the
          title row's inline-end for the absolutely-pinned actions row. */}
      <div className="flex items-center flex-wrap gap-2 lg:pe-56">
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
        <p className={`text-[15px] leading-relaxed text-text mt-2${hasImages ? "" : " lg:pe-56"}`}>
          {producer.short_description}
        </p>
      )}

      {/* Group 3 — rating anchor (#reviews, MEH-1048) or the "חדש" fallback.
          "חדש" sits in the rating's slot (Airbnb pattern — a fallback, not
          another badge). Rating decimal stays dir="ltr" + .numeric so RTL
          can't flip "4.8" → "8.4" (MEH-763). */}
      {producer.reviews_count > 0 ? (
        <a
          href="#reviews"
          className="mt-3 inline-flex items-center gap-1.5 self-start rounded text-text hover:text-primary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40 transition-colors"
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
        </a>
      ) : (
        <span
          className="mt-3 inline-block self-start font-headline-md text-[17px] font-bold text-text"
          data-testid="new-mark"
        >
          {t("producer.detail.header.new_mark")}
        </span>
      )}

      {/* Group 4 — meta line (city · category · status) + one quiet kosher
          line. The status is colored text, no dot, no chip (mockup 1d). */}
      <div className="flex flex-col gap-1 mt-2 mb-1">
        <p className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-sm text-muted">
          {producer.city && <span>{producer.city}</span>}
          {producer.city && primaryCategory && <span aria-hidden="true" className="opacity-60">·</span>}
          {primaryCategory && <span>{primaryCategory.name}</span>}
          {(producer.city || primaryCategory) && <span aria-hidden="true" className="opacity-60">·</span>}
          {isVacation ? (
            <span className="font-semibold text-gold-deep" data-testid="status-vacation">
              {vacationDate
                ? t("producer.detail.header.status.vacation", { date: vacationDate })
                : t("producer.detail.header.status.vacation_no_date")}
            </span>
          ) : isClosed ? (
            <span className="font-semibold text-muted" data-testid="status-closed">
              {t("producer.detail.header.status.closed")}
            </span>
          ) : (
            <span className="font-semibold text-primary" data-testid="status-open">
              {t("producer.detail.header.status.open")}
            </span>
          )}
        </p>

        {/* Kosher renders ONCE (MEH-1334): specific admin-assigned badges via
            the quiet strip variant (owns the MEH-1260 expiry gate), else the
            generic label — gated on admin-verified kashrut only, never the
            free-text producer.kosher (MEH-986 ch3a, חוק איסור הונאה בכשרות). */}
        {producer.kashrut_badges?.length > 0 ? (
          <KashrutBadgeStrip
            variant="quiet"
            badges={producer.kashrut_badges}
            verified_at={producer.kashrut_verified_at}
            expires_at={producer.kashrut_expires_at}
          />
        ) : producer.kashrut_verified_at ? (
          <p className="flex items-center gap-1.5 text-[12.5px] text-muted">
            <StarOfDavid size={14} aria-hidden="true" />
            {t("producer.detail.header.attr.kosher")}
          </p>
        ) : null}
      </div>

      {/* MEH-1170: declared (tier 2) carries NO chip — ADR-022 gate 1 requires
          the badge absence to stay "affirmatively explained in consumer copy",
          so this block survives the MEH-1334 restructure (decision 4). */}
      {producer.verification_tier === "declared" && (
        <p className="text-xs text-fg-muted leading-relaxed mt-2 max-w-prose">
          {t("producer.badge.declared_explainer")}
        </p>
      )}

      {/* Quiet actions row (MEH-1334): שמירה · מעקב · שיתוף-on-desktop.
          Mobile/tablet: hairline-topped row under the meta block; desktop:
          absolutely pinned to the title row's inline-end (single mount, so
          FollowButton's follow-status GET fires once). Mobile share lives in
          the hero overlay only (decision 6), hence hidden lg:inline-flex. */}
      <div className="flex items-center gap-5 border-t border-border mt-3 lg:absolute lg:top-0 lg:end-0 lg:border-t-0 lg:mt-0">
        <FavoriteButton producerId={producer.id} producerName={producer.name} variant="quiet" />
        <FollowButton producerId={producer.id} variant="quiet" />
        <span className="hidden lg:inline-flex">
          <ShareButton
            variant="quiet"
            url={shareUrl}
            title={producer.name}
            description={producer.description}
            city={producer.city}
            category={primaryCategory?.name}
          />
        </span>
      </div>

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
