// @ts-check
"use client";

/**
 * Module:   producer/dashboard/share/page
 * Purpose:  «שיתוף» — the printable QR card and «ערכת שיתוף» on a page of
 *           their own, one tap from «כלים» (MEH-3749, Sapir's pick 23/11).
 *           Until then they filled most of the tools tab: 5,174px at 390.
 * Touches:  GET /producers/me (slug, images, categories, completeness for the
 *           QR card and the kit); GET /producers/me/dashboard (status).
 * Does NOT: build either card — BusinessQrCard and ShareKitSection are
 *           unchanged; this page only places them and gates them.
 * Related:  app/[locale]/producer/dashboard/tools/page.js (the «שיתוף» tile);
 *           qr-card/page.js (its back link returns here).
 * History:  MEH-2882 PR 1 (the section on the tools tab); MEH-3749 (moved here);
 *           MEH-3767 («הלינק שלי» moved here from the dashboard home, first).
 *
 * RTL: logical properties only — see .claude/rules/rtl.md.
 */

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import BackLink from "@/components/ui/BackLink";
import Button from "@/components/ui/Button";
import BusinessQrCard from "@/components/producer/BusinessQrCard";
import ShareKitSection from "@/components/producer/ShareKitSection";
import VanityLinkCard from "@/components/producer/VanityLinkCard";
import { LockSimple } from "@phosphor-icons/react";
import { producerCompleteness } from "@/lib/producer-completeness";

/**
 * Profile + status for the page; `error` is a failed load, kept apart from
 * "loading". A signed-out or non-producer visitor goes to /login.
 * @param {{ user: any, authLoading: boolean }} auth
 */
function useShareData({ user, authLoading }) {
  const router = useRouter();
  const [state, setState] = useState({ profile: null, status: null, error: false });
  const [attempt, setAttempt] = useState(0);
  // The router is read through a ref: its identity is not a reason to refetch.
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);
  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== "producer") {
      routerRef.current.push("/login");
      return;
    }
    Promise.all([api.get("/producers/me"), api.get("/producers/me/dashboard")])
      .then(([me, dash]) => setState({ profile: me.data, status: dash.data?.producer?.status ?? null, error: false }))
      .catch(() => setState({ profile: null, status: null, error: true }));
  }, [user, authLoading, attempt]);
  const retry = () => {
    setState((prev) => ({ ...prev, error: false }));
    setAttempt((count) => count + 1);
  };
  return { ...state, retry };
}

/**
 * «הלינק שלי» (MEH-3767, from the home): the link once the page is complete,
 * else why it is locked — sharing an incomplete page sends people to a thin
 * listing (MEH-964 1D share-gate). The page is already approved here.
 * @param {{ profile: any }} props
 */
function MyLink({ profile }) {
  const t = useTranslations("dashboard.producer");
  if (!profile.slug) return null;
  if (producerCompleteness(profile).missing.length === 0) return <VanityLinkCard slug={profile.slug} />;
  return (
    <div data-testid="share-locked-hint" className="bg-surface border border-border rounded-lg p-5 flex items-center gap-3">
      <LockSimple size={18} className="text-fg-muted shrink-0" aria-hidden="true" />
      <p className="text-sm text-fg-muted">{t("states.share_locked")}</p>
    </div>
  );
}

export default function ProducerDashboardSharePage() {
  const router = useRouter();
  const t = useTranslations("dashboard.producer");
  const tShare = useTranslations("share");
  const tEvents = useTranslations("dashboard.producer.manage_events");
  const { user, loading: authLoading } = useAuth();
  const { profile, status, error, retry } = useShareData({ user, authLoading });

  // An organizer has nothing to share here (the section never showed for one).
  useEffect(() => {
    if (profile?.kind === "organizer") router.replace("/producer/dashboard/tools");
  }, [profile, router]);

  if (authLoading || !user || user.role !== "producer") return null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10" data-testid="share-page">
      <BackLink href="/producer/dashboard/tools" label={tEvents("back_to_tools")} />
      <h1 className="font-headline-lg text-xl font-bold text-text mt-1 mb-6">{tShare("quiet_label")}</h1>
      {error && (
        <div role="alert" data-testid="share-page-error" className="bg-surface border border-border rounded-lg p-5 text-center">
          <p className="text-fg-muted mb-3">{t("section_errors.profile")}</p>
          <Button variant="primary" size="sm" onClick={retry}>
            {t("section_errors.retry_cta")}
          </Button>
        </div>
      )}
      {!error && !profile && <p className="text-center text-fg-muted py-6">{t("loading_data")}</p>}
      {/* Nothing to share before the page is public (an unapproved page 404s). */}
      {profile && status !== "approved" && profile.kind !== "organizer" && (
        <p data-testid="share-page-locked" className="text-sm font-medium text-warning-800">
          {t("quick_links.locked_until_approved")}
        </p>
      )}
      {profile && status === "approved" && profile.kind !== "organizer" && (
        <div className="space-y-8" data-testid="share-page-content">
          <MyLink profile={profile} />
          <BusinessQrCard
            producer={profile}
            isComplete={producerCompleteness(profile).missing.length === 0}
            isApproved
            isOrganizer={false}
          />
          <ShareKitSection profile={profile} />
        </div>
      )}
    </div>
  );
}
