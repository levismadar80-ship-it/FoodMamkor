"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";

/**
 * MEH-213: Multi-select city autocomplete backed by GET /cities?q=.
 *
 * Props:
 *   value    — string[] of currently selected city names
 *   onChange — (cities: string[]) => void
 *
 * RTL-aware: uses start-* and end-* logical classes. Never left-* or right-*.
 * Keyboard nav: ArrowUp/Down to move, Enter to add, Backspace to remove last.
 */
export default function CitiesAutocomplete({ value = [], onChange }) {
  const t = useTranslations("search.cities_autocomplete");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const listboxId = useRef(`cities-listbox-${Math.random().toString(36).slice(2)}`).current;

  const fetchSuggestions = useCallback((q) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await api.get("/cities", { params: { q: q || undefined } });
        const results = (r.data || []).filter((c) => !value.includes(c));
        setSuggestions(results);
        setOpen(results.length > 0);
        setActiveIdx(-1);
      } catch {
        setSuggestions([]);
        setOpen(false);
      }
    }, 200);
  }, [value]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleInput = (e) => {
    const q = e.target.value;
    setQuery(q);
    fetchSuggestions(q);
  };

  const addCity = (city) => {
    if (!value.includes(city)) onChange([...value, city]);
    setQuery("");
    setSuggestions([]);
    setOpen(false);
    setActiveIdx(-1);
    inputRef.current?.focus();
  };

  const removeCity = (city) => {
    onChange(value.filter((c) => c !== city));
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIdx >= 0 && suggestions[activeIdx]) {
        addCity(suggestions[activeIdx]);
      } else if (query.trim() && suggestions.length === 1) {
        addCity(suggestions[0]);
      }
    } else if (e.key === "Backspace" && !query && value.length > 0) {
      removeCity(value[value.length - 1]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIdx(-1);
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (activeIdx >= 0 && listRef.current) {
      const item = listRef.current.children[activeIdx];
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIdx]);

  return (
    <div className="relative">
      {/* Selected chips + input */}
      <div
        className="min-h-[42px] flex flex-wrap gap-1.5 items-center border border-border rounded-[12px] px-3 py-2 bg-white focus-within:border-primary cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((city) => (
          <span
            key={city}
            className="inline-flex items-center gap-1 bg-green-50 text-site-text border border-border rounded-full text-[12px] px-2.5 py-0.5"
          >
            {city}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeCity(city); }}
              aria-label={t("remove_aria", { city })}
              className="text-fg-muted hover:text-red-500 transition leading-none"
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (suggestions.length > 0) setOpen(true); else fetchSuggestions(query); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={value.length === 0 ? t("placeholder") : ""}
          className="flex-1 min-w-[120px] outline-none text-sm bg-transparent"
          dir="rtl"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={activeIdx >= 0 ? `city-opt-${activeIdx}` : undefined}
        />
      </div>

      {/* Dropdown */}
      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          className="absolute z-50 start-0 end-0 mt-1 max-h-48 overflow-y-auto bg-white border border-border rounded-[12px] shadow-md text-sm"
        >
          {suggestions.map((city, i) => (
            <li
              key={city}
              id={`city-opt-${i}`}
              role="option"
              aria-selected={i === activeIdx}
              onMouseDown={(e) => { e.preventDefault(); addCity(city); }}
              onMouseEnter={() => setActiveIdx(i)}
              className={`px-4 py-2.5 cursor-pointer transition ${
                i === activeIdx ? "bg-green-50 text-primary" : "hover:bg-background"
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
