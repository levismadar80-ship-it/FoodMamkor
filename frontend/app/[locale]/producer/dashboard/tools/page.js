// @ts-check
"use client";

/**
 * Module:   producer/dashboard/tools/page
 * Purpose:  כלים tab of the producer dashboard hub (MEH-964 Phase 1, chunk
 *           1A). Launcher for the producer creation/manage tool routes:
 *           manage events / experiences / group buys / recipes + the reviews
 *           deep link.
 * Touches:  GET /producers/me (the «שיתוף» section, MEH-2882 PR 1); GET /producers/me/dashboard (read — for producer.id used by the
 *           reviews deep link).
 * Does NOT: build any tool internals — each link points at its existing,
 *           already-shipped route. The grid markup below is byte-identical to
 *           its prior definition in producer/dashboard/page.js.
 * Related:  app/[locale]/producer/dashboard/DashboardLayoutClient.jsx (tab nav + UX gate);
 *           events/new/page.js, group-buys/page.js, recipes/page.js,
 *           settings/page.jsx (link targets).
 * History:  MEH-964 (relocation, chunk 1A); MEH-1102 (removed the עריכת
 *           פרופיל card — after MEH-1095 it pointed at /producer/dashboard/
 *           edit, a straight duplicate of the עריכה nav tab; /settings stays
 *           reachable via AccountSheet + ProfileCompletenessCard; added
 *           Phosphor icons + action-noun titles); MEH-1357 (removed the
 *           הצגת-העסק card — duplicate of the persistent "צפייה בדף" link now
 *           in the dashboard shell nav; reviews card marked candidate-to-move);
 *           MEH-1428 chunk 2 (RequestReviewCard under the grid, approved only);
 *           MEH-3641 (the «הפרופיל שלכם בגוגל» tile); MEH-3723 (that tile moved
 *           to the edit tab).
 *
 * Auth: producer-role guard via useAuth() — kept per-page until Phase 2.
 * RTL: logical properties only — see .claude/rules/rtl.md.
 */

import { rescueBagsEnabled } from "@/lib/rescue";
import { Link, useRouter } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarPlus, UsersThree, CookingPot, Star } from "@phosphor-icons/react";
import api from "@/lib/api";
import Button from "@/components/ui/Button";
import { useAuth } from "@/lib/auth-context";
import RequestReviewCard from "@/components/producer/RequestReviewCard";
import BusinessQrCard from "@/components/producer/BusinessQrCard";
import ShareKitSection from "@/components/producer/ShareKitSection";
import { producerCompleteness } from "@/lib/producer-completeness";
import NewToolPill from "@/components/producer/NewToolPill";
import ToolGroupCard from "@/components/producer/ToolGroupCard";

// MEH-3669: one look for every group heading and grid on the tab; the
// «שיתוף» heading below already used this h2.
const H2 = "font-headline-md text-lg font-bold text-text mb-4";
const GRID = "grid grid-cols-1 md:grid-cols-3 gap-4";
const CARD = "bg-surface border border-border rounded-lg p-5 hover:border-primary transition";

// MEH-3753: the line on the «הזדמנויות» card, per producer status. Approved
// has none; an unknown status has none rather than a guess.
const LOCKED_LINE_KEY = {
  draft: "quick_links.locked_until_approved",
  pending: "quick_links.locked_until_approved",
  rejected: "quick_links.locked_rejected",
  inactive: "quick_links.locked_inactive",
};

export default function ProducerDashboardToolsPage() {
  const router = useRouter();
  const t = useTranslations("dashboard.producer");
  const tShare = useTranslations("share");
  const tNav = useTranslations("nav");
  // MEH-3669: «קבוצת רכישה» already lives here; reuse it (messages-hygiene-guard).
  const tType = useTranslations("home.whats_on.type");
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState(null);
  // MEH-1777: a rejected fetch used to leave `data` null forever, and
  // `if (!data)` can't tell "still in flight" from "failed" apart — so it
  // rendered the loading string permanently. Same distinct-error +
  // retry-counter shape as dashboard/page.js's loadError/analyticsError.
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // MEH-2882 PR 1: the «שיתוף» section (QR card + «ערכת שיתוף») needs the
  // owner profile — slug, images, categories, completeness. GET
  // /producers/me/dashboard has none of them (MEH-2880). A failed profile
  // fetch only hides that section; the tool tiles still render.
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== "producer") {
      router.push("/login");
      return;
    }
    setLoadError(false);
    api
      .get("/producers/me/dashboard")
      .then((r) => setData(r.data))
      .catch(() => {
        setData(null);
        setLoadError(true);
      });
    api
      .get("/producers/me")
      .then((r) => {
        setProfile(r.data);
        setProfileError(false);
      })
      .catch(() => {
        setProfile(null);
        setProfileError(true);
      });
  }, [user, authLoading, router, attempt]);

  // MEH-2880 review: /qr-card's back link (and any deep link) lands on
  // #share, which mounts only after both fetches return — the browser's own
  // hash scroll has already run by then. Scroll once the section exists
  // (REUSES: edit/page.js hash effect).
  const shareReady = Boolean(data && profile);
  useEffect(() => {
    if (!shareReady || typeof window === "undefined" || window.location.hash !== "#share") return;
    requestAnimationFrame(() => {
      document.getElementById("share")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [shareReady]);

  if (authLoading || !user || user.role !== "producer") return null;

  // The error branch precedes the loading branch so a failure never falls
  // through and reads as "loading" (MEH-956 precedent, dashboard/page.js).
  if (loadError) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16">
        <div
          data-testid="tools-load-error"
          className="bg-surface border border-border rounded-lg p-6 text-center"
          role="alert"
        >
          <p className="text-fg-muted mb-4">{t("section_errors.tools")}</p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="inline-block bg-primary text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-primary-dark transition"
          >
            {t("section_errors.retry_cta")}
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center text-fg-muted">
        {t("loading_data")}
      </div>
    );
  }

  const { producer } = data;
  // MEH-2784: tools the server refuses to an unapproved business say so on
  // the tile, before the owner opens them. The tile stays a link so the
  // owner can still see what the tool is.
  const approved = producer.status === "approved";
  const rescueOn = rescueBagsEnabled();
  // MEH-3753: the server refuses group buys and bags to every status but
  // approved (group_buys.py, rescue_writes.py), so every one of them gets a
  // line, each the one that is true for it: draft / pending wait for an
  // approval, rejected has to fix and resubmit, inactive is paused.
  const lockedKey = LOCKED_LINE_KEY[producer.status];
  const lockedLine = lockedKey && (
    <p data-testid="tool-locked-line" className="text-xs font-medium text-warning-800 mt-1">
      {t(lockedKey)}
    </p>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      {/* MEH-2429: every other dashboard page has an h1; this one had none, so
          a screen reader landed on a page with no heading. The visible text is
          the existing nav label — no new copy. */}
      <h1 className="font-headline-lg text-xl font-bold text-text mb-6">{t("nav.tools")}</h1>
      {/* MEH-3669: grouped by what the owner came to do (Shopify / Open Food
          Network pattern; research in the card). The four offer tiles are two
          cards now, «אירועים» and «הזדמנויות» — the split the bottom nav shows
          customers. The hrefs stay written here so DashboardPlacementGuard
          still counts tab + row = 2 taps.
          Earlier: MEH-1102 removed the עריכת פרופיל card (duplicate of the
          עריכה tab); MEH-1357 the «הצגת העסק באתר» card (duplicate of the
          shell's «צפייה בדף»); MEH-1405 the cards open the manage lists. */}
      <div data-testid="tools-grid">
        <section data-testid="tools-group-offer">
          <h2 className={H2}>{t("quick_links.groups.offer_heading")}</h2>
          <div className={GRID}>
            <ToolGroupCard
              testId="tool-group-events"
              Icon={CalendarPlus}
              title={tNav("events")}
              sub={t("quick_links.groups.events_sub")}
              items={[
                { href: "/producer/dashboard/events", title: t("quick_links.manage_events.title"), sub: t("quick_links.manage_events.sub") },
                { href: "/producer/dashboard/experiences", title: t("quick_links.manage_experiences.title"), sub: t("quick_links.manage_experiences.sub") },
              ]}
            />
            {/* MEH-2649: bags are flag-gated — the route 404s while the pilot
                is off, so the row would be a dead link. With bags off the
                group holds one tool and the card links straight to it. */}
            <ToolGroupCard
              testId="tool-group-opportunities"
              Icon={UsersThree}
              title={tNav("opportunities")}
              sub={rescueOn ? t("quick_links.groups.opportunities_sub") : tType("group_buy")}
              items={[
                { href: "/producer/dashboard/group-buys", title: t("quick_links.group_buys.title"), sub: t("quick_links.group_buys.sub") },
                ...(rescueOn
                  ? [{ href: "/producer/dashboard/rescue", title: t("quick_links.rescue.title"), sub: t("quick_links.rescue.sub") }]
                  : []),
              ]}
              footer={lockedLine}
            />
          </div>
        </section>
        {/* MEH-2784 / MEH-1428: an unapproved business has no public page yet
            (producers.py:473 → 404) and the review-request endpoint 403s, so
            the whole group waits for approval. MEH-3107: the tile opens the
            dashboard's own reviews page. */}
        {approved && (
          <section data-testid="tools-group-reviews" className="mt-8">
            <h2 className={H2}>{t("quick_links.groups.reviews_heading")}</h2>
            <div className={GRID}>
              <Link href="/producer/dashboard/reviews" className={CARD}>
                <Star size={24} className="text-primary mb-2" aria-hidden="true" />
                <p className="font-headline-md text-lg font-bold mb-1">{t("quick_links.reviews.title")}<NewToolPill href="/producer/dashboard/reviews" /></p>
                <p className="text-sm text-fg-muted">{t("quick_links.reviews.sub")}</p>
              </Link>
            </div>
            <RequestReviewCard />
          </section>
        )}
        {/* MEH-590: producer recipes. MEH-3723: «הפרופיל בגוגל» moved to the
            edit tab's hub (GoogleProfileHubTile), next to the business details
            it checks. */}
        <section data-testid="tools-group-content" className="mt-8">
          <h2 className={H2}>{t("quick_links.groups.content_heading")}</h2>
          <div className={GRID}>
            <Link href="/producer/dashboard/recipes" className={CARD}>
              <CookingPot size={24} className="text-primary mb-2" aria-hidden="true" />
              <p className="font-headline-md text-lg font-bold mb-1">{t("quick_links.recipes.title")}<NewToolPill href="/producer/dashboard/recipes" /></p>
              <p className="text-sm text-fg-muted">{t("quick_links.recipes.sub")}</p>
            </Link>
          </div>
        </section>
      </div>

      {/* MEH-2882 PR 1 (placement audit 2026-11): sharing materials that are
          made once or now and then — the printable QR card (→ /qr-card) and
          «ערכת שיתוף» — live here, not on the daily home. Approved business
          only, never an organizer: the same gates the cards had on home. */}
      {/* MEH-2880 review: a failed profile fetch says so (same card copy and
          retry as home) instead of the section silently missing. */}
      {approved && !profile && profileError && (
        <div role="alert" data-testid="tools-share-error" className="mt-8 bg-surface border border-border rounded-lg p-5 text-center">
          <p className="text-fg-muted mb-3">{t("section_errors.profile")}</p>
          <Button variant="primary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
            {t("section_errors.retry_cta")}
          </Button>
        </div>
      )}
      {approved && profile && profile.kind !== "organizer" && (
        // scroll-mt clears the sticky header AND the sticky dashboard tab bar
        // (DashboardLayoutClient: top-[var(--chrome-top)]).
        <section id="share" data-testid="tools-share-section" className="mt-8 scroll-mt-[calc(var(--chrome-top,82px)+4rem)]">
          <h2 className={H2}>{tShare("quiet_label")}</h2>
          <BusinessQrCard
            producer={profile}
            isComplete={producerCompleteness(profile).missing.length === 0}
            isApproved={approved}
            isOrganizer={false}
          />
          <ShareKitSection profile={profile} />
        </section>
      )}
    </div>
  );
}
