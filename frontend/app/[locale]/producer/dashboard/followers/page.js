"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { showToast } from "@/lib/toast";
import { LinkSimple, Plant } from "@phosphor-icons/react";
import EmptyState from "@/components/ui/EmptyState";
import { SITE_URL } from "@/lib/env";
// MEH-999: shared back link — one owner for target + arrow direction.
import BackLink from "@/components/ui/BackLink";

export default function FollowersPage() {
  const router = useRouter();
  const t = useTranslations("sweep_tail.followers");
  const { user, loading: authLoading } = useAuth();
  const [followerCount, setFollowerCount] = useState(null);
  const [slug, setSlug] = useState(null);
  const [status, setStatus] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== "producer") {
      router.push("/login");
      return;
    }
    Promise.all([
      api.get("/producers/me/analytics"),
      api.get("/producers/me"),
    ])
      .then(([analyticsRes, profileRes]) => {
        setFollowerCount(analyticsRes.data.follower_count ?? 0);
        setSlug(profileRes.data.slug);
        setStatus(profileRes.data.status);
      })
      .catch(() => {
        setFollowerCount(0);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  if (authLoading || !user) return null;

  // MEH-1356: the share link only works once the business is public
  // (approved + slug). A pending producer's public page 404s (producers.py
  // approve-gate), so copying its URL hands out a dead link — gate the CTA
  // on the same predicate as the insights zero-state (MEH-1101,
  // insights/page.js:165). MEH-1322: SITE_URL is the canonical origin.
  const canShare = status === "approved" && !!slug;
  const profileUrl = canShare ? `${SITE_URL}/p/${slug}` : null;

  const handleCopy = () => {
    if (!profileUrl) return;
    // MEH-1356: clipboard.writeText can reject (permissions / insecure
    // context) — surface it instead of a silent no-op.
    navigator.clipboard
      .writeText(profileUrl)
      .then(() => {
        setCopied(true);
        showToast.success(t("share_toast"), { icon: <LinkSimple size={18} /> });
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => showToast.error(t("share_error")));
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          {/* MEH-999: NOT a Tools-grid page — its only in-app entry is the
              public producer page (ReviewsSection.jsx:495), so the dashboard
              overview stays the back target. */}
          <BackLink href="/producer/dashboard" label={t("back_link")} />
          <h1 className="font-headline-md text-2xl font-bold text-text mt-1">
            {t("heading")}
          </h1>
        </div>
      </div>

      {followerCount === null ? (
        <div className="text-center py-16 text-fg-muted">{t("loading")}</div>
      ) : followerCount === 0 ? (
        <>
          {/* MEH-1356: CTA only when the link works (approved + slug);
              EmptyState self-hides the button when ctaOnClick is absent. */}
          <EmptyState
            icon={Plant}
            title={t("empty_title")}
            description={t("empty_description")}
            ctaLabel={canShare ? (copied ? t("share_cta_copied") : t("share_cta")) : undefined}
            ctaOnClick={canShare ? handleCopy : undefined}
          />
          {!canShare && (
            <p className="text-center text-sm text-fg-muted -mt-4">
              {t("share_locked")}
            </p>
          )}
        </>
      ) : (
        <div className="bg-white rounded-[14px] border border-border p-8 text-center">
          <Plant size={48} weight="fill" className="text-primary mx-auto mb-3" aria-hidden="true" />
          <p className="text-3xl font-bold text-text mb-1">{followerCount}</p>
          <p className="text-fg-muted mb-6">{t("followers_label")}</p>
          <p className="text-sm text-fg-muted mb-4">
            {t("share_hint")}
          </p>
          {/* MEH-1356: same approved+slug gate on the >0 branch — was
              {profileUrl && …} which still copied a 404 link for a pending
              producer that happened to have a slug. */}
          {canShare ? (
            <button
              type="button"
              onClick={handleCopy}
              className="inline-block bg-primary text-white rounded-full px-6 py-3 text-sm font-medium hover:bg-primary-dark transition"
            >
              {copied ? t("share_cta_copied") : t("share_cta")}
            </button>
          ) : (
            <p className="text-sm text-fg-muted">{t("share_locked")}</p>
          )}
        </div>
      )}
    </div>
  );
}
