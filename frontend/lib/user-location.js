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
 * ORIGIN (MEH-2014 PR 2): a fix can now come from two places — the device's
 * GPS, or a city the user picked when GPS was denied. They are mutually
 * exclusive BY CONSTRUCTION rather than by convention: there is one key, so
 * one write replaces the other and "most recent wins" needs no coordination
 * between the five call sites that write here. A second key holding "which
 * city" would be a second owner of one fact (workflow.md → Smell #1) and would
 * go stale the moment any GPS writer forgot to clear it.
 *
 * TWO READERS, ONE PARSER. `getUserLocation()` still returns exactly
 * `{lat, lng}` — every existing consumer (card distance labels) wants the
 * coordinates and nothing else, and widening it would have changed a shape
 * asserted in ~10 places for no caller's benefit. `getUserLocationOrigin()`
 * returns the same record plus `source`/`city`, for the one surface that has
 * to TELL the user which origin is active. Both project the same parse.
 *
 * A record written before this change carries no `source`; it reads back as
 * `"gps"`, which is what it was.
 *
 * History: MEH-12 (creation, sessionStorage); MEH-2014 (localStorage + the
 *          storage-event listener; clearUserLocation gained its first consumer;
 *          PR 2 added the origin discriminator).
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

export const SOURCE_GPS = "gps";
export const SOURCE_CITY = "city";

/**
 * The single parser. Returns {lat, lng, source, city} or null — every public
 * reader below is a projection of this, so there is exactly one place that
 * decides what a stored record means.
 */
function readRecord() {
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
    // A city origin is only meaningful with a name to show; a record claiming
    // `city` with no name would render "מרחק מ: " — fall back to gps instead.
    const city = typeof parsed.city === "string" ? parsed.city.trim() : "";
    const source = parsed.source === SOURCE_CITY && city ? SOURCE_CITY : SOURCE_GPS;
    return { lat: parsed.lat, lng: parsed.lng, source, city: source === SOURCE_CITY ? city : "" };
  } catch {
    return null;
  }
}

/**
 * Synchronous read. Returns {lat, lng} or null.
 * Safe to call from useEffect, render, or event handlers.
 */
export function getUserLocation() {
  const rec = readRecord();
  return rec ? { lat: rec.lat, lng: rec.lng } : null;
}

/**
 * Synchronous read including WHERE the fix came from. Returns
 * {lat, lng, source, city} or null. Only /map needs this — it is the one
 * surface that names the active origin (MEH-2014 PR 2).
 */
export function getUserLocationOrigin() {
  return readRecord();
}

/**
 * Write + dispatch the cross-component event so useUserLocation hooks
 * elsewhere on the page re-render.
 *
 * `origin` is optional and defaults to a GPS fix, so the four pre-existing
 * two-argument call sites keep writing byte-identical records. Pass
 * `{ source: SOURCE_CITY, city }` to record a manually chosen origin; that
 * write REPLACES any GPS fix, which is what makes the two mutually exclusive.
 */
export function setUserLocation(lat, lng, origin = null) {
  if (!hasStorage()) return;
  try {
    const isCity = origin?.source === SOURCE_CITY && typeof origin.city === "string" && origin.city.trim();
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        isCity
          ? { lat, lng, source: SOURCE_CITY, city: origin.city.trim() }
          : { lat, lng },
      ),
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
 * Shared subscription behind both hooks below. `read` is one of the two
 * projections above; the listener set is identical either way, so it is
 * written once rather than in each hook (MEH-2014 PR 2).
 */
function useStoredLocation(read) {
  const [value, setValue] = useState(null);

  useEffect(() => {
    setValue(read());
    const onChange = () => setValue(read());
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
    // `read` is a module-level function reference, stable across renders.
  }, [read]);

  return value;
}

/**
 * React hook — returns the current cached location as {lat, lng}, or null.
 * Re-renders when setUserLocation/clearUserLocation fire on this page, and
 * when another tab writes the key (MEH-2014 — `storage` never fires in the
 * tab that made the change, which is why both listeners are needed).
 */
export function useUserLocation() {
  return useStoredLocation(getUserLocation);
}

/**
 * React hook — the same record plus `source`/`city`. For the surface that has
 * to name the active origin rather than just measure from it.
 */
export function useUserLocationOrigin() {
  return useStoredLocation(getUserLocationOrigin);
}
