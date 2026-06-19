"use client";

import { useEffect, useState } from "react";
import { Bell, BellSlash } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { showToast } from "@/lib/toast";

/**
 * FollowButton — follow/unfollow a producer to get notified about new
 * products. Distinct from FavoriteButton (bookmark/save).
 *
 * Silent if the user isn't logged in — we return null. Signed-in users
 * see "🔔 עקבי אחרי עסק זה" (outline) or "🔔 עוקבת" (filled) after they
 * follow. Notifications themselves aren't wired up yet — this is the
 * data-only foundation per docs/archive/FEEDBACK_FIXES.md.
 */
export default function FollowButton({ producerId }) {
  const t = useTranslations("producer.follow");
  const { user } = useAuth();
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || !producerId) return;
    api
      .get(`/producers/${producerId}/follow-status`)
      .then((r) => setFollowing(!!r.data?.following))
      .catch(() => setFollowing(false));
  }, [user, producerId]);

  if (!user) return null;

  const toggle = async () => {
    setLoading(true);
    try {
      if (following) {
        await api.delete(`/producers/${producerId}/follow`);
        setFollowing(false);
        showToast.success(t("unfollowed_toast"));
      } else {
        await api.post(`/producers/${producerId}/follow`);
        setFollowing(true);
        showToast.success(t("followed_toast"), { icon: <Bell size={18} weight="fill" /> });
      }
    } catch {
      showToast.error(t("error_generic"));
    }
    setLoading(false);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-[10px] border text-sm font-medium transition disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-primary/40 ${
        following
          ? "bg-primary text-white border-primary hover:bg-primary-dark"
          : "bg-white text-primary border-primary hover:bg-green-50"
      }`}
      aria-pressed={following}
    >
      {following ? (
        <>
          <Bell size={16} weight="fill" />
          {t("following")}
        </>
      ) : (
        <>
          <BellSlash size={16} />
          {t("follow_aria")}
        </>
      )}
    </button>
  );
}
