"use client";

import { useEffect, useState } from "react";
import { HeartStraight } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";
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
 * Shared behavior: load-once of /users/me/favorites (logged-in only),
 * POST/DELETE toggle (logged-in only), toast, disabled:opacity-60
 * while loading, aria-pressed + aria-label for accessibility.
 *
 * MEH-54: after favoriting, shows AlertPrefsPanel inline (default + inline variants).
 */
export default function FavoriteButton({ producerId, producerName = "", variant = "default" }) {
  const t = useTranslations("favorites.button");
  const { user } = useAuth();
  const [favorited, setFavorited] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showAlertPanel, setShowAlertPanel] = useState(false);

  useEffect(() => {
    if (!user) return;
    api
      .get("/users/me/favorites")
      .then((res) => {
        const ids = res.data.map((f) => f.producer_id);
        setFavorited(ids.includes(producerId));
      })
      .catch(() => {});
  }, [user, producerId]);

  const toggle = async () => {
    // Guest: open the login modal and stop — don't hit the API.
    if (!user) {
      setShowLoginModal(true);
      return;
    }
    setLoading(true);
    try {
      if (favorited) {
        await api.delete(`/users/me/favorites/${producerId}`);
        setFavorited(false);
        setShowAlertPanel(false);
        showToast(t("removed_toast"));
      } else {
        await api.post(`/users/me/favorites/${producerId}`);
        setFavorited(true);
        if (variant !== "gallery") setShowAlertPanel(true);
        if (!localStorage.getItem("favorite_hint_shown")) {
          localStorage.setItem("favorite_hint_shown", "1");
          showToast(t("saved_toast_first_time"), "success", 4000);
        } else {
          showToast(t("saved_toast"));
        }
      }
    } catch {
      showToast(t("error_generic"), "error");
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
          className={favorited ? "text-red-500" : "text-site-text"}
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
            ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
            : "bg-white text-site-text border-border hover:bg-green-50"
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
    // default — back-compat emoji heart
    button = (
      <button
        {...commonProps}
        className="text-2xl min-w-[44px] min-h-[44px] flex items-center justify-center hover:scale-110 transition disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg p-1"
      >
        {favorited ? "❤️" : "🤍"}
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
