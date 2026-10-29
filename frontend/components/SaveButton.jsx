"use client";

import { useEffect, useRef, useState } from "react";
import { HeartStraight } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import {
  ensureSavedLoaded,
  isSaved,
  setSavedLocal,
  subscribeSaved,
} from "@/lib/saved-cache";
import {
  clearPendingAction,
  consumePendingAction,
  setPendingAction,
} from "@/lib/pending-action";
import LoginPromptModal from "./LoginPromptModal";

/**
 * SaveButton — the heart for a recipe, event or experience (MEH-2558,
 * chunk 3/5 of MEH-2555). The business heart stays FavoriteButton: it also
 * opens «קבלת עדכונים», which nothing here has.
 *
 * Same behaviour as FavoriteButton, on purpose (Sapir 29/10: «כמו בבתי
 * עסק»): visible to guests, a guest tap opens the login prompt and the save
 * finishes by itself after sign-in (pending-action, MEH-1334); optimistic
 * toggle through the shared saved-cache; the same toasts; saved ink is
 * primary green, never red (MEH-643).
 *
 * Variants:
 *   - "overlay" — white 44px circle on a hero image, next to ShareButton's
 *                 "overlay" (same look as FavoriteButton "gallery").
 */
export default function SaveButton({ itemType, itemId, variant = "overlay" }) {
  const t = useTranslations("favorites.button");
  const tError = useTranslations("error");
  const { user } = useAuth();
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const pendingType = `save:${itemType}`;

  useEffect(() => {
    if (!user) {
      setSaved(false);
      return undefined;
    }
    let alive = true;
    ensureSavedLoaded().then(() => {
      if (alive) setSaved(isSaved(itemType, itemId));
    });
    const unsub = subscribeSaved(() => {
      if (alive) setSaved(isSaved(itemType, itemId));
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [user, itemType, itemId]);

  // Finish a guest's save after sign-in (one-shot; see FavoriteButton).
  const toggleRef = useRef(null);
  useEffect(() => {
    if (!user) return;
    const intent = consumePendingAction(pendingType, itemId);
    if (!intent) return;
    ensureSavedLoaded().then(() => {
      if (!isSaved(itemType, itemId)) toggleRef.current?.();
    });
    window.scrollTo({ top: intent.scrollY });
  }, [user, pendingType, itemType, itemId]);

  const toggle = async () => {
    if (!user) {
      setPendingAction(pendingType, itemId);
      setShowLoginModal(true);
      return;
    }
    const next = !saved;
    setLoading(true);
    setSaved(next);
    setSavedLocal(itemType, itemId, next);
    try {
      if (next) {
        await api.post(`/users/me/saved/${itemType}/${itemId}`);
        let firstTime = false;
        try {
          firstTime = !localStorage.getItem("favorite_hint_shown");
          if (firstTime) localStorage.setItem("favorite_hint_shown", "1");
        } catch {
          // storage blocked — fall back to the short toast
        }
        showToast.success(t(firstTime ? "saved_toast_first_time" : "saved_toast"), {
          icon: <HeartStraight size={18} weight="fill" />,
          ...(firstTime ? { duration: 4000 } : {}),
        });
      } else {
        await api.delete(`/users/me/saved/${itemType}/${itemId}`);
        showToast.success(t("removed_toast"));
      }
    } catch (err) {
      // Already gone server-side (DELETE 404) — the empty heart is right.
      if (!next && err?.response?.status === 404) {
        setLoading(false);
        return;
      }
      setSaved(!next);
      setSavedLocal(itemType, itemId, !next);
      showToast.error(tError("generic"));
    }
    setLoading(false);
  };

  toggleRef.current = toggle;

  const label = saved ? t("remove_aria") : t("add_aria");
  const nextPath =
    typeof window !== "undefined"
      ? window.location.pathname + window.location.search
      : "/";

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        title={label}
        aria-label={label}
        aria-pressed={saved}
        data-testid={`save-${itemType}`}
        data-variant={variant}
        className="bg-white/95 hover:bg-white rounded-full w-11 h-11 flex items-center justify-center shadow-md hover:scale-105 transition disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <HeartStraight
          size={22}
          weight={saved ? "fill" : "regular"}
          className={saved ? "text-primary" : "text-text"}
          aria-hidden="true"
        />
      </button>
      <LoginPromptModal
        open={showLoginModal}
        onClose={() => {
          clearPendingAction();
          setShowLoginModal(false);
        }}
        message={t("login_prompt_message_saved_item")}
        nextPath={nextPath}
      />
    </>
  );
}
