"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { showToast } from "@/lib/toast";
import EmptyState from "@/components/ui/EmptyState";

export default function FollowersPage() {
  const router = useRouter();
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
      showToast("הקישור הועתק! 🔗");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/producer/dashboard" className="text-sm text-primary hover:underline">
            ← לוח הבקרה
          </Link>
          <h1 className="font-headline text-2xl font-bold text-site-text mt-1">
            העוקבות שלי
          </h1>
        </div>
      </div>

      {followerCount === null ? (
        <div className="text-center py-16 text-site-muted">טוענת...</div>
      ) : followerCount === 0 ? (
        <EmptyState
          emoji="🌱"
          title="עוד אין עוקבות — וזה בסדר"
          description="עוקבות זה לקוחות שמעדיפות להישאר מעודכנות על מה שחדש אצלך. הן יופיעו כאן ברגע שיתחילו לעקוב. בינתיים — שתפי את הקישור לפרופיל שלך בוואטסאפ."
          ctaLabel={copied ? "הועתק! ✓" : "העתיקי קישור לשיתוף"}
          ctaOnClick={handleCopy}
        />
      ) : (
        <div className="bg-white rounded-[14px] border border-border p-8 text-center">
          <p className="text-5xl mb-3">🌱</p>
          <p className="text-3xl font-bold text-site-text mb-1">{followerCount}</p>
          <p className="text-site-muted mb-6">עוקבות</p>
          <p className="text-sm text-site-muted mb-4">
            רשימה מפורטת של העוקבות בקרוב — שתפי את הפרופיל שלך כדי להגיע ליותר לקוחות.
          </p>
          {profileUrl && (
            <button
              type="button"
              onClick={handleCopy}
              className="inline-block bg-primary text-white rounded-full px-6 py-3 text-sm font-medium hover:bg-primary-dark transition"
            >
              {copied ? "הועתק! ✓" : "העתיקי קישור לשיתוף"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
