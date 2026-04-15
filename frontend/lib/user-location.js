/**
 * User location — sessionStorage cache + cross-component sync hook.
 *
 * MEH-12 spec:
 *   - Geolocation prompt happens once per session (triggered by the
 *     existing "קרובים אליי" button on the homepage).
 *   - Coordinates persist for the session in sessionStorage so all
 *     cards can show "X km away" without re-prompting.
 *   - When the location is set mid-session, cards already mounted on
 *     the page need to re-render → we dispatch a window event and the
 *     useUserLocation hook subscribes to it.
 */

import { useEffect, useState } from "react";

export const STORAGE_KEY = "user_location";
export const EVENT_NAME = "mehamakor:user-location";

function hasStorage() {
  try {
    return typeof window !== "undefined" && !!window.sessionStorage;
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
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
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
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ lat, lng }),
    );
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // Storage quota or private-mode failure — fail silently.
  }
}

/**
 * Clear the cached location (e.g. user revokes permission). Not used
 * in MEH-12 but provided for future "switch off geo" affordances.
 */
export function clearUserLocation() {
  if (!hasStorage()) return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // ignore
  }
}

/**
 * React hook — returns the current cached location or null. Re-renders
 * when setUserLocation/clearUserLocation fire elsewhere on the page.
 */
export function useUserLocation() {
  const [loc, setLoc] = useState(null);

  useEffect(() => {
    setLoc(getUserLocation());
    const onChange = () => setLoc(getUserLocation());
    window.addEventListener(EVENT_NAME, onChange);
    return () => window.removeEventListener(EVENT_NAME, onChange);
  }, []);

  return loc;
}
