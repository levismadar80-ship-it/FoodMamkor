"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ISRAEL_CITIES } from "@/data/cities";
import api from "@/lib/api";

/**
 * CitySearch — autocomplete input for Israeli cities.
 *
 * Props:
 *   - value (string)
 *   - onChange (fn(newValue))
 *   - placeholder
 *   - label (visible or sr-only, always required for a11y)
 *   - id (required for <label htmlFor>)
 *   - onSubmit (fn, called when user hits Enter)
 *   - useBackend (boolean) — if true, also merges results from GET /cities
 *
 * Shows dropdown after 2 characters. Keyboard navigation: ArrowUp/Down/Enter/Escape.
 */
export default function CitySearch({
  value,
  onChange,
  placeholder = "חפשי עיר...",
  label,
  id,
  onSubmit,
  useBackend = true,
  className = "",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [backendCities, setBackendCities] = useState([]);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Load cities from backend once — de-dupes with the static list
  useEffect(() => {
    if (!useBackend) return;
    api
      .get("/cities")
      .then((r) => setBackendCities(Array.isArray(r.data) ? r.data : []))
      .catch(() => setBackendCities([]));
  }, [useBackend]);

  const allCities = useMemo(() => {
    const set = new Set([...ISRAEL_CITIES, ...backendCities]);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "he"));
  }, [backendCities]);

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
        onChange(matches[highlight]);
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
    onChange("");
    inputRef.current?.focus();
  };

  // FEEDBACK_FIXES fix 4: min-w-0 everywhere so the input can shrink
  // inside flex containers without overflowing. The previous setup would
  // clip the placeholder on narrow viewports when the wrapper was
  // squeezed by sibling filters on /map.
  return (
    <div ref={containerRef} className={`relative min-w-0 ${className}`}>
      {label && (
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
      )}
      <div className="flex items-center gap-2 bg-white border border-border rounded-[8px] px-3 py-2 min-w-0 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30 transition">
        <svg className="w-4 h-4 text-site-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1 1 0 01-1.414 0l-4.243-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={value || ""}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 min-w-0 bg-transparent outline-none text-site-text placeholder:text-site-muted text-right"
          dir="rtl"
          autoComplete="off"
          role="combobox"
          aria-expanded={isOpen && matches.length > 0}
          aria-autocomplete="list"
          aria-controls={`${id}-listbox`}
        />
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="text-site-muted hover:text-site-text"
            aria-label="נקה עיר"
          >
            ×
          </button>
        )}
      </div>

      {isOpen && matches.length > 0 && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-50 mt-1 w-full bg-white border border-border rounded-[8px] shadow-lg max-h-72 overflow-auto"
        >
          {matches.map((city, idx) => (
            <li
              key={city}
              role="option"
              aria-selected={idx === highlight}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(city);
                setIsOpen(false);
                onSubmit?.(city);
              }}
              onMouseEnter={() => setHighlight(idx)}
              className={`px-3 py-2 cursor-pointer text-sm ${
                idx === highlight
                  ? "bg-light text-primary"
                  : "text-site-text"
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
