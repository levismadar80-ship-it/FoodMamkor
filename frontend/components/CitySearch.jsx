"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ISRAEL_CITIES } from "@/data/cities";
import api from "@/lib/api";

/**
 * CitySearch — autocomplete input for Israeli cities.
 *
 * Props:
 *   - value (string)
 *   - onChange (fn(newValue, { known })) — `known` is true when newValue is a
 *     city the component can vouch for at emit time: picked from the list, or
 *     present in the static list ∪ the results already fetched for it. Callers
 *     that take one argument are unaffected (MEH-2241 chunk A).
 *   - onKnownChange (fn(known)) — optional. The async half of the same answer:
 *     fired when a fetch that resolves AFTER the emit changes whether the
 *     current value is known. Deliberately NOT a second onChange with the same
 *     value — at least one consumer resets its own derived state (a delivery
 *     verdict) on every onChange call, so an equal-value re-emit would wipe a
 *     result the user just asked for.
 *   - placeholder
 *   - label (always required for a11y; sr-only unless labelVisible)
 *   - labelVisible (boolean, default false) — when true the label renders
 *     visible above the field with the sibling recipe; MEH-1127
 *   - id (required for <label htmlFor>)
 *   - onSubmit (fn, called when user hits Enter)
 *   - useBackend (boolean) — if true, queries GET /cities?q=<value> for the
 *     current value (debounced, ≥2 chars) and merges the results with the
 *     static list. MEH-2241 chunk A: the endpoint is a prefix search capped at
 *     20 rows (cities.py MAX_RESULTS) since MEH-1343, so the old "fetch once
 *     without q" only ever knew the first 20 names alphabetically.
 *   - aria-describedby / aria-invalid — forwarded verbatim to the <input>
 *     (MEH-2022: the callers render the city error message themselves; these
 *     let it be programmatically associated. Omitted -> absent, byte-identical
 *     markup for every caller that does not pass them.)
 *
 * Shows dropdown after 2 characters. Keyboard navigation: ArrowUp/Down/Enter/Escape.
 *
 * MEH-1128 D2 — token-recipe fallback (NOT ui/Input): this is a composed
 * combobox — a transparent input inside a `focus-within` bordered wrapper, an
 * interactive `×` clear button as an end-element, and an absolutely-positioned
 * `role=listbox` dropdown. The ui/Input primitive can't express it (no
 * endAdornment — D1 excluded it by the over-engineering guard; and its border/
 * focus live on the input, not a focus-within wrapper). MEH-1127 already
 * converged the field recipe to the canon (`rounded-md` · `border-border` ·
 * `min-h-[44px]` · focus ring), and the leading magnifier is the same
 * search-adornment the D1 gallery uses for its "יישוב" example — so no render
 * change here (a literal location-*pin* would misread on a city *search* field).
 */
// MEH-2241 chunk A — the anonymous /cities rate limit is 60/min; the debounce
// keeps a fast typist to a handful of requests per word, and the length floor
// matches the dropdown's own "shows after 2 characters" rule below.
const QUERY_DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

export default function CitySearch({
  value,
  onChange,
  placeholder,
  label,
  labelVisible = false,
  id,
  onSubmit,
  onKnownChange,
  useBackend = true,
  className = "",
  // MEH-2015: same marker mechanism as ui/Input — aria-required on the input,
  // visual asterisk only when this component's own label is the visible one
  // (labelVisible; when sr-only, the OUTER label carries the marker).
  required = false,
  // MEH-2022: passthrough only — no error prop that renders its own message.
  // The callers own the error markup (a second renderer would be the
  // two-mechanisms smell, MEH-271); this just points the input at it.
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}) {
  const t = useTranslations("search.city_search");
  const inputPlaceholder = placeholder ?? t("placeholder");
  const [isOpen, setIsOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  // Results of the last resolved query, tagged with the prefix they answer
  // (MEH-2241 chunk A). Tagging instead of clearing: results for "שד" are still
  // valid candidates while the user extends to "שדות", and a shorter/unrelated
  // value simply stops using them — no state write on every keystroke.
  const [backend, setBackend] = useState({ q: "", cities: [] });
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  // Monotonic request id: a response is applied only if no newer query was
  // issued after it — the debounce stops most stale requests from being sent,
  // this stops the ones already in flight from landing out of order.
  const requestSeq = useRef(0);
  // What the last onChange said about the current value, so the async half
  // (onKnownChange) fires only when the answer actually changes.
  const lastKnown = useRef({ value: undefined, known: undefined });

  useEffect(() => {
    if (!useBackend) return;
    const q = (value || "").trim();
    if (q.length < MIN_QUERY_LENGTH) return;
    const seq = ++requestSeq.current;
    const timer = setTimeout(() => {
      api
        .get("/cities", { params: { q } })
        .then((r) => {
          if (seq !== requestSeq.current) return;
          setBackend({ q, cities: Array.isArray(r.data) ? r.data : [] });
        })
        .catch(() => {
          if (seq === requestSeq.current) setBackend({ q, cities: [] });
        });
    }, QUERY_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, useBackend]);

  const allCities = useMemo(() => {
    const current = (value || "").trim();
    const fetched =
      backend.q && current.startsWith(backend.q) ? backend.cities : [];
    const set = new Set([...ISRAEL_CITIES, ...fetched]);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "he"));
  }, [backend, value]);

  const isKnown = (candidate) => allCities.includes((candidate || "").trim());

  // Every emit goes through here so the second argument is never forgotten.
  const emit = (next, known = isKnown(next)) => {
    lastKnown.current = { value: next, known };
    onChange(next, { known });
  };

  // The async half: a fetch that resolves after the emit may change the answer
  // for the value the user still has in the field. Report that flip through
  // onKnownChange, never through a second onChange (see the prop doc above).
  useEffect(() => {
    if (!onKnownChange) return;
    if (lastKnown.current.value !== value) return;
    const known = allCities.includes((value || "").trim());
    if (known === lastKnown.current.known) return;
    lastKnown.current = { value, known };
    onKnownChange(known);
  }, [allCities, value, onKnownChange]);

  const matches = useMemo(() => {
    const q = (value || "").trim();
    if (q.length < 2) return [];
    return allCities.filter((c) => c.includes(q)).slice(0, 8);
  }, [value, allCities]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (!containerRef.current?.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleKeyDown = (e) => {
    if (!isOpen || matches.length === 0) {
      if (e.key === "Enter" && onSubmit) {
        e.preventDefault();
        onSubmit(value);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (matches[highlight]) {
        emit(matches[highlight], true);
        setIsOpen(false);
        onSubmit?.(matches[highlight]);
      } else if (onSubmit) {
        onSubmit(value);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const handleClear = () => {
    emit("", false);
    inputRef.current?.focus();
  };

  // FEEDBACK_FIXES fix 4: min-w-0 everywhere so the input can shrink
  // inside flex containers without overflowing. The previous setup would
  // clip the placeholder on narrow viewports when the wrapper was
  // squeezed by sibling filters on /map.
  return (
    <div ref={containerRef} className={`relative min-w-0 ${className}`}>
      {label && (
        <label
          htmlFor={id}
          className={labelVisible ? "block text-sm font-medium text-text mb-1 text-start" : "sr-only"}
        >
          {label}
          {required && labelVisible && (
            <span className="text-error" aria-hidden="true">
              {" *"}
            </span>
          )}
        </label>
      )}
      {/* MEH-1127: wrapper py-2 removed (input min-h-[44px] alone sets the ~44px
          field height, aligning with sibling register inputs); rounded-md matches. */}
      <div className="flex items-center gap-2 bg-white border border-border rounded-md px-3 min-w-0 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30 transition">
        <svg className="w-4 h-4 text-fg-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1 1 0 01-1.414 0l-4.243-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        {/* MEH-833: min-h-[44px] on input enforces the WCAG 2.5.5 / iOS touch-target floor on every CitySearch surface */}
        <input
          ref={inputRef}
          id={id}
          type="text"
          aria-required={required || undefined}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          value={value || ""}
          onChange={(e) => {
            emit(e.target.value);
            setIsOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={inputPlaceholder}
          className="flex-1 min-w-0 min-h-[44px] bg-transparent outline-none text-text placeholder:text-fg-muted text-start"
          dir="rtl"
          autoComplete="off"
          role="combobox"
          aria-expanded={isOpen && matches.length > 0}
          aria-autocomplete="list"
          aria-controls={`${id}-listbox`}
          // MEH-2195: completes the combobox contract — without this (and the
          // `id` on each option below) a screen reader has no way to announce
          // which suggestion the arrow keys are on. Gated on the SAME condition
          // as aria-expanded two lines up, so the two can never disagree about
          // whether the list is open.
          //
          // Clamped like HeroSearch.jsx:331-335: `highlight` is state while
          // `matches` is derived from `value`, so pointing at an id that does
          // not exist is the one failure worse than omitting the attribute.
          // Not reachable today (onChange resets to 0, ArrowDown is bounded,
          // and the async /cities merge only ever grows the set) — it is the
          // cheap guard, not a fix for an observed bug.
          aria-activedescendant={
            isOpen && matches.length > 0
              ? `${id}-option-${Math.min(highlight, matches.length - 1)}`
              : undefined
          }
        />
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="text-fg-muted hover:text-text"
            aria-label={t("clear_aria")}
          >
            ×
          </button>
        )}
      </div>

      {isOpen && matches.length > 0 && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          // MEH-2108: z-[1010], matching AddressSearch.jsx:266 (3f9e7e5f). At the
          // previous z-[1000] this list tied EXACTLY with the values globals.css
          // forces on Leaflet controls (:324, :328) and with the MiniMap's own
          // fullscreen button (MiniMap.jsx:56) — and at equal z-index paint order
          // falls to DOM order, where the map is later (RegisterProducerClient
          // :1080 list vs :1206 map). Measured before the change: 9 of 15 sample
          // points inside the 72px intersection band were painted by map chrome.
          // 1010 clears panes:400, controls:1000 and the attribution:1001, and
          // stays BELOW the global header (Header.jsx:321, z-[1050]) so the header
          // still wins — matching the ledger in .claude/rules/rtl.md.
          className="absolute z-[1010] mt-1 w-full bg-white border border-border rounded-md shadow-lg max-h-72 overflow-auto"
        >
          {matches.map((city, idx) => (
            <li
              key={city}
              // MEH-2195: the target of aria-activedescendant above. Index-based
              // rather than city-based because the input's value is arbitrary
              // user text and a Hebrew city name is not a valid id fragment.
              id={`${id}-option-${idx}`}
              role="option"
              aria-selected={idx === highlight}
              onMouseDown={(e) => {
                e.preventDefault();
                emit(city, true);
                setIsOpen(false);
                onSubmit?.(city);
              }}
              onMouseEnter={() => setHighlight(idx)}
              className={`px-3 py-2 cursor-pointer text-sm ${
                idx === highlight
                  ? "bg-green-50 text-primary"
                  : "text-text"
              }`}
            >
              {city}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
