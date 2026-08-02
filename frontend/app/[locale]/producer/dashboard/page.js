"use client";

import { Link as LocaleLink } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import { EnvelopeSimple, Eye, LockSimple, Sparkle, Warning, WhatsappLogo, X } from "@phosphor-icons/react";
// MEH-956: locale-aware Link for the load-error CTA — preserves the active
// locale on /contact (bare next/link drops it for `en` under as-needed).
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { detailToMessage } from "@/lib/errors";
import { showToast } from "@/lib/toast";
import { getUpcomingHoliday } from "@/lib/holidays";
import InfoTooltip from "@/components/InfoTooltip";
import WhatsThis from "@/components/WhatsThis";
import PhoneVerifyCard from "@/components/PhoneVerifyCard";
import ProfileCompletenessCard from "@/components/ProfileCompletenessCard";
import ChangesRequestedBanner from "./ChangesRequestedBanner";
import { producerCompleteness } from "@/lib/producer-completeness";
import { clampPercent } from "@/lib/percent";
// MEH-1267: canonical public domain (MEH-1242 PR4) — mehamakor.online is the
// staging alias, never public-facing. SITE_URL is the mehamakor.co.il origin.
import { SITE_URL, env } from "@/lib/env";

function VanityLinkCard({ slug }) {
  const t = useTranslations("dashboard.producer.vanity_link");
  const url = `${SITE_URL}/p/${slug}`;
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const waText = encodeURIComponent(
    t("wa_text_template", { url })
  );

  return (
    <div className="bg-white border border-border rounded-[16px] p-5 mb-6">
      <p className="text-sm font-medium text-text mb-2">{t("label")}</p>
      <div className="flex items-center gap-2 bg-green-50 rounded-[10px] px-3 py-2 mb-3">
        <span className="text-sm text-primary font-mono flex-1 truncate" dir="ltr">{url}</span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={copy}
          className="flex-1 text-sm border border-border rounded-[8px] px-3 py-1.5 hover:border-primary transition"
        >
          {copied ? t("copied") : t("copy_cta")}
        </button>
        <a
          href={`https://wa.me/?text=${waText}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-whatsapp-outline flex-1 text-sm text-center rounded-[8px] px-3 py-1.5"
        >
          {t("share_cta")}
        </a>
      </div>
    </div>
  );
}

/**
 * Module:   producer/dashboard/page (Overview / סקירה index)
 * Purpose:  The slim Overview index of the dashboard hub (MEH-964). Shows the
 *           at-a-glance surfaces: greeting, status banners, holiday hint,
 *           vanity link, availability toggle, completeness card, and the
 *           top-line 4-KPI strip + quiet conversion line (OverviewStatsHero).
 * Touches:  GET /producers/me/dashboard, /producers/me/analytics,
 *           /producers/me; POST /producers/me/availability-state.
 * Does NOT: render the deep analytics (windowed cards + charts) — those live
 *           in the insights tab (dashboard/insights/page.js); nor the edit
 *           forms (dashboard/edit) or quick links (dashboard/tools).
 * Related:  app/[locale]/producer/dashboard/layout.js (tab nav + UX gate);
 *           insights/page.js (deep analytics); backend producer_me.py:489.
 * History:  MEH-57 (analytics); MEH-288 (completeness); MEH-291 (availability);
 *           MEH-964 1A (hub split); MEH-964 1B (KPI strip + insights split);
 *           MEH-964 1C (anonymous activity pulse, §5 final spec).
 */
// MEH-1261 F2: shared inline error card for an Overview section whose fetch
// failed — visible message + retry, never a frozen loading line or a silently
// missing card. Kept quiet (bordered card, no red wash) — a section-level
// hiccup, not a page-level failure.
function SectionFetchError({ message, retryLabel, onRetry, testid }) {
  return (
    <div
      role="alert"
      data-testid={testid}
      className="bg-white border border-border rounded-[16px] p-4 mb-6 flex items-center justify-between gap-3"
    >
      <p className="text-sm text-fg-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="text-sm text-primary font-medium hover:underline shrink-0"
      >
        {retryLabel}
      </button>
    </div>
  );
}

// MEH-1355: support contact surface migrated from the removed /settings
// business tab (SupportModal). Reachable from the rejected + inactive status
// banners below — wa.me + mailto, same two-channel layout as the original.
function StatusSupportModal({ onClose }) {
  const t = useTranslations("dashboard.producer.status.support");
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("section_aria")}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-t-[24px] sm:rounded-[20px] w-full max-w-sm p-6 space-y-4">
        <h2 className="font-semibold text-text text-lg">{t("heading")}</h2>
        <p className="text-sm text-fg-muted">{t("body")}</p>
        <a
          href={`https://wa.me/${env.NEXT_PUBLIC_SUPPORT_PHONE || "972500000000"}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-[14px] border border-border px-4 py-3 hover:bg-green-50 transition"
        >
          <WhatsappLogo size={22} weight="fill" className="text-[#25D366] shrink-0" />
          <div>
            <p className="text-sm font-medium">{t("whatsapp_label")}</p>
            <p className="text-xs text-fg-muted">{t("whatsapp_hours")}</p>
          </div>
        </a>
        <a
          href="mailto:support@mehamakor.online"
          className="flex items-center gap-3 rounded-[14px] border border-border px-4 py-3 hover:bg-green-50 transition"
        >
          <EnvelopeSimple size={22} className="text-primary shrink-0" />
          <div>
            <p className="text-sm font-medium">{t("email_label")}</p>
            <p className="text-xs text-fg-muted">support@mehamakor.online</p>
          </div>
        </a>
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-[12px] text-sm font-medium text-fg-muted hover:text-text transition"
        >
          {t("close_cta")}
        </button>
      </div>
    </div>
  );
}

export default function ProducerDashboardPage() {
  const t = useTranslations("dashboard.producer");
  // MEH-1773: explainer for the availability card below. Its twin lives on the
  // order-window card in edit/page.js — the pair is the point, so if one moves
  // the other has to follow.
  const tWhat = useTranslations("whats_this");
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState(null);
  // MEH-956: track a failed dashboard fetch separately from the not-yet-loaded
  // `null` so a 404 (or any non-2xx) renders a graceful state instead of the
  // loading text forever.
  const [loadError, setLoadError] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [profile, setProfile] = useState(null);
  // MEH-1261 F2: analytics/profile fetch failures used to collapse into their
  // `null` loading states — analytics froze on "טעינת סטטיסטיקות..." forever
  // and the completeness card silently unmounted. Each section now tracks its
  // own error + retry attempt-counter and fails independently of the others.
  const [analyticsError, setAnalyticsError] = useState(false);
  const [analyticsAttempt, setAnalyticsAttempt] = useState(0);
  const [profileError, setProfileError] = useState(false);
  const [profileAttempt, setProfileAttempt] = useState(0);
  const [vacationUntil, setVacationUntil] = useState("");
  // MEH-999: reveal the return-date field the moment vacation is *selected*
  // (before the POST), breaking the chicken-and-egg where the field only
  // rendered once the server already carried state === "on_vacation".
  const [vacationSelected, setVacationSelected] = useState(false);
  const [vacationDateError, setVacationDateError] = useState("");
  // MEH-1355: support-contact modal, opened from the rejected + inactive banners.
  const [supportOpen, setSupportOpen] = useState(false);

  const AVAILABILITY_TOOLTIP = (
    <>
      {t("availability.tooltip_line_default")}
      <br />
      {t("availability.tooltip_line_today")}
      <br />
      {t("availability.tooltip_line_full")}
      <br />
      {t("availability.tooltip_line_vacation")}
    </>
  );

  useEffect(() => {
    if (authLoading) return;
    // MEH-964 chunk 1A: the dashboard layout owns the redirect for
    // non-producers; guard here only so we never fetch without a producer.
    if (!user || user.role !== "producer") return;
    // MEH-956: clear a prior error before re-fetching so a re-run (e.g. the
    // `user` ref changing after a silent re-auth) starts clean — otherwise a
    // stale loadError would keep the error card up even after a successful
    // re-fetch populates `data` (the loadError branch precedes `!data`).
    setLoadError(false);
    api.get("/producers/me/dashboard").then((r) => {
      setData(r.data);
      setVacationUntil(r.data?.producer?.vacation_until || "");
    }).catch(() => setLoadError(true));
  }, [user, authLoading]);

  // MEH-1261 F2: analytics + profile fetch in their own effects so each can be
  // retried independently (attempt counter) and a failure in one never hides
  // the other's data. Same auth guards as the dashboard fetch above.
  useEffect(() => {
    if (authLoading || !user || user.role !== "producer") return;
    setAnalyticsError(false);
    api.get("/producers/me/analytics")
      .then((r) => setAnalytics(r.data))
      .catch(() => { setAnalytics(null); setAnalyticsError(true); });
  }, [user, authLoading, analyticsAttempt]);

  useEffect(() => {
    if (authLoading || !user || user.role !== "producer") return;
    setProfileError(false);
    api.get("/producers/me")
      .then((r) => setProfile(r.data))
      .catch(() => { setProfile(null); setProfileError(true); });
  }, [user, authLoading, profileAttempt]);

  // MEH-291 Phase 3 — unified 4-value availability enum. Replaces the
  // old toggleAvailability + setAvailabilityStatus pair. Backend
  // dual-writes to the legacy is_available_today + availability_status
  // columns during the 7-day overlap; Phase 4 drops them.
  const setAvailabilityState = async (state) => {
    // MEH-999: client guard — on_vacation must carry a return date. Block the
    // POST here and surface an inline message instead of a 422 round-trip
    // (mirrors availability_validation.resolve_vacation_until:85-86 intent).
    if (state === "on_vacation" && !vacationUntil) {
      setVacationDateError(t("availability.vacation_date_required"));
      return;
    }
    setVacationDateError("");
    // Optimistic update so the radio lights up immediately on click.
    setData((prev) =>
      prev
        ? {
            ...prev,
            producer: { ...prev.producer, availability_state: state },
          }
        : prev,
    );
    try {
      const body = { state };
      if (state === "on_vacation" && vacationUntil) body.vacation_until = vacationUntil;
      await api.post("/producers/me/availability-state", body);
      // MEH-1445: confirm the successful write with a toast (mirrors the
      // error-path showToast.error below). Vacation carries the return date.
      if (state === "on_vacation") {
        showToast.success(t("availability.saved_vacation", { date: vacationUntil }));
      } else {
        showToast.success(t("availability.saved"));
      }
      // MEH-999: the write is committed — drop the "selected-but-unconfirmed"
      // flag so the mini-form is now driven purely by the saved server state
      // (on failure we intentionally keep it set below, so the form stays open
      // for the producer to correct the date rather than vanishing).
      setVacationSelected(false);
      if (state !== "on_vacation") setVacationUntil("");
    } catch (err) {
      // MEH-989: surface the backend's Hebrew detail (e.g. missing vacation
      // date → 422, rate limit → 429); fall back to generic only when absent.
      // detailToMessage (MEH-957) normalises the FastAPI 422 array shape so a
      // validation error never renders as "[object Object]".
      // MEH-1092: native alert() → toast (matches recipes/page.js; anti-pattern
      // retired for admin in MEH-1023/1040).
      showToast.error(detailToMessage(err?.response?.data?.detail) || t("error_availability_update"));
      // Refetch on failure so the UI doesn't stay out of sync.
      api
        .get("/producers/me/dashboard")
        .then((r) => setData(r.data))
        .catch(() => {});
    }
  };

  if (authLoading || !user || user.role !== "producer") return null;
  // MEH-956: graceful state on a failed dashboard fetch (404 / non-2xx).
  // Mirrors the status-banner cards in the main return. Must precede the
  // `!data` loading branch so an error never falls through to loading text.
  if (loadError) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16">
        <div
          data-testid="dashboard-load-error"
          className="bg-white border border-border rounded-[16px] p-6 text-center"
          role="alert"
        >
          <p className="font-headline-md text-xl font-bold text-text mb-2">
            {t("load_error.title")}
          </p>
          <p className="text-fg-muted mb-4">
            {t("load_error.body")}
          </p>
          <LocaleLink
            href="/contact"
            data-testid="dashboard-load-error-cta"
            className="inline-block bg-primary text-white px-4 py-2 rounded-[10px] text-sm font-medium hover:bg-primary-dark transition"
          >
            {t("load_error.cta")}
          </LocaleLink>
        </div>
      </div>
    );
  }
  // Loading text only while the request is genuinely in flight.
  if (!data) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center text-fg-muted">
        {t("loading_data")}
      </div>
    );
  }

  const { producer } = data;

  // MEH-964 chunk 1A — decoupled state signals the Overview is built around.
  // These two signals are independent on purpose:
  //   setup emphasis  ← completeness (owner-controllable fields)
  //   KPI-vs-empty    ← activity (>=1 profile view / whatsapp click ever)
  // plus `isApproved` for the share-gate + availability-disable. 1B (KPI strip)
  // and 1D (empty-states / share-gate / availability-disable) build on these;
  // 1A only computes them and surfaces them as data-* hooks for QA + E2E.
  const isComplete = profile
    ? producerCompleteness(profile).missing.length === 0
    : false;
  const hasActivity =
    (analytics?.profile_views?.total ?? 0) > 0 ||
    (analytics?.whatsapp_clicks?.total ?? 0) > 0;
  const isApproved = producer.status === "approved";

  // MEH-1134: state-aware card order. While the business is pending OR the
  // completeness heuristic still reports missing fields, the completeness
  // card is the owner's only actionable surface — it mounts directly below
  // the status banners, ABOVE the (pre-approval disabled) availability card
  // (GBP Profile Strength pattern). Once approved AND complete, today's
  // order stands — availability first, the daily action of a live business.
  const completenessFirst = !isApproved || !isComplete;

  return (
    <div
      className="max-w-5xl mx-auto px-4 py-12"
      data-testid="producer-overview"
      data-state-complete={isComplete}
      data-state-active={hasActivity}
      data-state-approved={isApproved}
    >
      <h1 className="font-headline-lg text-4xl font-bold text-text mb-2">
        {t("greeting", { name: user.name })}
      </h1>
      <p className="text-fg-muted mb-3">
        {/* MEH-1347: the message uses a <business> RICH TAG, not a {business}
            ICU argument — passing a render function for an argument placeholder
            is silently dropped by next-intl/React, which left the subtitle
            dangling at "…העסק של". Generic fallback when the name is absent. */}
        {producer.name
          ? t.rich("welcome_subtitle", {
              business: (chunks) => <span className="font-semibold">{chunks}</span>,
              name: producer.name,
            })
          : t("welcome_subtitle_generic")}
      </p>

      {/* MEH-964 1D: one-tap view-public. LocaleLink keeps the active locale
          (MEH-956) on /[slug]; target=_blank so the owner previews the live
          page without losing the dashboard. */}
      {producer.slug && (
        <LocaleLink
          href={`/${producer.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="view-public-link"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mb-8"
        >
          <Eye size={16} aria-hidden="true" />
          {t("states.view_public")}
        </LocaleLink>
      )}

      {/* MEH-1025 Chunk B: admin completion-request banner. Renders only when
          requested_changes is set; the CTA routes to the edit tab. */}
      <ChangesRequestedBanner profile={profile} />

      {/* MEH-1025 Chunk B: suppress the generic "ממתין לאישור" notice when a
          request-changes is pending — the specific "נשאר להשלים" banner above
          IS the message, and "awaiting approval" would contradict it (the ball
          is in the owner's court). Both otherwise stack on a pending producer. */}
      {producer.status === "pending" && !profile?.requested_changes && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-[16px] p-4 mb-6 text-sm" role="status">
          <p className="font-semibold text-yellow-800 mb-1">{t("status.pending.title")}</p>
          {/* MEH-1347: informational only — the completeness card below owns
              the single "השלימו פרופיל" CTA (audit found two clashing CTAs
              with opposite arrows on one screen). */}
          <p className="text-yellow-700">
            {t("status.pending.body")}
          </p>
        </div>
      )}

      {/* MEH-1355: rejected banner absorbs the deltas from the removed /settings
          business tab — the admin rejection_reason (from /auth/me, rendered as-is
          like ChangesRequestedBanner's requested_changes) plus the 3 fix-it tips,
          and a support entry (wa.me + mailto) in place of the bare /contact link. */}
      {producer.status === "rejected" && (
        <div
          className="bg-red-50 border border-red-200 rounded-[16px] p-4 mb-6 text-sm space-y-3"
          role="alert"
          data-testid="status-rejected-banner"
        >
          <p className="font-semibold text-red-800">{t("status.rejected.title")}</p>
          {user.producer_rejection_reason && (
            <p className="text-red-600" data-testid="status-rejected-reason">
              {user.producer_rejection_reason}
            </p>
          )}
          <p className="text-red-700">{t("status.rejected.body")}</p>
          <ul className="space-y-1 text-red-700">
            <li className="flex items-start gap-2"><span aria-hidden="true">•</span><span>{t("status.rejected.tip_details")}</span></li>
            <li className="flex items-start gap-2"><span aria-hidden="true">•</span><span>{t("status.rejected.tip_photos")}</span></li>
            <li className="flex items-start gap-2"><span aria-hidden="true">•</span><span>{t("status.rejected.tip_address")}</span></li>
          </ul>
          <button
            type="button"
            onClick={() => setSupportOpen(true)}
            className="text-primary hover:underline font-medium"
            data-testid="status-rejected-support"
          >
            {t("status.rejected.support_cta")}
          </button>
        </div>
      )}

      {/* MEH-1355: inactive banner migrated from the removed /settings business
          tab. Matches the literal "inactive" the admin toggle emits
          (admin.py:332) — the old settings tab checked a status the backend
          never emits, so its banner was dead code. */}
      {producer.status === "inactive" && (
        <div
          className="bg-amber-50 border border-amber-200 rounded-[16px] p-4 mb-6 text-sm space-y-3"
          role="alert"
          data-testid="status-inactive-banner"
        >
          <p className="font-semibold text-amber-800 flex items-center gap-2">
            <Warning size={18} weight="fill" aria-hidden="true" />
            {t("status.inactive.title")}
          </p>
          <p className="text-amber-700">{t("status.inactive.body")}</p>
          <button
            type="button"
            onClick={() => setSupportOpen(true)}
            className="text-primary hover:underline font-medium"
            data-testid="status-inactive-support"
          >
            {t("status.inactive.support_cta")}
          </button>
        </div>
      )}

      {producer.status === "pending_whatsapp" && (
        <div className="bg-primary/5 border border-primary/20 rounded-[16px] p-4 mb-6 text-sm">
          <p className="font-semibold text-primary mb-1">{t("status.pending_whatsapp.title")}</p>
          <p className="text-fg-muted">
            {t("status.pending_whatsapp.body")}
          </p>
          {/* MEH-745: the OTP card replaces the old dead /settings CTA — a
              successful confirm flips status to pending without a reload. */}
          <PhoneVerifyCard
            onVerified={() =>
              setData((prev) =>
                prev
                  ? { ...prev, producer: { ...prev.producer, status: "pending" } }
                  : prev,
              )
            }
          />
        </div>
      )}

      {/* MEH-1134: completeness-first while pending/incomplete — the single
          mount for that state (the mirror-gated mount below covers the
          approved+complete state, so the card renders exactly once). */}
      {completenessFirst && profile && <ProfileCompletenessCard producer={profile} />}
      {/* MEH-1261 F2: profile fetch failed → say so where the completeness
          card would render (completenessFirst is true when profile is null). */}
      {completenessFirst && !profile && profileError && (
        <SectionFetchError
          message={t("section_errors.profile")}
          retryLabel={t("section_errors.retry_cta")}
          onRetry={() => setProfileAttempt((n) => n + 1)}
          testid="dashboard-profile-error"
        />
      )}

      {/* MEH-55: holiday hint — shown 14 days before and during a holiday */}
      {(() => {
        const h = getUpcomingHoliday();
        if (!h) return null;
        return (
          <div
            className="rounded-[16px] p-4 mb-6 text-sm flex items-start gap-3"
            style={{ backgroundColor: h.color + "15", border: `1.5px solid ${h.color}35` }}
          >
            <span className="text-xl shrink-0" aria-hidden="true">{h.emoji}</span>
            <div>
              <p className="font-semibold text-text">{h.dashboardHint}</p>
              <LocaleLink
                href="/producer/dashboard"
                className="text-xs mt-1 inline-block hover:underline"
                style={{ color: h.color }}
              >
                {t("holiday_catalog_cta")}
              </LocaleLink>
            </div>
          </div>
        );
      })()}

      {/* MEH-53: Vanity URL card. MEH-964 1D share-gate: the shareable link
          surfaces ONLY when the profile is complete AND approved — sharing an
          unpublished/incomplete page sends visitors to a dead listing. When
          locked, a warm why-locked hint takes its place (not silent hiding). */}
      {producer.slug && isComplete && isApproved ? (
        <VanityLinkCard slug={producer.slug} />
      ) : producer.slug ? (
        <div
          data-testid="share-locked-hint"
          className="bg-white border border-border rounded-[16px] p-5 mb-6 flex items-center gap-3"
        >
          <LockSimple size={18} className="text-fg-muted shrink-0" aria-hidden="true" />
          <p className="text-sm text-fg-muted">{t("states.share_locked")}</p>
        </div>
      ) : null}

      {/* MEH-291 Phase 3 — unified availability card. Replaces the old
          "זמין היום" hero + "סטטוס זמינות" pill row. 4-value durable
          enum. Backend dual-writes to legacy columns during the 7-day
          overlap (Phase 4 drops them). */}
      <div className="bg-white border border-border rounded-[16px] p-6 mb-8">
        <p className="text-sm uppercase tracking-wider text-fg-muted mb-1">
          {/* MEH-1842: the id sits on a span around the heading TEXT, not on the
              <p>. The <p> also contains InfoTooltip, whose trigger is a button
              with its own aria-label ("מה ההבדל בין המצבים?") — labelling the
              radiogroup from the <p> would fold that into the computed name and
              yield "מצב נוכחי מה ההבדל בין המצבים?". Measured, not assumed. */}
          <span id="availability-heading">{t("availability.heading")}</span>
          <InfoTooltip content={AVAILABILITY_TOOLTIP} label={t("availability.info_label")} position="bottom" />
        </p>
        <p className="text-fg-muted text-sm mb-4">
          {t("availability.intro")}
        </p>
        {/* MEH-1773: owners could not tell "זמינות" from "חלון הזמנות" — both
            read as "when am I open". This says the half that is only true
            here: temporary, manual, an exception. The other half is stated on
            the order-window card in edit/page.js. */}
        <WhatsThis
          content={tWhat("availability")}
          className="mb-2"
          testId="whats-this-availability"
        />
        <div
          role="radiogroup"
          // MEH-1842: derived from the visible heading rather than a parallel
          // string. The old aria-label read "מצב זמינות" — the pre-MEH-1830
          // name — so the accessible name and the visible one had drifted apart,
          // which is the failure mode WCAG 2.5.3 exists for. Deriving it means
          // they cannot drift again; the group_aria key is now deleted.
          aria-labelledby="availability-heading"
          aria-describedby={!isApproved ? "availability-disabled-hint" : undefined}
          className="flex flex-wrap gap-2"
        >
          {[
            { value: "accepting_orders", color: "#22c55e" },
            { value: "available_today",  color: "#2e6853" },
            { value: "full_this_week",   color: "#f97316" },
            { value: "on_vacation",      color: "#9ca3af" },
          ].map((opt) => {
            const savedState = producer.availability_state || "accepting_orders";
            const isVacation = opt.value === "on_vacation";
            // MEH-999: while vacation is selected-but-not-yet-confirmed, only the
            // vacation radio reads active so the group never lights up two.
            const active = isVacation
              ? vacationSelected || savedState === "on_vacation"
              : !vacationSelected && savedState === opt.value;
            // MEH-1092 F4: pre-approval the pills are already disabled, but the
            // saved state still read as "live" (bg-primary active fill). Show the
            // pills NEUTRAL (no active highlight, aria-checked=false) until the
            // business is approved, so a locked block never reads as an active
            // status in the air. Post-approval is unchanged.
            const showActive = active && isApproved;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={showActive}
                // MEH-964 1D: availability is disabled until the business is
                // published (approved) — an unpublished listing has no public
                // surface for the state to affect. Hint below carries the why.
                disabled={!isApproved}
                onClick={() => {
                  if (isVacation) {
                    // Reveal the date field first; defer the POST to the
                    // combined mini-form below so it always carries a date.
                    setVacationSelected(true);
                    setVacationDateError("");
                  } else {
                    setVacationSelected(false);
                    setAvailabilityState(opt.value);
                  }
                }}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-[12px] text-sm font-medium transition border focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  showActive
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-text border-border hover:bg-green-50"
                } ${!isApproved ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    display: "inline-block",
                    background: opt.color,
                    flexShrink: 0,
                  }}
                />
                {t(`availability.options.${opt.value}`)}
              </button>
            );
          })}
        </div>
        {/* MEH-964 1D: why-locked hint, associated with the radiogroup via
            aria-describedby so it's announced (not colour/opacity-only). */}
        {!isApproved && (
          <p id="availability-disabled-hint" data-testid="availability-disabled-hint" className="text-xs text-fg-muted mt-3">
            {t("states.availability_disabled")}
          </p>
        )}
        {/* MEH-999: reachable as soon as vacation is selected — not gated on the
            server already being on_vacation — so the return date can be picked
            and submitted together (combined mini-form). */}
        {(vacationSelected || (producer.availability_state || "accepting_orders") === "on_vacation") && (
          <div className="mt-4">
            <div className="flex items-center gap-3 flex-wrap">
              <label htmlFor="vacation-until" className="text-sm text-fg-muted whitespace-nowrap">
                {t("availability.vacation_return_label")}
              </label>
              <input
                id="vacation-until"
                type="date"
                value={vacationUntil}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => { setVacationUntil(e.target.value); setVacationDateError(""); }}
                className="border border-border rounded-[8px] px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                dir="ltr"
                aria-invalid={vacationDateError ? "true" : undefined}
                aria-describedby={vacationDateError ? "vacation-until-error" : undefined}
              />
              {vacationUntil && (
                <button
                  type="button"
                  onClick={() => { setVacationUntil(""); setVacationDateError(""); }}
                  className="text-fg-muted hover:text-red-600 transition inline-flex"
                  aria-label={t("availability.remove_vacation_date_aria")}
                >
                  <X size={14} weight="bold" aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setAvailabilityState("on_vacation")}
                className="px-4 py-1.5 rounded-[10px] text-sm font-medium bg-primary text-white border border-primary hover:bg-primary/90 transition focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                {t("availability.vacation_confirm")}
              </button>
            </div>
            {vacationDateError && (
              <p id="vacation-until-error" role="alert" className="mt-2 text-sm text-red-600">
                {vacationDateError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* MEH-288: profile-completeness card — surfaces the existing
          producerCompleteness() heuristic to the owner, above the analytics
          stats. Guarded on `profile` (the full /producers/me record carries
          the fields the heuristic reads). MEH-1134: this slot served the
          approved+complete state; MEH-1397 removes it — once the business is
          approved AND complete the collapsed "הפרופיל מלא ✓" card is noise with
          no action (reverses MEH-288's "never fully disappears", per Sapir
          21/07). The card now mounts ONLY in the completenessFirst slot above
          (pending OR incomplete), where the green collapse still gives value
          ("סיימת הכל, מחכים לאישור" while complete-but-pending). */}

      {/* MEH-964 1B: locked top-line 4-KPI strip + quiet conversion line.
          Deep analytics (windowed cards + charts) live in the insights tab
          (dashboard/insights); these KPIs render only here (FLAG-1 — never
          duplicated in insights/).
          MEH-964 1D: when there's no activity yet (data-state-active=false),
          a warm zero-state replaces the 2×2 wall-of-zeros so a brand-new owner
          sees an invitation, not four zeros. hasActivity per the 1A definition
          (views||whatsapp, rating excluded). */}
      {!analytics ? (
        analyticsError ? (
          // MEH-1261 F2: a failed analytics fetch used to leave the loading
          // line up forever — surface it + retry instead.
          <SectionFetchError
            message={t("section_errors.analytics")}
            retryLabel={t("section_errors.retry_cta")}
            onRetry={() => setAnalyticsAttempt((n) => n + 1)}
            testid="dashboard-analytics-error"
          />
        ) : (
          <p className="text-sm text-fg-muted mb-8">{t("loading_analytics")}</p>
        )
      ) : hasActivity ? (
        <OverviewStatsHero analytics={analytics} />
      ) : (
        // MEH-1345: this zero-state and ActivityPulse's rendered the SAME
        // title-less copy — two identical anonymous cards on a fresh
        // dashboard. Each now carries its own visible title + purpose-
        // specific copy.
        <div
          data-testid="overview-zero-state"
          className="bg-white border border-border rounded-[16px] p-6 mb-8"
        >
          <p className="font-semibold text-text mb-1">{t("states.zero_activity_title")}</p>
          <div className="flex items-center gap-3">
            <Sparkle size={20} weight="fill" className="text-primary shrink-0" aria-hidden="true" />
            <p className="text-sm text-fg-muted">{t("states.zero_activity")}</p>
          </div>
        </div>
      )}

      {/* MEH-964 1C: anonymous activity pulse (§5 final spec) — renders only
          once analytics resolved (no separate loading line; the strip above
          already narrates the in-flight state). */}
      {analytics && <ActivityPulse analytics={analytics} />}

      {/* MEH-964 1A: quick-links grid relocated to the tools tab
          (dashboard/tools); the bio / custom-questions / contact-channels
          edit forms relocated to the edit tab (dashboard/edit). 1B swapped the
          Overview analytics for the lean KPI strip and moved the deep charts
          to the insights tab. */}

      {/* MEH-1355: shared support modal for the rejected + inactive banners. */}
      {supportOpen && <StatusSupportModal onClose={() => setSupportOpen(false)} />}
    </div>
  );
}

// ============================================================
// MEH-964 1B: locked top-line 4-KPI strip + quiet conversion line.
// RTL order (right->left): WhatsApp leads -> contact clicks -> rating ->
// views. 2x2 grid, identical mobile + desktop. Uniform "last 7 days" window
// label, NO per-KPI deltas/arrows — the analytics payload has no per-metric
// prior-period counts (only views had a categorical trend), so the AC's
// "labeled deltas" is superseded by data reality and deferred to a backend
// follow-up. The DEEP analytics (windowed cards + charts) live in the
// insights tab (dashboard/insights); the top-line KPIs render ONLY here
// (FLAG-1 — never duplicated in insights/). The eligibility badge is kept
// here (status/recognition signal, belongs on the at-a-glance Overview).
// ============================================================

// ============================================================
// MEH-964 1C: anonymous activity pulse (§5 FINAL SPEC, design round-4).
// Aggregate counts from /producers/me/analytics ONLY — no names, no message
// text, no per-row city, no per-row CTA/handled state (the conversation lives
// off-platform in WhatsApp; a named inbox has no data source).
// Rulings (Sapir, 03/07):
//   - Reviews row DROPPED — the payload has only lifetime total_reviews (no
//     windowed count), so a "new review" row would be a false recency claim
//     (§5 honesty clause) and a lifetime row duplicates the rating KPI
//     (FLAG-1). Returns with MEH-966 (per-event feed).
//   - Rows = 2 event types in fixed locked order (whatsapp -> view), each
//     gated on its own last_7d > 0. NO per-row relative times (never
//     rendered) — the payload has no per-event timestamps. Uniform 7-day frame.
//   - Hero binds to whatsapp_clicks.last_7d, NOT .total — the "new" claim
//     must be truthful. last_7d == 0 -> no hero; both metrics 0 -> zero-state.
// Card sizes to rows.length (0/1/2 collapse — no fixed-count padding). ONE
// section-level CTA -> wa.me (gated with the hero on whatsapp last_7d > 0:
// a reply CTA with zero inquiries would be the same false claim).
// ============================================================

function ActivityPulse({ analytics }) {
  const t = useTranslations("dashboard.producer.pulse");
  const waCount = analytics.whatsapp_clicks?.last_7d ?? 0;
  const viewCount = analytics.profile_views?.last_7d ?? 0;

  // Fixed locked order: whatsapp -> view. Each row is an anonymous event-TYPE
  // presence signal, not a count — counts live in the KPI strip (FLAG-1).
  const rows = [
    { key: "whatsapp", count: waCount, Icon: WhatsappLogo },
    { key: "view", count: viewCount, Icon: Eye },
  ].filter((row) => row.count > 0);

  return (
    <section
      data-testid="activity-pulse"
      aria-label={t("section_aria")}
      className="bg-white border border-border rounded-[16px] p-6"
    >
      {rows.length === 0 ? (
        // MEH-1345: visible title so the empty pulse card is identifiable
        // (was an anonymous line identical to the stats zero-state above).
        <div data-testid="activity-pulse-empty">
          <p className="font-semibold text-text mb-1">{t("title")}</p>
          <p className="text-sm text-fg-muted">{t("zero_state")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {waCount > 0 && (
            <p
              data-testid="activity-pulse-hero"
              className="font-headline-md text-lg font-bold text-text"
            >
              {t("hero", { count: waCount })}
            </p>
          )}
          <ul className="space-y-2">
            {rows.map(({ key, Icon }) => (
              <li
                key={key}
                data-testid={`activity-pulse-row-${key}`}
                className="flex items-center gap-3 text-sm text-text"
              >
                <Icon size={18} className="text-primary shrink-0" aria-hidden="true" />
                {t(`rows.${key}`)}
              </li>
            ))}
          </ul>
          <p className="text-xs text-fg-muted">{t("window_7d")}</p>
          {waCount > 0 && (
            <a
              href="https://wa.me/"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="activity-pulse-cta"
              className="btn-whatsapp inline-flex items-center justify-center gap-2 min-h-[44px] px-6 rounded-full text-sm font-medium"
            >
              <WhatsappLogo size={18} weight="fill" aria-hidden="true" />
              {t("cta")}
            </a>
          )}
        </div>
      )}
    </section>
  );
}

function OverviewStatsHero({ analytics }) {
  const t = useTranslations("dashboard.producer.analytics");
  const {
    profile_views,
    whatsapp_clicks,
    contact_clicks,
    average_rating,
    total_reviews,
    rank_in_city,
    conversion_rate,
    profile_strength,
  } = analytics;

  const eligibleForWeekly = profile_strength >= 80 && rank_in_city === 1;

  // DOM order == locked RTL order; the dir="rtl" page lays the 2-col grid out
  // right->left, so kpis[0] renders top-right and reading flows as locked.
  const kpis = [
    { key: "whatsapp_leads", value: whatsapp_clicks?.last_7d ?? 0, sub: t("kpi.window_7d") },
    { key: "contact_clicks", value: contact_clicks?.last_7d ?? 0, sub: t("kpi.window_7d") },
    { key: "rating", value: average_rating ? average_rating.toFixed(1) : "—", sub: t("kpi.rating_sub", { count: total_reviews ?? 0 }) },
    { key: "views", value: profile_views?.last_7d ?? 0, sub: t("kpi.window_7d") },
  ];

  return (
    <div className="space-y-4 mb-10">
      {/* 2x2 KPI strip — identical mobile + desktop, uniform window label,
          no deltas/arrows (data reality; see header). */}
      <div className="grid grid-cols-2 gap-3">
        {kpis.map((kpi) => (
          <div key={kpi.key} className="bg-white border border-border rounded-[16px] p-4 text-center">
            <p className="text-xs text-fg-muted mb-1">{t(`kpi.${kpi.key}`)}</p>
            <p className="font-headline-lg text-3xl font-bold text-primary">{kpi.value}</p>
            <p className="text-xs text-fg-muted mt-1">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Quiet conversion line — whatsapp / views (30d), the existing
          conversion_rate (producer_me.py:634), whatsapp-only. Secondary,
          tinted, not a card. */}
      <p className="text-sm text-fg-muted text-center">
        {/* MEH-1118: clamp to ≤100% — WhatsApp clicks aren't a strict subset of
            page views (card/map CTAs count without a view), so the raw ratio
            could read "133.3% מהצופות פנו אלייך". */}
        {t("kpi.conversion_line", { rate: clampPercent(conversion_rate) })}
      </p>

      {/* "Business of the week" eligibility badge — kept on the Overview
          (status/recognition signal, not deep analytics; MEH-57). */}
      {eligibleForWeekly && (
        <div className="bg-primary/10 border border-primary/25 rounded-[16px] p-4 flex items-center gap-3">
          <Sparkle size={24} weight="fill" className="text-primary" aria-hidden="true" />
          <div>
            <p className="font-semibold text-primary text-sm">
              {t("eligible_weekly_title")}
              <InfoTooltip content={t("eligible_weekly_tooltip")} />
            </p>
            <p className="text-xs text-fg-muted">{t("eligible_weekly_sub")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
