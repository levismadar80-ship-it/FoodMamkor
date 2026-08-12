/**
 * User location — localStorage cache + cross-component sync hook.
 *
 * MEH-12 (original) put this in sessionStorage: "prompt once per session,
 * coordinates persist for the session". MEH-2014 replaced that store on
 * Sapir's 11/08 decision — the fix now survives a tab close, and an explicit
 * clear affordance is the way out instead of the tab closing.
 *
 * WHY THE STORE CHANGED, since "persist longer" is not self-evidently better:
 *   /map's "מרחק" sort was disabled unless a fix already existed, and the only
 *   writer was a button on another page. Session scope meant that even a user
 *   who HAD granted GPS found the control dead again on her next visit. The
 *   staleness that session scope used to bound is now bounded by the clear
 *   button instead — which is a control the user can see, unlike tab lifetime.
 *
 * Cross-tab: `storage` fires in OTHER tabs, the custom event fires in THIS one.
 * useUserLocation listens to both, so clearing in one tab drops the distance
 * labels in the others instead of leaving them contradicting each other. The
 * same pairing is used by lib/use-user-city.js:56 for its localStorage key.
 *
 * History: MEH-12 (creation, sessionStorage); MEH-2014 (localStorage + the
 *          storage-event listener; clearUserLocation gained its first consumer).
 */

import { useEffect, useState } from "react";

export const STORAGE_KEY = "user_location";
export const EVENT_NAME = "mehamakor:user-location";

function hasStorage() {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

/**
 * Synchronous read. Returns {lat, lng} or null.
 * Safe to call from useEffect, render, or event handlers.
 */
export function getUserLocation() {
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed.lat !== "number" ||
      typeof parsed.lng !== "number"
    ) {
      return null;
    }
    return { lat: parsed.lat, lng: parsed.lng };
  } catch {
    return null;
  }
}

/**
 * Write + dispatch the cross-component event so useUserLocation hooks
 * elsewhere on the page re-render.
 */
export function setUserLocation(lat, lng) {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ lat, lng }),
    );
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // Storage quota or private-mode failure — fail silently.
  }
}

/**
 * Clear the cached location. MEH-2014 gave this its first consumer: the
 * /map sort control's clear affordance. It is the counterpart to the store
 * change — without a way out, a persisted fix would be permanent.
 */
export function clearUserLocation() {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // ignore
  }
}

/**
 * React hook — returns the current cached location or null. Re-renders
 * when setUserLocation/clearUserLocation fire on this page, and when
 * another tab writes the key (MEH-2014 — `storage` never fires in the tab
 * that made the change, which is why both listeners are needed).
 */
export function useUserLocation() {
  const [loc, setLoc] = useState(null);

  useEffect(() => {
    setLoc(getUserLocation());
    const onChange = () => setLoc(getUserLocation());
    const onStorage = (e) => {
      // `key` is null when the whole store is cleared — treat that as a change.
      if (e.key === null || e.key === STORAGE_KEY) onChange();
    };
    window.addEventListener(EVENT_NAME, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return loc;
}
