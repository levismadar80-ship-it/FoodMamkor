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
 *           MEH-1428 chunk 2 (RequestReviewCard under the grid, approved only).
 *
 * Auth: producer-role guard via useAuth() — kept per-page until Phase 2.
 * RTL: logical properties only — see .claude/rules/rtl.md.
 */

import { rescueBagsEnabled } from "@/lib/rescue";
import { Link, useRouter } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ShoppingBag, CalendarPlus, UsersThree, CookingPot, Star, Sparkle } from "@phosphor-icons/react";
import api from "@/lib/api";
import Button from "@/components/ui/Button";
import { useAuth } from "@/lib/auth-context";
import RequestReviewCard from "@/components/producer/RequestReviewCard";
import BusinessQrCard from "@/components/producer/BusinessQrCard";
import ShareKitSection from "@/components/producer/ShareKitSection";
import { producerCompleteness } from "@/lib/producer-completeness";

export default function ProducerDashboardToolsPage() {
  const router = useRouter();
  const t = useTranslations("dashboard.producer");
  const tShare = useTranslations("share");
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
  const lockedLine = producer.status === "pending" && (
    <p data-testid="tool-locked-line" className="text-xs font-medium text-warning-800 mt-1">
      {t("quick_links.locked_until_approved")}
    </p>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      {/* MEH-2429: every other dashboard page has an h1; this one had none, so
          a screen reader landed on a page with no heading. The visible text is
          the existing nav label — no new copy. */}
      <h1 className="font-headline-lg text-xl font-bold text-text mb-6">{t("nav.tools")}</h1>
      {/* Quick links. MEH-1102: the עריכת פרופיל card was removed — after
          MEH-1095 it targeted /producer/dashboard/edit, duplicating the
          עריכה nav tab one row above. */}
      <div data-testid="tools-grid" className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* MEH-1405: card now opens the manage list (create is reachable there). */}
        <Link
          href="/producer/dashboard/events"
          className="bg-surface border border-border rounded-lg p-5 hover:border-primary transition"
        >
          <CalendarPlus size={24} className="text-primary mb-2" aria-hidden="true" />
          <p className="font-headline-md text-lg font-bold mb-1">{t("quick_links.manage_events.title")}</p>
          <p className="text-sm text-fg-muted">{t("quick_links.manage_events.sub")}</p>
        </Link>
        {/* MEH-1405: manage own experiences (list + edit + delete). */}
        <Link
          href="/producer/dashboard/experiences"
          className="bg-surface border border-border rounded-lg p-5 hover:border-primary transition"
        >
          <Sparkle size={24} className="text-primary mb-2" aria-hidden="true" />
          <p className="font-headline-md text-lg font-bold mb-1">{t("quick_links.manage_experiences.title")}</p>
          <p className="text-sm text-fg-muted">{t("quick_links.manage_experiences.sub")}</p>
        </Link>
        {/* MEH-1357: the "הצגת העסק באתר" card was removed here — it duplicated
            the persistent "צפייה בדף" link now in the dashboard shell nav
            (layout.js). Verdict Sapir 18/07 (MEH-999 dogfood). */}
        <Link
          href="/producer/dashboard/group-buys"
          className="bg-surface border border-border rounded-lg p-5 hover:border-primary transition"
        >
          <UsersThree size={24} className="text-primary mb-2" aria-hidden="true" />
          <p className="font-headline-md text-lg font-bold mb-1">{t("quick_links.group_buys.title")}</p>
          <p className="text-sm text-fg-muted">{t("quick_links.group_buys.sub")}</p>
          {lockedLine}
        </Link>
        {/* MEH-2649: the rescue-bags counter tool. The tile is flag-gated so
            the dashboard is unchanged until the pilot is switched on — the
            route itself 404s as well, this just avoids a dead link. */}
        {rescueBagsEnabled() && (
          <Link
            href="/producer/dashboard/rescue"
            data-testid="tools-rescue-tile"
            className="bg-surface border border-border rounded-lg p-5 hover:border-primary transition"
          >
            <ShoppingBag size={24} className="text-primary mb-2" aria-hidden="true" />
            <p className="font-headline-md text-lg font-bold mb-1">{t("quick_links.rescue.title")}</p>
            <p className="text-sm text-fg-muted">{t("quick_links.rescue.sub")}</p>
            {lockedLine}
          </Link>
        )}
        {/* MEH-590: producer recipes tab (chunk 3/4 of the producer-recipes epic). */}
        <Link
          href="/producer/dashboard/recipes"
          className="bg-surface border border-border rounded-lg p-5 hover:border-primary transition"
        >
          <CookingPot size={24} className="text-primary mb-2" aria-hidden="true" />
          <p className="font-headline-md text-lg font-bold mb-1">{t("quick_links.recipes.title")}</p>
          <p className="text-sm text-fg-muted">{t("quick_links.recipes.sub")}</p>
        </Link>
        {/* MEH-3107: the tile now opens the dashboard's own reviews page
            (unanswered first, reply in place) — MEH-1416's internal reply
            surface. Before that:
            MEH-1165 item 2: direct route to the public-page reviews section
            (id="reviews", ProducerSections.jsx:320) — the reply UI lives there
            and previously took 3+ taps via "הצגת העסק" + scroll.
            MEH-1357: candidate-to-move per Sapir's 18/07 verdict — documented
            only, no change now (full object-nav split is MEH-964 Phase 2). */}
        {/* MEH-2784: an unapproved business has no public page yet
            (producers.py:473 → 404), so the tile is hidden until approval,
            the same rule as RequestReviewCard below. */}
        {approved && (
        <Link
          href="/producer/dashboard/reviews"
          className="bg-surface border border-border rounded-lg p-5 hover:border-primary transition"
        >
          <Star size={24} className="text-primary mb-2" aria-hidden="true" />
          <p className="font-headline-md text-lg font-bold mb-1">{t("quick_links.reviews.title")}</p>
          <p className="text-sm text-fg-muted">{t("quick_links.reviews.sub")}</p>
        </Link>
        )}
      </div>
      {/* MEH-1428 chunk 2: the "request a review" link. Approved only — the
          endpoint 403s for any other status, and a pending business's public
          page does not exist yet, so the link would open a 404. */}
      {producer.status === "approved" && <RequestReviewCard />}

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
          <h2 className="font-headline-md text-lg font-bold text-text mb-4">{tShare("quiet_label")}</h2>
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
