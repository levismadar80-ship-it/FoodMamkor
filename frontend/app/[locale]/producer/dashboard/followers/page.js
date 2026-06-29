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

export default function FollowersPage() {
  const router = useRouter();
  const t = useTranslations("sweep_tail.followers");
  const { user, loading: authLoading } = useAuth();
  const [followerCount, setFollowerCount] = useState(null);
  const [slug, setSlug] = useState(null);
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
      })
      .catch(() => {
        setFollowerCount(0);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  if (authLoading || !user) return null;

  const profileUrl = slug ? `https://mehamakor.online/p/${slug}` : null;

  const handleCopy = () => {
    if (!profileUrl) return;
    navigator.clipboard.writeText(profileUrl).then(() => {
      setCopied(true);
      showToast.success(t("share_toast"), { icon: <LinkSimple size={18} /> });
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/producer/dashboard" className="text-sm text-primary hover:underline">
            {t("back_link")}
          </Link>
          <h1 className="font-headline-md text-2xl font-bold text-text mt-1">
            {t("heading")}
          </h1>
        </div>
      </div>

      {followerCount === null ? (
        <div className="text-center py-16 text-fg-muted">{t("loading")}</div>
      ) : followerCount === 0 ? (
        <EmptyState
          icon={Plant}
          title={t("empty_title")}
          description={t("empty_description")}
          ctaLabel={copied ? t("share_cta_copied") : t("share_cta")}
          ctaOnClick={handleCopy}
        />
      ) : (
        <div className="bg-white rounded-[14px] border border-border p-8 text-center">
          <p className="text-5xl mb-3">🌱</p>
          <p className="text-3xl font-bold text-text mb-1">{followerCount}</p>
          <p className="text-fg-muted mb-6">{t("followers_label")}</p>
          <p className="text-sm text-fg-muted mb-4">
            {t("share_hint")}
          </p>
          {profileUrl && (
            <button
              type="button"
              onClick={handleCopy}
              className="inline-block bg-primary text-white rounded-full px-6 py-3 text-sm font-medium hover:bg-primary-dark transition"
            >
              {copied ? t("share_cta_copied") : t("share_cta")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
