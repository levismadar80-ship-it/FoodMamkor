"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellSlash } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
// MEH-1334: post-login auto-complete — a guest's follow intent survives the
// login round-trip and finishes automatically (revision-2 #7).
import {
  clearPendingAction,
  consumePendingAction,
  setPendingAction,
} from "@/lib/pending-action";
import { showToast } from "@/lib/toast";
import LoginPromptModal from "./LoginPromptModal";

/**
 * FollowButton — follow/unfollow a producer to get notified about new
 * products. Distinct from FavoriteButton (bookmark/save).
 *
 * MEH-1334: guests now SEE the button (mirrors FavoriteButton) — a guest tap
 * opens the login prompt instead of the pre-1334 `return null`, and the
 * intended follow completes automatically after sign-in. Notifications
 * themselves aren't wired up yet — this is the data-only foundation per
 * docs/archive/FEEDBACK_FIXES.md.
 *
 * Variants:
 *   - "default" — full-width secondary-weight button (MEH-1049)
 *   - "quiet"   — header quiet-actions row: borderless icon + "מעקב"
 */
export default function FollowButton({ producerId, variant = "default" }) {
  // MEH-996: strings live under group_buys.follow in both locale files —
  // the producer.follow namespace never existed (same trap as
  // FridayDeliveryStrip), so t() rendered raw key paths.
  const t = useTranslations("group_buys.follow");
  const tError = useTranslations("error");
  const { user } = useAuth();
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  useEffect(() => {
    if (!user || !producerId) return;
    api
      .get(`/producers/${producerId}/follow-status`)
      .then((r) => setFollowing(!!r.data?.following))
      .catch(() => setFollowing(false));
  }, [user, producerId]);

  // MEH-1334 (revision-2 #7): finish a guest's follow intent after sign-in.
  // One-shot consume; the live follow-status check (not local state, which
  // may not have hydrated yet) guards a double-follow. Scroll restores to
  // where the guest tapped.
  const toggleRef = useRef(null);
  useEffect(() => {
    if (!user || !producerId) return;
    const intent = consumePendingAction("follow", producerId);
    if (!intent) return;
    api
      .get(`/producers/${producerId}/follow-status`)
      .then((r) => {
        if (!r.data?.following) toggleRef.current?.();
      })
      .catch(() => {});
    window.scrollTo({ top: intent.scrollY });
  }, [user, producerId]);

  const toggle = async () => {
    // Guest: open the login modal and stop — don't hit the API. The intent is
    // stored so the follow completes automatically after sign-in (MEH-1334,
    // mirrors FavoriteButton).
    if (!user) {
      setPendingAction("follow", producerId);
      setShowLoginModal(true);
      return;
    }
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
      // MEH-996: error_generic exists in neither namespace — shared
      // error.generic copy instead (MEH-848 precedent).
      showToast.error(tError("generic"));
    }
    setLoading(false);
  };

  toggleRef.current = toggle;

  // Login `next=` target — evaluated at render so client-side navigation
  // between producer pages stays accurate (mirrors FavoriteButton).
  const nextPath =
    typeof window !== "undefined"
      ? window.location.pathname + window.location.search
      : "/";

  const button =
    variant === "quiet" ? (
      // MEH-1334: header quiet-actions row — borderless icon + locked label
      // "מעקב"; ≥44px hit-area via min-h + transparent padding (revision-2 #5).
      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        aria-pressed={following}
        aria-label={following ? t("following") : t("follow_aria")}
        className={`inline-flex items-center gap-1.5 min-h-[44px] py-2 text-[13px] font-medium rounded transition disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-primary/40 ${
          following ? "text-primary" : "text-text hover:text-primary"
        }`}
      >
        <Bell
          size={17}
          weight={following ? "fill" : "regular"}
          className={following ? "text-primary" : "text-primary-dark"}
          aria-hidden="true"
        />
        {following ? t("following") : t("quiet_label")}
      </button>
    ) : (
      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        // MEH-1049: demoted to secondary weight so WhatsApp is the sole filled
        // primary in the contact card. Following = subtle primary-token tint
        // (not a green fill); not-following = neutral ghost.
        className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-[10px] border text-sm font-medium transition disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-primary/40 ${
          following
            ? "bg-primary/10 text-primary border-primary/40 hover:bg-primary/15"
            : "bg-white text-fg-muted border-border hover:bg-background"
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

  return (
    <>
      {button}
      <LoginPromptModal
        open={showLoginModal}
        onClose={() => {
          // Dismissed without signing in — drop the stored intent so a later
          // unrelated login doesn't surprise-follow (MEH-1334).
          clearPendingAction();
          setShowLoginModal(false);
        }}
        message={t("login_prompt_message")}
        nextPath={nextPath}
      />
    </>
  );
}
