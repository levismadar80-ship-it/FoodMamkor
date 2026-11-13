"use client";

import { Link as LocaleLink } from "@/i18n/navigation";
import { useEffect, useState, useRef } from "react";
import useDialogFocus from "@/hooks/useDialogFocus";
import { EnvelopeSimple, Eye, LockSimple, ShoppingBag, Sparkle, Warning, WhatsappLogo, X } from "@phosphor-icons/react";
// MEH-956: locale-aware Link for the load-error CTA — preserves the active
// locale on /contact (bare next/link drops it for `en` under as-needed).
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { detailToMessage } from "@/lib/errors";
import { israelToday } from "@/lib/israel-date";
import { showToast } from "@/lib/toast";
import { getUpcomingHoliday } from "@/lib/holidays";
import HolidayIcon from "@/components/HolidayIcon";
import ProfileCompletenessCard from "@/components/ProfileCompletenessCard";
import DraftSubmitBanner from "@/components/producer/DraftSubmitBanner";
import ChangesRequestedBanner from "./ChangesRequestedBanner";
import RejectedBanner from "./RejectedBanner";
import { producerCompleteness } from "@/lib/producer-completeness";
// MEH-1267: canonical public domain (MEH-1242 PR4) — mehamakor.online is the
// staging alias, never public-facing. SITE_URL is the mehamakor.co.il origin.
import { SITE_URL, env } from "@/lib/env";
import { shareOrCopy } from "@/lib/share-link";
import { rescueBagsEnabled } from "@/lib/rescue";
import Button from "@/components/ui/Button";

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

  // MEH-2827 PR 8: «שתפו» opens the phone's own share sheet — Instagram
  // stories matter most to food businesses and are reachable only there. The
  // existing message rides as text, the link only as `url`. No sheet (most
  // desktops) → the same copy as the button beside it.
  const tShare = useTranslations("share");
  // MEH-2884: the same helper the insights followers card uses.
  const share = () =>
    shareOrCopy({ url, text: t("wa_text_template", { url: "" }).trim(), copy });

  return (
    <div className="bg-surface border border-border rounded-lg p-5 mb-6">
      <p className="text-sm font-medium text-text mb-2">{t("label")}</p>
      <div className="flex items-center gap-2 bg-green-50 rounded-md px-3 py-2 mb-3">
        <span className="text-sm text-primary font-mono flex-1 truncate" dir="ltr">{url}</span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={copy}
          className="flex-1 text-sm border border-border rounded-sm px-3 py-1.5 hover:border-primary transition"
        >
          {copied ? t("copied") : t("copy_cta")}
        </button>
        <button
          type="button"
          onClick={share}
          data-testid="vanity-share"
          className="flex-1 text-sm text-center rounded-sm px-3 py-1.5 bg-primary text-background hover:bg-primary-dark transition"
        >
          {tShare("trigger")}
        </button>
      </div>
    </div>
  );
}

/**
 * Module:   producer/dashboard/page (Overview / סקירה index)
 * Purpose:  The slim Overview index of the dashboard hub (MEH-964). Shows the
 *           at-a-glance surfaces: greeting, status banners, holiday hint,
 *           vanity link, availability toggle, completeness card, and the
 *           top-line 4-KPI strip (OverviewStatsHero; the conversion line
 *           and weekly badge were removed in MEH-2430).
 * Touches:  GET /producers/me/dashboard, /producers/me/analytics,
 *           /producers/me; POST /producers/me/availability-state.
 * Does NOT: render the deep analytics (windowed cards + charts) — those live
 *           in the insights tab (dashboard/insights/page.js); nor the edit
 *           forms (dashboard/edit) or quick links (dashboard/tools).
 * Related:  app/[locale]/producer/dashboard/DashboardLayoutClient.jsx (tab nav + UX gate);
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
      className="bg-surface border border-border rounded-lg p-4 mb-6 flex items-center justify-between gap-3"
    >
      <p className="text-sm text-fg-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="text-sm text-primary font-medium underline decoration-[1.5px] underline-offset-[5px] decoration-primary/35 hover:decoration-current shrink-0"
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
  const dialogRef = useRef(null);
  useDialogFocus(dialogRef, true);
  return (
    <div
      ref={dialogRef}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      className="fixed inset-0 z-[9000] flex items-end sm:items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("section_aria")}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface rounded-t-3xl sm:rounded-xl w-full max-w-sm p-6 space-y-4">
        <h2 className="font-semibold text-text text-lg">{t("heading")}</h2>
        <p className="text-sm text-fg-muted">{t("body")}</p>
        <a
          href={`https://wa.me/${env.NEXT_PUBLIC_SUPPORT_PHONE || "972500000000"}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 hover:bg-green-50 transition"
        >
          <WhatsappLogo size={22} weight="fill" className="text-[#25D366] shrink-0" />
          <div>
            <p className="text-sm font-medium">{t("whatsapp_label")}</p>
            <p className="text-xs text-fg-muted">{t("whatsapp_hours")}</p>
          </div>
        </a>
        <a
          href="mailto:contact@mehamakor.co.il"
          className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 hover:bg-green-50 transition"
        >
          <EnvelopeSimple size={22} className="text-primary shrink-0" />
          <div>
            <p className="text-sm font-medium">{t("email_label")}</p>
            <p className="text-xs text-fg-muted">contact@mehamakor.co.il</p>
          </div>
        </a>
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-md text-sm font-medium text-fg-muted hover:text-text transition"
        >
          {t("close_cta")}
        </button>
      </div>
    </div>
  );
}

// MEH-2759 (MEH-2757 chunk 2): the four availability radios (and their
// MEH-2199 arrow-key layer) became ONE «בהפסקה» switch. Owners set hours plus a
// pause, like Google / Etsy / Wolt / Uber Eats; «פתוח להזמנות» as a status
// clashed with the order-window line «פתוח להזמנות · עד …». Off = the server's
// accepting_orders, the only other value since MEH-2782.

export default function ProducerDashboardPage() {
  const t = useTranslations("dashboard.producer");
  const tHoliday = useTranslations("holidays");
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
    // MEH-2229: remember what the server last confirmed BEFORE the optimistic
    // write, so a failed POST can be rolled back from memory. The rollback
    // must not depend on the network — the refetch below is a second request
    // that can fail for the same reason the first one did.
    const previousState = data?.producer?.availability_state;
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
      // MEH-2229: roll the optimistic value back to the last server-confirmed
      // state FIRST, from memory. Before this the only thing undoing the
      // optimistic write was the refetch below — and its `.catch(() => {})`
      // meant a refetch that failed (network, 401 mid-refresh, 500) left the
      // rejected state lit on screen next to an error toast saying it was
      // rejected. The screen must never keep a state the server refused.
      setData((prev) =>
        prev
          ? {
              ...prev,
              producer: { ...prev.producer, availability_state: previousState },
            }
          : prev,
      );
      // Then refetch so any OTHER server-side drift is picked up. A failed
      // refetch is no longer swallowed: the rollback above already made the
      // screen correct, so the only job left here is to say the re-sync did
      // not happen (MEH-325 silent-except class) — reuse the same toast, no
      // new copy (rule 22).
      api
        .get("/producers/me/dashboard")
        .then((r) => setData(r.data))
        .catch(() => {
          showToast.error(t("error_availability_update"));
        });
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
          className="bg-surface border border-border rounded-lg p-6 text-center"
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
            className="inline-block bg-primary text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-primary-dark transition"
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
  // MEH-2880: the slug comes from `profile` (GET /producers/me). The dashboard
  // payload (GET /producers/me/dashboard, producer_me.py) has no `slug`, so
  // reading `producer.slug` kept «לצפייה בעמוד שלך», «הלינק שלי» and the QR
  // card hidden for every owner. DO NOT read the slug from `data.producer`.
  const slug = profile?.slug || null;

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

  // MEH-2759: the switch reads ON while vacation is saved OR selected-but-not-
  // yet-confirmed (MEH-999 reveal-then-confirm). MEH-1092 F4: pre-approval it
  // shows OFF — a locked control must not read as a live status.
  const savedAvailability = producer.availability_state || "accepting_orders";
  const pauseOn = vacationSelected || savedAvailability === "on_vacation";
  const togglePause = () => {
    if (!pauseOn) {
      // Reveal the date field first; the POST waits for «שמרו» so it always
      // carries a return date (MEH-999).
      setVacationSelected(true);
      setVacationDateError("");
    } else if (savedAvailability === "on_vacation") {
      setVacationSelected(false);
      setAvailabilityState("accepting_orders");
    } else {
      // Selected but never saved — nothing to undo on the server.
      setVacationSelected(false);
      setVacationDateError("");
    }
  };

  // MEH-1134: state-aware card order. While the business is pending OR the
  // completeness heuristic still reports missing fields, the completeness
  // card is the owner's only actionable surface — it mounts directly below
  // the status banners, ABOVE the (pre-approval disabled) availability card
  // (GBP Profile Strength pattern). Once approved AND complete, today's
  // order stands — availability first, the daily action of a live business.
  const completenessFirst = !isApproved || !isComplete;
  // MEH-2460: organizer (ADR-036) — no availability, no business checklist.
  // Review #3711 F9: fall back to /auth/me while /producers/me is loading (or
  // failed), so business-only cards never flash for an organizer.
  const isOrganizer = (profile?.kind ?? user?.producer_kind) === "organizer";

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
      {/* MEH-2880 review: approved only. A slug is kept after a business is
          set inactive / rejected / back to pending, and both public routes
          404 anything not approved — a live link here would open a 404. (The
          layout's «צפייה בדף» eye → /producer/{id} still works for the owner.) */}
      {slug && isApproved && (
        <LocaleLink
          // MEH-2460: an organizer's public page is /organizers/{slug}
          // (MEH-2461); /{slug} is the business route and 404s it.
          href={isOrganizer ? `/organizers/${slug}` : `/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="view-public-link"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mb-8"
        >
          <Eye size={16} aria-hidden="true" />
          {/* MEH-2882 (8): one name for the public page everywhere — the tab
              bar's «צפייה בדף» (approved by Sapir 10/11). */}
          {t("nav.view_page")}
        </LocaleLink>
      )}

      {/* MEH-1025 Chunk B: admin completion-request banner. Renders only when
          requested_changes is set; the CTA routes to the edit tab. */}
      <ChangesRequestedBanner profile={profile} />

      {/* MEH-1025 Chunk B: suppress the generic "ממתין לאישור" notice when a
          request-changes is pending — the specific "נשאר להשלים" banner above
          IS the message, and "awaiting approval" would contradict it (the ball
          is in the owner's court). Both otherwise stack on a pending producer. */}
      {/* MEH-2100: a business in `draft` has NOT asked to be reviewed, so it
          gets the completion banner instead of "הפרופיל שלך בסקירה". This is
          the REPLACEMENT the ticket asks for — the pending banner below is
          keyed on status === "pending" and therefore cannot co-render.
          On success the local status flips to "pending" with no reload, so
          the existing review banner takes over immediately. */}
      {/* MEH-2883: a business in draft gets ONE checklist — the completeness
          card below with these actions at its foot. The standalone banner
          stays only for an organizer, whose checklist it is (ADR-036). */}
      {producer.status === "draft" && isOrganizer && (
        <DraftSubmitBanner
          producer={profile}
          onSubmitted={() =>
            setData((prev) =>
              prev
                ? { ...prev, producer: { ...prev.producer, status: "pending" } }
                : prev,
            )
          }
          onPhoneVerified={() =>
            setProfile((prev) => (prev ? { ...prev, phone_verified: true } : prev))
          }
        />
      )}

      {producer.status === "pending" && !profile?.requested_changes && (
        // data-testid added with the MEH-2100 E2E spec that reads it — the
        // draft→pending transition needs to assert WHICH banner won, and a
        // Hebrew-text locator is the anti-pattern docs/E2E-LOCATORS.md names.
        // Opportunistic conversion, per that file's migration policy.
        <div
          className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 text-sm"
          role="status"
          data-testid="status-pending-banner"
        >
          <p className="font-semibold text-yellow-800 mb-1">{t("status.pending.title")}</p>
          {/* MEH-1347: informational only — the completeness card below owns
              the single "השלימו פרופיל" CTA (audit found two clashing CTAs
              with opposite arrows on one screen). */}
          <p className="text-yellow-700">
            {t("status.pending.body")}
          </p>
        </div>
      )}

      {/* MEH-2210 chunk B: the rejected banner is now the exit from `rejected`
          — reason-driven copy keyed on the admin's preset code (with a deep
          link to the card that fixes it), the free text as a quote, and the
          "שליחה לבדיקה חוזרת" CTA capped at 3. Replaces the MEH-1355 block
          whose three generic tips did not depend on the reason. Code + count
          come from /producers/me (ProducerOwnerOut) with /auth/me as the
          first-render fallback; the free text keeps coming from /auth/me
          (MEH-283). On success the local status flips to "pending" with no
          reload, so the pending banner takes over in the same session. */}
      {producer.status === "rejected" && (
        <RejectedBanner
          reason={user.producer_rejection_reason}
          code={profile?.rejection_reason_code ?? user.producer_rejection_reason_code ?? null}
          count={profile?.resubmission_count ?? user.producer_resubmission_count ?? 0}
          onSupport={() => setSupportOpen(true)}
          onResubmitted={(n) => {
            setData((prev) =>
              prev ? { ...prev, producer: { ...prev.producer, status: "pending" } } : prev,
            );
            setProfile((prev) =>
              prev ? { ...prev, status: "pending", resubmission_count: n } : prev,
            );
          }}
        />
      )}

      {/* MEH-1355: inactive banner migrated from the removed /settings business
          tab. Matches the literal "inactive" the admin toggle emits
          (admin.py:332) — the old settings tab checked a status the backend
          never emits, so its banner was dead code. */}
      {producer.status === "inactive" && (
        <div
          className="bg-warning-50 border border-warning-200 rounded-lg p-4 mb-6 text-sm space-y-3"
          role="alert"
          data-testid="status-inactive-banner"
        >
          <p className="font-semibold text-warning-800 flex items-center gap-2">
            <Warning size={18} weight="fill" aria-hidden="true" />
            {t("status.inactive.title")}
          </p>
          <p className="text-warning-700">{t("status.inactive.body")}</p>
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

      {/* MEH-1134: completeness-first while pending/incomplete — the single
          mount for that state (the mirror-gated mount below covers the
          approved+complete state, so the card renders exactly once). */}
      {/* MEH-2460: an organizer's checklist is the draft banner (photo,
          description, event, phone) — this card counts products / location. */}
      {completenessFirst && profile && !isOrganizer && (
        <ProfileCompletenessCard
          producer={profile}
          footer={
            producer.status === "draft" ? (
              <DraftSubmitBanner
                variant="actions"
                producer={profile}
                onSubmitted={() =>
                  setData((prev) =>
                    prev
                      ? { ...prev, producer: { ...prev.producer, status: "pending" } }
                      : prev,
                  )
                }
                onPhoneVerified={() =>
                  setProfile((prev) => (prev ? { ...prev, phone_verified: true } : prev))
                }
              />
            ) : null
          }
        />
      )}
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

      {/* MEH-55: holiday hint — shown 14 days before and during a holiday.
          MEH-2460: its CTA is the catalog — not for an organizer. */}
      {!isOrganizer && (() => {
        const h = getUpcomingHoliday();
        if (!h) return null;
        return (
          <div
            className="rounded-lg p-4 mb-6 text-sm flex items-start gap-3"
            style={{ backgroundColor: h.color + "15", border: `1.5px solid ${h.color}35` }}
          >
            {/* MEH-1687 D: Phosphor icon, not a colour emoji. */}
            <span className="text-xl shrink-0 flex" aria-hidden="true"><HolidayIcon name={h.icon} /></span>
            <div>
              <p className="font-semibold text-text">{tHoliday(`${h.key}.dashboard_hint`)}</p>
              {/* MEH-2429: this pointed at /producer/dashboard — the page it
                  sits on, so the CTA did nothing. The catalog is the products
                  card on the edit tab (KEY_TO_ANCHOR.products). */}
              <LocaleLink
                href="/producer/dashboard/edit#products"
                className="text-xs mt-1 inline-block hover:underline"
                style={{ color: h.color }}
              >
                {t("holiday_catalog_cta")}
              </LocaleLink>
            </div>
          </div>
        );
      })()}

      {/* MEH-2882 PR 1 (placement audit 2026-11): the QR card and «ערכת
          שיתוף» are one-time / occasional jobs, so they live in «כלים» →
          «שיתוף» (tools/page.js#share), not on the daily home. Home keeps the
          one short «הלינק שלי» card above. */}

      {/* MEH-291 Phase 3 — unified availability card. Replaces the old
          "זמין היום" hero + "סטטוס זמינות" pill row. 4-value durable
          enum. Backend dual-writes to legacy columns during the 7-day
          overlap (Phase 4 drops them). */}
      {/* MEH-2460: no availability states for an organizer — it takes no
          orders (ADR-036). */}
      {!isOrganizer && (
      <div className="bg-surface border border-border rounded-lg p-6 mb-8">
        <p className="text-sm uppercase tracking-wider text-fg-muted mb-1">
          <span id="availability-heading">{t("availability.heading")}</span>
        </p>
        <p className="text-fg-muted text-sm mb-4">
          {t("availability.intro")}
        </p>
        {/* MEH-2759: the MEH-1773 «מה זה?» explainer that sat here named the
            removed states («עמוס השבוע … זמין היום»); with one switch left the
            intro line above already says it. Its order-window twin in
            edit/page.js stays. */}
        <button
          type="button"
          role="switch"
          data-testid="availability-pause-switch"
          aria-checked={pauseOn && isApproved}
          aria-describedby={!isApproved ? "availability-disabled-hint" : undefined}
          // MEH-964 1D: locked until the business is published (approved) — an
          // unpublished listing has no public surface for a pause to affect.
          disabled={!isApproved}
          onClick={togglePause}
          // MEH-2759: same switch as CoverageCtaToggle.jsx (house pattern).
          className={`group inline-flex items-center gap-3 min-h-touch text-sm font-medium text-text focus-visible:outline-none ${
            !isApproved ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          <span
            aria-hidden="true"
            className={`relative block w-10 h-6 shrink-0 rounded-full transition-colors group-focus-visible:ring-2 group-focus-visible:ring-primary/40 ${
              pauseOn && isApproved ? "bg-primary" : "bg-border"
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 rounded-full bg-surface shadow transition-all ${
                pauseOn && isApproved ? "end-1" : "start-1"
              }`}
            />
          </span>
          {t("availability.options.on_vacation")}
        </button>
        {/* MEH-964 1D: why-locked hint, associated with the pause switch via
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
                // MEH-1983: Israel's today, not UTC's — the server validates
                // vacation_until against israel_today(), so the UTC date
                // offered a value the server would then reject.
                min={israelToday()}
                onChange={(e) => { setVacationUntil(e.target.value); setVacationDateError(""); }}
                className="border border-border rounded-sm px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                dir="ltr"
                aria-invalid={vacationDateError ? "true" : undefined}
                aria-describedby={vacationDateError ? "vacation-until-error" : undefined}
              />
              {vacationUntil && (
                <button
                  type="button"
                  onClick={() => { setVacationUntil(""); setVacationDateError(""); }}
                  className="text-fg-muted hover:text-danger-600 transition inline-flex"
                  aria-label={t("availability.remove_vacation_date_aria")}
                >
                  <X size={14} weight="bold" aria-hidden="true" />
                </button>
              )}
              <Button
                type="button"
                onClick={() => setAvailabilityState("on_vacation")}
                variant="primary" size="sm"
              >
                {t("availability.vacation_confirm")}
              </Button>
            </div>
            {vacationDateError && (
              <p id="vacation-until-error" role="alert" className="mt-2 text-sm text-danger-600">
                {vacationDateError}
              </p>
            )}
          </div>
        )}
      </div>
      )}

      {/* MEH-2884 (placement audit item 7): rescue bags are a DAILY job when
          the pilot is on, so home gets a short entry right after the
          availability switch. The tool itself stays in «כלים»; same strings
          and flag as its tile there (tools/page.js). Approved business
          only: it is a daily entry for a live business; a pending one still
          finds the tile in «כלים», with its «locked until approved» line.
          Never an organizer. */}
      {rescueBagsEnabled() && isApproved && !isOrganizer && (
        <LocaleLink
          href="/producer/dashboard/rescue"
          data-testid="home-rescue-card"
          className="flex items-start gap-3 bg-surface border border-border rounded-lg p-5 mb-6 hover:border-primary transition"
        >
          <ShoppingBag size={22} className="text-primary shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            <span className="block font-semibold text-text">{t("quick_links.rescue.title")}</span>
            <span className="block text-sm text-fg-muted">{t("quick_links.rescue.sub")}</span>
          </span>
        </LocaleLink>
      )}

      {/* MEH-2883 (placement audit 2026-11): «הלינק שלי» comes AFTER the
          availability switch — the switch is the daily action of a live
          business (MEH-1134's intent), sharing is now and then. */}
      {/* MEH-53: Vanity URL card. MEH-964 1D share-gate: the shareable link
          surfaces ONLY when the profile is complete AND approved — sharing an
          unpublished/incomplete page sends visitors to a dead listing. When
          locked, a warm why-locked hint takes its place (not silent hiding). */}
      {/* MEH-2460: the vanity link is the business route /{slug} — not for an
          organizer (its public link above points to /organizers/{slug}). */}
      {isOrganizer ? null : slug && isComplete && isApproved ? (
        <VanityLinkCard slug={slug} />
      ) : slug ? (
        <div
          data-testid="share-locked-hint"
          className="bg-surface border border-border rounded-lg p-5 mb-6 flex items-center gap-3"
        >
          <LockSimple size={18} className="text-fg-muted shrink-0" aria-hidden="true" />
          <p className="text-sm text-fg-muted">{t("states.share_locked")}</p>
        </div>
      ) : null}


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

      {/* MEH-964 1B: locked top-line 4-KPI strip (conversion line gone, MEH-2430).
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
        <OverviewStatsHero analytics={analytics} isOrganizer={isOrganizer} />
      ) : (
        // MEH-2884 (placement audit item 5): ONE empty state for the numbers
        // — the activity pulse's own empty card is gone — and it carries the
        // action its copy asks for («שתפו את העמוד שלכם»): a «שתפו» button,
        // only once there is a public page to share (approved + slug).
        // MEH-1345: this zero-state and ActivityPulse's rendered the SAME
        // title-less copy — two identical anonymous cards on a fresh
        // dashboard. Each now carries its own visible title + purpose-
        // specific copy.
        <div
          data-testid="overview-zero-state"
          className="bg-surface border border-border rounded-lg p-6 mb-8"
        >
          <p className="font-semibold text-text mb-1">{t("states.zero_activity_title")}</p>
          <div className="flex items-center gap-3">
            <Sparkle size={20} weight="fill" className="text-primary shrink-0" aria-hidden="true" />
            <p className="text-sm text-fg-muted">{t("states.zero_activity")}</p>
          </div>
          {/* Same gate as «הלינק שלי» (slug + complete + approved): with the
              profile incomplete that slot shows «share locked», and a «שתפו»
              here would contradict it (MEH-2884 review). */}
          {slug && isComplete && isApproved && !isOrganizer && <ZeroStateShareButton slug={slug} />}
        </div>
      )}

      {/* MEH-2884 (audit item 5): the separate «פעילות אחרונה» card is gone —
          it showed the same 7-day views/WhatsApp numbers as the strip above,
          with its own empty state. Its one action (the WhatsApp nudge) now
          lives inside the strip (OverviewStatsHero). */}

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
// MEH-964 1B: locked top-line 4-KPI strip (conversion line removed, MEH-2430).
// RTL order (right->left): WhatsApp leads -> contact clicks -> rating ->
// views. 2x2 grid, identical mobile + desktop. Uniform "last 7 days" window
// label, NO per-KPI deltas/arrows — the analytics payload has no per-metric
// prior-period counts (only views had a categorical trend), so the AC's
// "labeled deltas" is superseded by data reality and deferred to a backend
// follow-up. The DEEP analytics (windowed cards + charts) live in the
// insights tab (dashboard/insights); the top-line KPIs render ONLY here
// (FLAG-1 — never duplicated in insights/). The eligibility badge that lived
// here was removed in MEH-2430 (no such feature exists).
// ============================================================

// MEH-2884: the «שתפו» button of the numbers' empty state. Same share path as
// «הלינק שלי» (lib/share-link.js): share sheet, else copy.
function ZeroStateShareButton({ slug }) {
  const tShare = useTranslations("share");
  const tVanity = useTranslations("dashboard.producer.vanity_link");
  const tFollowers = useTranslations("sweep_tail.followers");
  const url = `${SITE_URL}/p/${slug}`;
  // A failed copy says so (no clipboard API, or a rejected write) — the tap
  // must never do nothing (MEH-2884 review).
  const copy = () => {
    if (!navigator.clipboard?.writeText) {
      showToast.error(tFollowers("share_error"));
      return;
    }
    navigator.clipboard
      .writeText(url)
      .then(() => showToast.success(tVanity("copied")))
      .catch(() => showToast.error(tFollowers("share_error")));
  };
  return (
    <button
      type="button"
      data-testid="overview-zero-share"
      onClick={() => shareOrCopy({ url, text: tVanity("wa_text_template", { url: "" }).trim(), copy })}
      className="mt-4 text-sm rounded-sm px-4 py-1.5 bg-primary text-background hover:bg-primary-dark transition"
    >
      {tShare("trigger")}
    </button>
  );
}

// MEH-964 1C → MEH-2884: the WhatsApp nudge that used to head the separate
// activity-pulse card, folded into the strip. Rulings kept (Sapir, 03/07):
// bound to whatsapp_clicks.last_7d (never .total — the "new" claim must be
// truthful), and the wa.me CTA shows only with it. The pulse's presence rows
// (a «צפייה בפרופיל» line, a «קליק על כפתור הוואטסאפ» line) are dropped:
// the strip's numbers already say it (FLAG-1).
function WeekWhatsappNudge({ count }) {
  const t = useTranslations("dashboard.producer.pulse");
  if (count <= 0) return null;
  return (
    <div data-testid="week-whatsapp-nudge" className="bg-surface border border-border rounded-lg p-4 space-y-3">
      <p className="font-semibold text-text">{t("hero", { count })}</p>
      <a
        href="https://wa.me/"
        target="_blank"
        rel="noopener noreferrer"
        data-testid="week-whatsapp-cta"
        className="btn-whatsapp inline-flex items-center justify-center gap-2 min-h-touch px-6 rounded-full text-sm font-medium"
      >
        <WhatsappLogo size={18} weight="fill" aria-hidden="true" />
        {t("cta")}
      </a>
    </div>
  );
}

function OverviewStatsHero({ analytics, isOrganizer = false }) {
  const t = useTranslations("dashboard.producer.analytics");
  const tWeek = useTranslations("dashboard.producer.week");
  const {
    profile_views,
    whatsapp_clicks,
    contact_clicks,
    average_rating,
    total_reviews,
  } = analytics;

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
      <WeekWhatsappNudge count={whatsapp_clicks?.last_7d ?? 0} />
      <div data-testid="overview-kpi-strip" className="grid grid-cols-2 gap-3">
        {kpis.map((kpi) => (
          <div key={kpi.key} className="bg-surface border border-border rounded-lg p-4 text-center">
            <p className="text-xs text-fg-muted mb-1">{t(`kpi.${kpi.key}`)}</p>
            <p className="font-headline-lg text-3xl font-bold text-primary">{kpi.value}</p>
            <p className="text-xs text-fg-muted mt-1">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* MEH-2430: two blocks removed here, both approved by Sapir 27/10.
          - The conversion line ("{rate} לחיצות … לכל 100 מבקרות שונות ב-30
            הימים האחרונים") mixed a 30-day window into a strip of 7-day
            numbers and was hard to read on a phone.
          - The "בעלת עסק השבוע" eligibility badge promised a feature that
            does not exist (no such pick anywhere in the code or docs), and its
            title ("צרו קשר") contradicted its tooltip ("יופיע כאן הודעה"). */}
      {/* MEH-2882 (5): the week card leads to the full numbers. Copy approved
          word for word by Sapir 10/11 («לכל הנתונים ←»). Not for an organizer:
          she has no insights tab (DashboardLayoutClient, ADR-036). */}
      {!isOrganizer && (
        <LocaleLink
          href="/producer/dashboard/insights"
          data-testid="week-all-insights"
          className="inline-flex items-center min-h-touch text-sm font-medium text-primary hover:underline"
        >
          {tWeek("all_insights")}
        </LocaleLink>
      )}
    </div>
  );
}
