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

import { useState } from "react";
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
    .filter(Boolean)
    .map((s) => s.slice(0, MAX_NAME))
    .slice(0, MAX_PASTED);
}

/**
 * @typedef {{ added: number, unmatched: string[], error: boolean }} PasteResult
 */

/**
 * @param {{ value: string[], onChange: (cities: string[]) => void }} props
 */
export function useCitiesPaste({ value, onChange }) {
  const [result, setResult] = useState(/** @type {PasteResult | null} */ (null));

  /** @param {import("react").ClipboardEvent<HTMLInputElement>} e */
  const onPaste = async (e) => {
    const names = splitPastedCities(e.clipboardData?.getData("text") ?? "");
    // One name pastes into the input as before, so the suggestions can help.
    if (names.length < 2) return;
    e.preventDefault();
    try {
      const r = await api.post("/cities/match", { names });
      const parsed = CitiesMatchSchema.safeParse(r.data);
      if (!parsed.success) throw new Error("bad /cities/match response");
      const fresh = parsed.data.matched.filter((c) => !value.includes(c));
      if (fresh.length > 0) onChange([...value, ...fresh]);
      setResult({ added: fresh.length, unmatched: parsed.data.unmatched, error: false });
    } catch {
      setResult({ added: 0, unmatched: [], error: true });
    }
  };

  return { pasteResult: result, onPaste, clearPasteResult: () => setResult(null) };
}
