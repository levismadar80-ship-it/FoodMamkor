"use client";

import { useEffect, useState } from "react";
import { HeartStraight } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import {
  ensureFavoritesLoaded,
  isFavorited as isFavoritedCache,
  setFavoritedLocal,
  subscribeFavorites,
} from "@/lib/favorites-cache";
import LoginPromptModal from "./LoginPromptModal";
import AlertPrefsPanel from "./AlertPrefsPanel";

/**
 * FavoriteButton — save button for a producer. Visible to guests too
 * (per MEH-8 guest-browsing spec): a guest tap opens a login-prompt
 * modal instead of silently no-op'ing or hiding the button.
 *
 * Variants:
 *   - "default" (sidebar pair with ShareButton)    — emoji heart in a 44×44 tap target
 *   - "gallery" (absolute overlay on ImageGallery) — white circle 44px, HeartStraight icon
 *   - "inline"  (next to <h1> in producer header)  — small heart + "שמור" text
 *
 * Shared behavior: reads favorited state from the shared favorites-cache
 * (hydrated once per session, no per-mount fetch), optimistic POST/DELETE
 * toggle (logged-in only) that writes setFavoritedLocal so card hearts stay
 * in sync, toast, disabled:opacity-60 while loading, aria-pressed +
 * aria-label for accessibility.
 *
 * MEH-54: after favoriting, shows AlertPrefsPanel inline (default + inline variants).
 * MEH-643/MEH-636: saved ink is primary green, NEVER red (matches CardHeart).
 * MEH-1325: migrated off the per-mount GET + local state onto favorites-cache
 * (ensureFavoritesLoaded / subscribeFavorites / setFavoritedLocal) — a save on
 * /producer now reflects in every subscribed CardHeart in the same session
 * (and vice-versa), and the saved ink turned green.
 */
export default function FavoriteButton({ producerId, producerName = "", variant = "default" }) {
  const t = useTranslations("favorites.button");
  // MEH-848: shared generic error copy (collapsed from favorites.button.error_generic).
  const tError = useTranslations("error");
  const { user } = useAuth();
  const [favorited, setFavorited] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showAlertPanel, setShowAlertPanel] = useState(false);

  useEffect(() => {
    if (!user) return;
    // MEH-1325: read from the shared favorites-cache instead of a per-mount
    // GET /users/me/favorites — mirrors CardHeart (ProducerCard.jsx). The cache
    // hydrates once; subscribing keeps this button in sync with card hearts.
    let alive = true;
    ensureFavoritesLoaded().then(() => {
      if (alive) setFavorited(isFavoritedCache(producerId));
    });
    const unsub = subscribeFavorites(() => {
      if (alive) setFavorited(isFavoritedCache(producerId));
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [user, producerId]);

  const toggle = async () => {
    // Guest: open the login modal and stop — don't hit the API.
    if (!user) {
      setShowLoginModal(true);
      return;
    }
    const next = !favorited;
    setLoading(true);
    // MEH-1325: optimistic — flip local state AND the shared cache before the
    // network round-trip so subscribed card hearts update immediately; revert
    // both on failure. Mirrors CardHeart (ProducerCard.jsx).
    setFavorited(next);
    setFavoritedLocal(producerId, next);
    try {
      if (next) {
        await api.post(`/users/me/favorites/${producerId}`);
        if (variant !== "gallery") setShowAlertPanel(true);
        if (!localStorage.getItem("favorite_hint_shown")) {
          localStorage.setItem("favorite_hint_shown", "1");
          showToast.success(t("saved_toast_first_time"), {
            icon: <HeartStraight size={18} weight="fill" />,
            duration: 4000,
          });
        } else {
          showToast.success(t("saved_toast"), {
            icon: <HeartStraight size={18} weight="fill" />,
          });
        }
      } else {
        await api.delete(`/users/me/favorites/${producerId}`);
        setShowAlertPanel(false);
        showToast.success(t("removed_toast"));
      }
    } catch (err) {
      // MEH-730 idempotent DELETE-404: the favorite was already gone
      // server-side — keep the heart un-filled (don't revert), matching
      // CardHeart's handling.
      if (!next && err?.response?.status === 404) {
        setShowAlertPanel(false);
        setLoading(false);
        return;
      }
      setFavorited(!next);
      setFavoritedLocal(producerId, !next);
      showToast.error(tError("generic"));
    }
    setLoading(false);
  };

  const label = favorited ? t("remove_aria") : t("add_aria");
  const commonProps = {
    onClick: toggle,
    disabled: loading,
    title: label,
    "aria-label": label,
    "aria-pressed": favorited,
  };

  // Capture current path for the login `next=` param — evaluated at
  // click time via the modal's own nextPath prop, so client-side
  // navigation between producer pages stays accurate.
  const nextPath =
    typeof window !== "undefined"
      ? window.location.pathname + window.location.search
      : "/";

  let button;
  if (variant === "gallery") {
    button = (
      <button
        {...commonProps}
        className="bg-white/95 hover:bg-white rounded-full w-11 h-11 flex items-center justify-center shadow-md hover:scale-105 transition disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <HeartStraight
          size={22}
          weight={favorited ? "fill" : "regular"}
          className={favorited ? "text-primary" : "text-text"}
          aria-hidden="true"
        />
      </button>
    );
  } else if (variant === "inline") {
    button = (
      <button
        {...commonProps}
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium min-h-[32px] border transition disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-primary/40 ${
          favorited
            ? "bg-primary/10 text-primary border-primary/30 hover:bg-primary/15"
            : "bg-white text-text border-border hover:bg-green-50"
        }`}
      >
        <HeartStraight
          size={14}
          weight={favorited ? "fill" : "regular"}
          aria-hidden="true"
        />
        {t("inline_label")}
      </button>
    );
  } else {
    // default — MEH-990: Phosphor heart (was a ❤️/🤍 emoji pair, Emoji LOCK).
    button = (
      <button
        {...commonProps}
        className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:scale-110 transition disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg p-1"
      >
        <HeartStraight
          size={24}
          weight={favorited ? "fill" : "regular"}
          className={favorited ? "text-primary" : "text-fg-muted"}
          aria-hidden="true"
        />
      </button>
    );
  }

  return (
    <>
      {button}
      {showAlertPanel && favorited && user && (
        <div className="mt-3">
          <AlertPrefsPanel
            producerId={producerId}
            producerName={producerName}
            onClose={() => setShowAlertPanel(false)}
          />
        </div>
      )}
      <LoginPromptModal
        open={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        message={t("login_prompt_message")}
        nextPath={nextPath}
      />
    </>
  );
}
