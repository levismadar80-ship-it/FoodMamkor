"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "user_city";
const EVENT_NAME = "mehamakor:city-changed";

// MEH-1485: shared with auth-context.js (the profile↔localStorage bridge)
// so the storage key + event name have ONE owner — no duplicated magic
// strings across the two files.
export const USER_CITY_CHANGED_EVENT = EVENT_NAME;

function read() {
  try {
    return localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

/** Current localStorage user_city (or null). Non-hook reader for callers
 *  outside a component (e.g. the auth-context write-back listener). */
export function readUserCity() {
  return read();
}

/**
 * MEH-1485 — one-shot seed of localStorage user_city from the DB profile
 * city on auth load. Writes ONLY when localStorage is empty: a recent
 * explicit choice (localStorage) wins over a stale profile. Dispatches the
 * city-changed event so live consumers (home hero, FridayDeliveryStrip,
 * /map) refilter without a manual pick. No-op for guests / no profile city.
 */
export function seedCityFromProfile(profileCity) {
  if (!profileCity) return;
  try {
    if (localStorage.getItem(STORAGE_KEY)) return; // localStorage wins
    localStorage.setItem(STORAGE_KEY, profileCity);
  } catch {
    return;
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function useUserCity() {
  const [city, setCityState] = useState(null);

  useEffect(() => {
    setCityState(read());
    const onChanged = () => setCityState(read());
    // MEH-1269: the "storage" listener was previously an anonymous inline
    // handler, so cleanup below could not remove it — a listener leak on every
    // unmount/remount of any useUserCity consumer. Named handler + matching
    // removeEventListener closes the leak.
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) onChanged();
    };
    window.addEventListener(EVENT_NAME, onChanged);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, onChanged);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setCity = useCallback((newCity) => {
    try {
      if (newCity) {
        localStorage.setItem(STORAGE_KEY, newCity);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {}
    setCityState(newCity || null);
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  }, []);

  const clearCity = useCallback(() => setCity(null), [setCity]);

  return { city, setCity, clearCity };
}
