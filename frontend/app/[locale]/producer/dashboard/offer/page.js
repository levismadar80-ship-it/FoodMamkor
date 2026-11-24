// @ts-check
"use client";

/**
 * Module:   producer/dashboard/offer/page
 * Purpose:  «הטבה» — the business's one offer to customers (OffersCard), on a
 *           page of its own reached from «כלים» › «להציע ללקוחות», beside
 *           events, group buys and surprise bags.
 * Touches:  GET /producers/me (the profile the card reads); the card itself
 *           saves `active_offer` on PUT /producers/me.
 * Does NOT: own the form — that is edit/cards/OffersCard.jsx, unchanged and
 *           still exported from edit/cards.jsx. Render the public badge
 *           (components/OfferBadge.jsx).
 * Related:  tools/page.js (the tile that links here); lib/business-features.js
 *           (`offer` → dashboard.home "tools").
 * History:  MEH-3785 (moved out of עריכה › מוצרים ומחירים; Shopify keeps
 *           discounts in their own admin section, apart from products).
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import Button from "@/components/ui/Button";
import BackLink from "@/components/ui/BackLink";
import { OffersCard } from "../edit/cards/OffersCard";

/** The owner profile, with a retry. `null` while loading. */
function useProfile() {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState(/** @type {any} */ (null));
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (authLoading || !user || user.role !== "producer") return;
    setError(false);
    api
      .get("/producers/me")
      .then((r) => setProfile(r.data))
      .catch(() => setError(true));
  }, [user, authLoading, attempt]);
  return { user, authLoading, profile, setProfile, error, retry: () => setAttempt((n) => n + 1) };
}

export default function ProducerDashboardOfferPage() {
  const router = useRouter();
  const t = useTranslations("dashboard.producer");
  const tOffer = useTranslations("producer.offer");
  const tEvents = useTranslations("dashboard.producer.manage_events");
  const { user, authLoading, profile, setProfile, error, retry } = useProfile();

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== "producer") router.push("/login");
  }, [user, authLoading, router]);
  // An organizer never had an offer card (no products group, ADR-036).
  useEffect(() => {
    if (profile?.kind === "organizer") router.replace("/producer/dashboard/tools");
  }, [profile, router]);

  if (authLoading || !user || user.role !== "producer") return null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10" data-testid="offer-page">
      <BackLink href="/producer/dashboard/tools" label={tEvents("back_to_tools")} />
      <h1 className="font-headline-lg text-xl font-bold text-text mt-1 mb-6">{tOffer("card_title")}</h1>
      {error && (
        <div role="alert" data-testid="offer-page-error" className="bg-surface border border-border rounded-lg p-5 text-center">
          <p className="text-fg-muted mb-3">{t("section_errors.profile")}</p>
          <Button variant="primary" size="sm" onClick={retry}>
            {t("section_errors.retry_cta")}
          </Button>
        </div>
      )}
      {!error && !profile && <p className="text-center text-fg-muted py-6">{t("loading_data")}</p>}
      {profile && profile.kind !== "organizer" && (
        <div className="bg-surface border border-border rounded-lg p-5">
          <OffersCard
            profile={profile}
            onSave={(patch) => setProfile((p) => (p ? { ...p, ...patch } : p))}
          />
        </div>
      )}
    </div>
  );
}
