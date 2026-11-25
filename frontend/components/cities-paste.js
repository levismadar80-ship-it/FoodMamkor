// @ts-check
"use client";

/**
 * Module:   cities-paste
 * Purpose:  Paste a whole list of cities into a CitiesAutocomplete field: one
 *           request checks every name, the known ones become chips, the rest
 *           are reported instead of dropped (MEH-3867).
 * Touches:  POST /cities/match (read-only lookup, nothing is saved).
 * Does NOT: save the form — the field's parent does that with its own button;
 *           decide what a city is — the backend's city_key/canonical_city do.
 * Related:  components/CitiesAutocomplete.jsx (the one field that uses it),
 *           backend/app/routers/cities.py (match_cities)
 * History:  MEH-3867 (creation — חוות הפרא took ~80 picks for 82 cities)
 */

import { useRef, useState } from "react";
import api from "@/lib/api";
import { CitiesMatchSchema } from "@/lib/api-responses";

// Mirrors MAX_PASTED_CITIES in backend/app/schemas/cities_match.py.
const MAX_PASTED = 300;
const MAX_NAME = 100;

/**
 * Split pasted text into city names: newline, comma, semicolon, tab or a
 * bullet separate them; list markers («1.», «-», «•») are dropped.
 * @param {string} text
 * @returns {string[]}
 */
export function splitPastedCities(text) {
  return String(text || "")
    .split(/[\n\r,;\t•|]+/)
    .map((s) => s.replace(/^\s*(?:\d+[.)]|[-*·])\s*/, "").trim())
    .filter(Boolean);
}

/**
 * The comparison form of a city name, so a chip saved as «תל אביב - יפו» or
 * «קריית שמונה» is not added again as «תל אביב-יפו» / «קרית שמונה». A subset
 * of the backend's city_key (separators, spaces, the double yod); aliases are
 * the backend's job.
 * @param {string} name
 */
function cityFold(name) {
  return String(name)
    .replace(/[\s\-־–—]+/g, " ")
    .trim()
    // Drop the second yod of «קריית»; a regex, not a string, since this is data, not copy.
    .replace(/(?<=(?:^|\s)קרי)י(?=ת(?:\s|$))/g, "")
    .toLowerCase();
}

/**
 * @typedef {{ added: number, unmatched: string[], error: boolean }} PasteResult
 */

/**
 * @param {{ value: string[], onChange: (cities: string[]) => void }} props
 */
export function useCitiesPaste({ value, onChange }) {
  const [result, setResult] = useState(/** @type {PasteResult | null} */ (null));
  // The chips as of NOW, not as of the paste: a second paste, or a chip
  // clicked while the request was out, must not be overwritten (rule-5a).
  const valueRef = useRef(value);
  valueRef.current = value;

  /** @param {import("react").ClipboardEvent<HTMLInputElement>} e */
  const onPaste = async (e) => {
    const names = splitPastedCities(e.clipboardData?.getData("text") ?? "");
    // One name pastes into the input as before, so the suggestions can help.
    if (names.length < 2) return;
    e.preventDefault();
    // Over the request's limits: reported as not found, never dropped.
    const fits = names.filter((n) => n.length <= MAX_NAME);
    const tooLong = names.filter((n) => n.length > MAX_NAME);
    const sent = fits.slice(0, MAX_PASTED);
    const overflow = [...fits.slice(MAX_PASTED), ...tooLong];
    try {
      const r = await api.post("/cities/match", { names: sent });
      const parsed = CitiesMatchSchema.safeParse(r.data);
      if (!parsed.success) throw new Error("bad /cities/match response");
      const current = valueRef.current;
      const have = new Set(current.map(cityFold));
      const fresh = [];
      for (const c of parsed.data.matched) {
        if (have.has(cityFold(c))) continue;
        have.add(cityFold(c));
        fresh.push(c);
      }
      if (fresh.length > 0) {
        const next = [...current, ...fresh];
        valueRef.current = next;
        onChange(next);
      }
      setResult({ added: fresh.length, unmatched: [...parsed.data.unmatched, ...overflow], error: false });
    } catch {
      setResult({ added: 0, unmatched: [], error: true });
    }
  };

  return { pasteResult: result, onPaste, clearPasteResult: () => setResult(null) };
}
