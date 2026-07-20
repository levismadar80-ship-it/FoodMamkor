"use client";

import { useEffect, useRef, useState } from "react";
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
// MEH-1334: post-login auto-complete — a guest's save intent survives the
// login round-trip and finishes automatically (revision-2 #7).
import {
  clearPendingAction,
  consumePendingAction,
  setPendingAction,
} from "@/lib/pending-action";
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

  // MEH-1334 (revision-2 #7): finish a guest's save intent after sign-in.
  // consumePendingAction is one-shot (key removed on first match), so a
  // StrictMode double-effect or re-mount can't save twice; scroll restores
  // to where the guest tapped — no dead-end at the login screen.
  const toggleRef = useRef(null);
  useEffect(() => {
    if (!user) return;
    const intent = consumePendingAction("favorite", producerId);
    if (!intent) return;
    ensureFavoritesLoaded().then(() => {
      if (!isFavoritedCache(producerId)) toggleRef.current?.();
    });
    window.scrollTo({ top: intent.scrollY });
  }, [user, producerId]);

  const toggle = async () => {
    // Guest: open the login modal and stop — don't hit the API. The intent is
    // stored so the save completes automatically after sign-in (MEH-1334).
    if (!user) {
      setPendingAction("favorite", producerId);
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
        // MEH-1334: quiet (header actions row) suppresses the inline panel
        // like gallery — a block panel inside the flex row breaks the layout,
        // and this page never showed it before (its only mount was gallery).
        if (variant !== "gallery" && variant !== "quiet") setShowAlertPanel(true);
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

  toggleRef.current = toggle;

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
  } else if (variant === "quiet") {
    // MEH-1334: header quiet-actions row — borderless icon + locked label
    // "שמירה"; ≥44px hit-area via min-h + transparent padding (visual size
    // unchanged, revision-2 #5). Saved state = filled primary heart.
    button = (
      <button
        {...commonProps}
        className={`inline-flex items-center gap-1.5 min-h-[44px] py-2 text-[13px] font-medium rounded transition disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-primary/40 ${
          favorited ? "text-primary" : "text-text hover:text-primary"
        }`}
      >
        <HeartStraight
          size={17}
          weight={favorited ? "fill" : "regular"}
          className={favorited ? "text-primary" : "text-primary-dark"}
          aria-hidden="true"
        />
        {t("quiet_label")}
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
        onClose={() => {
          // Dismissed without signing in — drop the stored intent so a later
          // unrelated login doesn't surprise-save (MEH-1334).
          clearPendingAction();
          setShowLoginModal(false);
        }}
        message={t("login_prompt_message")}
        nextPath={nextPath}
      />
    </>
  );
}
