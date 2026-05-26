"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * AddressSearch — Israeli address autocomplete via OpenStreetMap Nominatim.
 *
 * Why Nominatim:
 *   - Free, no API key, no billing surprises (unlike Google Places)
 *   - Hebrew-friendly (`accept-language=he`)
 *   - Restricted to Israel via `countrycodes=il` for clean results
 *   - Returns a structured `address` object (street, suburb/neighborhood,
 *     city, postcode) plus `lat`/`lon` — exactly what the listing forms
 *     need to fill in once instead of asking the user to type each field.
 *
 * Usage policy notes:
 *   - Nominatim's policy: max ~1 req/sec from a single source. We debounce
 *     to 450 ms and only query when the user has typed ≥ 3 chars.
 *   - For high-volume production usage we should proxy through our backend
 *     with a User-Agent identifying mehamakor.co.il (browsers can't set
 *     User-Agent client-side). MVP volume is fine direct.
 *   - The component degrades gracefully: on network failure or rate-limit
 *     it just keeps the field as a free-text input — users can still type
 *     a manual address.
 *
 * Props:
 *   - id (required) — for <label htmlFor>
 *   - label (string, sr-only-friendly)
 *   - value (string) — current input text
 *   - onChange(text)            — fires on every keystroke (free text)
 *   - onSelect({ street, neighborhood, city, postcode, lat, lng, displayName })
 *                                — fires when user picks a result
 *   - placeholder
 *   - className (optional, applied to wrapper)
 */
export default function AddressSearch({
  id,
  label,
  value,
  onChange,
  onSelect,
  placeholder,
  className = "",
}) {
  const t = useTranslations("search.address_search");
  const inputPlaceholder = placeholder ?? t("placeholder");
  const [results, setResults] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  // Track the latest in-flight request so a slow earlier response can't
  // overwrite a fresher result (classic out-of-order async hazard).
  const requestSeq = useRef(0);

  // Debounced Nominatim lookup — see usage policy notes above.
  useEffect(() => {
    const q = (value || "").trim();
    if (q.length < 3) {
      setResults([]);
      return;
    }
    const seq = ++requestSeq.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const url =
          "https://nominatim.openstreetmap.org/search" +
          `?q=${encodeURIComponent(q)}` +
          "&countrycodes=il" +
          "&format=json" +
          "&addressdetails=1" +
          "&accept-language=he" +
          "&limit=6";
        const res = await fetch(url, {
          headers: {
            // Browsers strip/normalise User-Agent and Referer; setting
            // Accept-Language is the one identification handle we have.
            "Accept-Language": "he,en;q=0.8",
          },
        });
        if (seq !== requestSeq.current) return; // stale
        if (!res.ok) {
          setResults([]);
          return;
        }
        const data = await res.json();
        if (seq !== requestSeq.current) return; // stale
        setResults(Array.isArray(data) ? data : []);
        setHighlight(0);
        setIsOpen(true);
      } catch {
        // Network error / blocked / offline — silently degrade. The input
        // still works as plain text so the user can type their address.
        if (seq === requestSeq.current) setResults([]);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (!containerRef.current?.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /** Pull what we care about out of a Nominatim result. */
  const normalize = (r) => {
    const a = r.address || {};
    // Nominatim's "city" can land in any of these fields depending on
    // whether the place is a metropolis, town, village, etc.
    const city =
      a.city || a.town || a.village || a.municipality || a.county || "";
    const neighborhood =
      a.neighbourhood || a.suburb || a.quarter || a.city_district || "";
    // Build a "street + number" string from the parts.
    const street = [a.road, a.house_number].filter(Boolean).join(" ");
    return {
      displayName: r.display_name || "",
      street,
      neighborhood,
      city,
      postcode: a.postcode || "",
      lat: r.lat ? Number(r.lat) : null,
      lng: r.lon ? Number(r.lon) : null,
    };
  };

  const selectResult = (r) => {
    const picked = normalize(r);
    // Update the visible text to the street part if we have one,
    // otherwise the full display name (so the user sees something useful).
    onChange(picked.street || picked.displayName);
    onSelect?.(picked);
    setIsOpen(false);
    setResults([]);
  };

  const handleKeyDown = (e) => {
    if (!isOpen || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[highlight]) selectResult(results[highlight]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const listboxId = `${id}-listbox`;

  return (
    <div ref={containerRef} className={`relative min-w-0 ${className}`}>
      {label && (
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
      )}
      <div className="flex items-center gap-2 bg-white border border-border rounded-[8px] px-3 py-2 min-w-0 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30 transition">
        <svg
          className="w-4 h-4 text-fg-muted shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17.657 16.657L13.414 20.9a1 1 0 01-1.414 0l-4.243-4.243a8 8 0 1111.314 0z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={value || ""}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={inputPlaceholder}
          className="flex-1 min-w-0 bg-transparent outline-none text-site-text placeholder:text-fg-muted"
          autoComplete="off"
          role="combobox"
          aria-expanded={isOpen && results.length > 0}
          aria-autocomplete="list"
          aria-controls={listboxId}
        />
        {loading && (
          <span
            aria-hidden="true"
            className="text-xs text-fg-muted shrink-0"
          >
            …
          </span>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 w-full bg-white border border-border rounded-[8px] shadow-lg max-h-72 overflow-auto"
        >
          {results.map((r, idx) => {
            const picked = normalize(r);
            const primary = picked.street || picked.displayName.split(",")[0];
            const secondary = [picked.neighborhood, picked.city]
              .filter(Boolean)
              .join(" · ");
            return (
              <li
                key={r.place_id || idx}
                role="option"
                aria-selected={idx === highlight}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectResult(r);
                }}
                onMouseEnter={() => setHighlight(idx)}
                className={`px-3 py-2 cursor-pointer text-sm border-b border-border last:border-b-0 ${
                  idx === highlight
                    ? "bg-green-50 text-primary"
                    : "text-site-text"
                }`}
              >
                <div className="font-medium">{primary}</div>
                {secondary && (
                  <div className="text-xs text-fg-muted mt-0.5">
                    {secondary}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
