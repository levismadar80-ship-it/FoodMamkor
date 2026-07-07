"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, LockSimple, Sparkle, WhatsappLogo, X } from "@phosphor-icons/react";
// MEH-956: locale-aware Link for the load-error CTA — preserves the active
// locale on /contact (bare next/link drops it for `en` under as-needed).
import { Link as LocaleLink } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { detailToMessage } from "@/lib/errors";
import { getUpcomingHoliday } from "@/lib/holidays";
import InfoTooltip from "@/components/InfoTooltip";
import PhoneVerifyCard from "@/components/PhoneVerifyCard";
import ProfileCompletenessCard from "@/components/ProfileCompletenessCard";
import { producerCompleteness } from "@/lib/producer-completeness";

function VanityLinkCard({ slug }) {
  const t = useTranslations("dashboard.producer.vanity_link");
  const url = `https://mehamakor.online/p/${slug}`;
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
export default function ProducerDashboardPage() {
  const t = useTranslations("dashboard.producer");
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState(null);
  // MEH-956: track a failed dashboard fetch separately from the not-yet-loaded
  // `null` so a 404 (or any non-2xx) renders a graceful state instead of the
  // loading text forever.
  const [loadError, setLoadError] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [profile, setProfile] = useState(null);
  const [vacationUntil, setVacationUntil] = useState("");
  // MEH-999: reveal the return-date field the moment vacation is *selected*
  // (before the POST), breaking the chicken-and-egg where the field only
  // rendered once the server already carried state === "on_vacation".
  const [vacationSelected, setVacationSelected] = useState(false);
  const [vacationDateError, setVacationDateError] = useState("");

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
    api.get("/producers/me/analytics").then((r) => setAnalytics(r.data)).catch(() => setAnalytics(null));
    api.get("/producers/me").then((r) => setProfile(r.data)).catch(() => setProfile(null));
  }, [user, authLoading]);

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
      // validation error never renders as "[object Object]" via alert().
      alert(detailToMessage(err?.response?.data?.detail) || t("error_availability_update"));
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
        {t.rich("welcome_subtitle", {
          business: () => <span className="font-semibold">{producer.name}</span>,
        })}
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

      {producer.status === "pending" && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-[16px] p-4 mb-6 text-sm" role="status">
          <p className="font-semibold text-yellow-800 mb-1">{t("status.pending.title")}</p>
          <p className="text-yellow-700 mb-3">
            {t("status.pending.body")}
          </p>
          <Link
            href="/settings"
            className="inline-block bg-yellow-700 text-white px-4 py-2 rounded-[10px] text-xs font-medium hover:bg-yellow-800 transition"
          >
            {t("status.pending.cta")}
          </Link>
        </div>
      )}

      {producer.status === "rejected" && (
        <div className="bg-red-50 border border-red-200 rounded-[16px] p-4 mb-6 text-sm" role="alert">
          <p className="font-semibold text-red-800 mb-1">{t("status.rejected.title")}</p>
          <p className="text-red-700 mb-3">
            {t("status.rejected.body")}
          </p>
          <Link
            href="/contact"
            className="inline-block bg-red-700 text-white px-4 py-2 rounded-[10px] text-xs font-medium hover:bg-red-800 transition"
          >
            {t("status.rejected.cta")}
          </Link>
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
              <Link
                href="/producer/dashboard"
                className="text-xs mt-1 inline-block hover:underline"
                style={{ color: h.color }}
              >
                {t("holiday_catalog_cta")}
              </Link>
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
          {t("availability.heading")}
          <InfoTooltip content={AVAILABILITY_TOOLTIP} label={t("availability.info_label")} position="bottom" />
        </p>
        <p className="text-fg-muted text-sm mb-4">
          {t("availability.intro")}
        </p>
        <div
          role="radiogroup"
          aria-label={t("availability.group_aria")}
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
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
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
                  active
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
          the fields the heuristic reads). */}
      {profile && <ProfileCompletenessCard producer={profile} />}

      {/* MEH-964 1B: locked top-line 4-KPI strip + quiet conversion line.
          Deep analytics (windowed cards + charts) live in the insights tab
          (dashboard/insights); these KPIs render only here (FLAG-1 — never
          duplicated in insights/).
          MEH-964 1D: when there's no activity yet (data-state-active=false),
          a warm zero-state replaces the 2×2 wall-of-zeros so a brand-new owner
          sees an invitation, not four zeros. hasActivity per the 1A definition
          (views||whatsapp, rating excluded). */}
      {!analytics ? (
        <p className="text-sm text-fg-muted mb-8">{t("loading_analytics")}</p>
      ) : hasActivity ? (
        <OverviewStatsHero analytics={analytics} />
      ) : (
        <div
          data-testid="overview-zero-state"
          className="bg-white border border-border rounded-[16px] p-6 mb-8 flex items-center gap-3"
        >
          <Sparkle size={20} weight="fill" className="text-primary shrink-0" aria-hidden="true" />
          <p className="text-sm text-fg-muted">{t("states.zero_activity")}</p>
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
        <p data-testid="activity-pulse-empty" className="text-sm text-fg-muted">
          {t("zero_state")}
        </p>
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
        {t("kpi.conversion_line", { rate: conversion_rate })}
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
