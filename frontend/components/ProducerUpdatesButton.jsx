"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "@phosphor-icons/react";
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
import {
  clearPendingAction,
  consumePendingAction,
  setPendingAction,
} from "@/lib/pending-action";
import LoginPromptModal from "./LoginPromptModal";

/**
 * MEH-2526 — the producer page's permanent "get updates" toggle.
 *
 * Before this, the only way to turn per-business updates on was the panel that
 * opens right after a save, or the bell on /favorites — the owner herself could
 * not find it. This button is always rendered, on every viewport.
 *
 *   guest            → the same login hand-off FavoriteButton uses; the intent
 *                      is stored as "updates" and completed after sign-in
 *   not saved        → POST favorite, then PUT alerts ON (the backend rejects an
 *                      alerts PUT for a business that is not saved)
 *   saved, off       → PUT alerts ON
 *   saved, on        → PUT alerts OFF — every alert type false. The favorite
 *                      stays; the chosen channel (WhatsApp) is kept, so turning
 *                      updates back on does not ask for it again.
 *
 * "On" = an alert row exists AND at least one alert type is on — the same
 * predicate fire_alerts uses, so the button never claims updates that will not
 * be sent for type reasons. A row with no delivery channel still reads ON; when
 * the button turns updates on with no channel it opens the page's
 * AlertPrefsPanel (onOpenAlerts), which says a channel is required.
 *
 * Reuses the two existing endpoints only: POST /users/me/favorites/{id} and
 * GET/PUT /users/me/favorites/{id}/alerts. `refreshSignal` re-reads the prefs
 * when it changes (ProducerHeader passes the panel's open state, so a save in
 * the panel is reflected here once it closes). The reverse direction is
 * `onChanged`, called after every successful write, so the page can re-mount an
 * open panel instead of leaving it on pre-write values. A failed prefs GET
 * leaves the button disabled rather than assuming OFF.
 */
const TYPES = ["notify_new_event", "notify_new_product", "notify_delivery_area", "notify_new_recipe"];

const typesTo = (value) => Object.fromEntries(TYPES.map((k) => [k, value]));

export default function ProducerUpdatesButton({
  producerId,
  onOpenAlerts,
  onChanged,
  refreshSignal,
}) {
  const t = useTranslations("favorites");
  const tError = useTranslations("error");
  const tPrefs = useTranslations("sweep_tail.alert_prefs");
  const { user } = useAuth();
  // null = not known yet (favorites cache / prefs still loading)
  const [favorited, setFavorited] = useState(null);
  const [prefs, setPrefs] = useState(null);
  // A failed prefs GET is NOT "no prefs": treating it as OFF would let the next
  // click PUT defaults over a stored row (e.g. drop a WhatsApp opt-in). The
  // button stays inert until a later read (refreshSignal) succeeds.
  const [loadFailed, setLoadFailed] = useState(false);
  // Bumped after every write; a GET that started before the bump is stale and
  // must not overwrite the state the write just set.
  const writeVersion = useRef(0);
  const [busy, setBusy] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  const hasPhone = !!(user?.phone && user.phone.trim());

  useEffect(() => {
    if (!user) {
      setFavorited(null);
      setPrefs(null);
      return undefined;
    }
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

  // Prefs are only meaningful for a saved business (the PUT requires it).
  useEffect(() => {
    if (!user || favorited === null) {
      setPrefs(null);
      setLoadFailed(false);
      return undefined;
    }
    if (!favorited) {
      setPrefs({ enabled: false });
      setLoadFailed(false);
      return undefined;
    }
    let alive = true;
    const version = writeVersion.current;
    const current = () => alive && version === writeVersion.current;
    api
      .get(`/users/me/favorites/${producerId}/alerts`)
      .then((r) => {
        if (!current()) return;
        setPrefs(r.data || { enabled: false });
        setLoadFailed(false);
      })
      .catch(() => {
        if (current()) setLoadFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [user, favorited, producerId, refreshSignal]);

  const on = Boolean(user && favorited && prefs?.enabled && TYPES.some((k) => prefs[k]));

  const toggle = useCallback(async () => {
    if (!user) {
      setPendingAction("updates", producerId);
      setShowLoginModal(true);
      return;
    }
    setBusy(true);
    const before = prefs;
    try {
      let saved = isFavoritedCache(producerId);
      if (!saved) {
        await api.post(`/users/me/favorites/${producerId}`);
        setFavoritedLocal(producerId, true);
        saved = true;
      }
      const currentlyOn = saved && prefs?.enabled && TYPES.some((k) => prefs[k]);
      const next = !currentlyOn;
      const whatsapp = Boolean(prefs?.whatsapp_opt_in && hasPhone);
      const body = {
        ...typesTo(next),
        whatsapp_opt_in: whatsapp,
        // null keeps any stored push subscription (alerts.py only overwrites
        // when a value is sent).
        push_subscription: null,
      };
      await api.put(`/users/me/favorites/${producerId}/alerts`, body);
      writeVersion.current += 1;
      setPrefs({ ...(prefs || {}), ...body, enabled: true });
      // The save above re-triggers the prefs read (favorites subscription)
      // while the PUT is in flight; if that read failed, the write we just
      // made is the known state now — the button must not stay inert.
      setLoadFailed(false);
      // Lets the page re-read an AlertPrefsPanel that is open right now —
      // otherwise its Save would PUT the pre-write values back.
      onChanged?.();
      if (next && !whatsapp && !prefs?.has_push) {
        // No delivery channel yet — open the panel where it is chosen.
        onOpenAlerts?.();
      } else {
        showToast.success(tPrefs("save_success_toast"));
      }
    } catch {
      writeVersion.current += 1;
      setPrefs(before);
      showToast.error(tError("generic"));
    } finally {
      setBusy(false);
    }
  }, [user, producerId, prefs, hasPhone, onOpenAlerts, onChanged, tPrefs, tError]);

  // Finish a guest's "updates" intent after sign-in (one-shot, see
  // lib/pending-action). Waits until the prefs are known so the toggle reads
  // the real state; if updates are already on there is nothing to do.
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;
  const intentRef = useRef(null);
  useEffect(() => {
    if (!user) return;
    const intent = consumePendingAction("updates", producerId);
    if (!intent) return;
    intentRef.current = intent;
    window.scrollTo({ top: intent.scrollY });
  }, [user, producerId]);
  useEffect(() => {
    if (!intentRef.current || prefs === null || loadFailed || busy) return;
    intentRef.current = null;
    if (!on) toggleRef.current();
  }, [prefs, on, busy, loadFailed]);

  const nextPath =
    typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        disabled={busy || (Boolean(user) && (prefs === null || loadFailed))}
        aria-pressed={on}
        data-testid="producer-updates-button"
        className={`inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full text-sm font-medium border transition disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-primary/40 ${
          on
            ? "bg-primary/10 text-primary border-primary/30 hover:bg-primary/15"
            : "bg-white text-text border-border hover:bg-green-50"
        }`}
      >
        <Bell size={18} weight={on ? "fill" : "regular"} className="text-primary" aria-hidden="true" />
        {t("updates_button.label")}
      </button>
      <LoginPromptModal
        open={showLoginModal}
        onClose={() => {
          clearPendingAction();
          setShowLoginModal(false);
        }}
        message={t("button.login_prompt_message")}
        nextPath={nextPath}
      />
    </>
  );
}
