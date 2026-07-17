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
 *
 * MEH-1128 D2 — token-recipe fallback (NOT ui/Input): a multi-select chip
 * input — selected-city chips + a flex-1 text input share one `focus-within`
 * bordered box, above an absolutely-positioned dropdown. There is no single
 * value and no endAdornment slot, so the ui/Input primitive can't wrap it.
 * D2 converges only the field radius to the canon (`rounded-[12px]`→
 * `rounded-md`); the composed structure + debounce/fetch/keyboard nav are
 * untouched (over-engineering guard: no autocomplete refactor).
 *
 * MEH-1254 — commit-on-type fix (Fluent/Clarity combobox pattern): a fully
 * typed city that exactly matches a suggestion commits on Enter (even with
 * activeIdx === -1 and multiple suggestions) and on blur; non-matching text
 * clears on blur so it's obvious it was NOT saved. autoComplete="off" keeps
 * browser autofill from bypassing the suggestion flow, and a muted helper
 * line shows while typed text is still uncommitted.
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

  const addCity = (city, { refocus = true } = {}) => {
    // MEH-1254: cancel any in-flight debounce — a late fetch would reopen
    // the dropdown after the field was already committed/cleared.
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.includes(city)) onChange([...value, city]);
    setQuery("");
    setSuggestions([]);
    setOpen(false);
    setActiveIdx(-1);
    if (refocus) inputRef.current?.focus();
  };

  const removeCity = (city) => {
    onChange(value.filter((c) => c !== city));
  };

  // MEH-1254: a fully typed city counts as a selection when it exactly
  // matches one of the current suggestions (compare after trim).
  const exactMatch = (q) =>
    q ? suggestions.find((c) => c.trim() === q) || null : null;

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const exact = exactMatch(query.trim());
      if (activeIdx >= 0 && suggestions[activeIdx]) {
        addCity(suggestions[activeIdx]);
      } else if (exact) {
        addCity(exact);
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

  // MEH-1254: commit an exact match on blur (click on "שמירה" must not lose
  // the typed city); clear non-matching text so it's obvious it wasn't saved.
  // Commit/clear runs synchronously — the parent reads state right after blur
  // on a save click. Dropdown options preventDefault on mousedown, so picking
  // one never triggers this path.
  const handleBlur = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    const exact = exactMatch(q);
    if (exact) {
      addCity(exact, { refocus: false });
    } else if (q) {
      setQuery("");
      setSuggestions([]);
    }
    setTimeout(() => setOpen(false), 150);
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
        className="min-h-[42px] flex flex-wrap gap-1.5 items-center border border-border rounded-md px-3 py-2 bg-white focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30 cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((city) => (
          <span
            key={city}
            className="inline-flex items-center gap-1 bg-green-50 text-text border border-border rounded-full text-[12px] px-2.5 py-0.5"
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
          onBlur={handleBlur}
          placeholder={value.length === 0 ? t("placeholder") : ""}
          className="flex-1 min-w-[120px] outline-none text-sm bg-transparent"
          autoComplete="off"
          dir="rtl"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={activeIdx >= 0 ? `city-opt-${activeIdx}` : undefined}
        />
      </div>

      {/* MEH-1254: typed-but-uncommitted hint — muted, not an error */}
      {query.trim() !== "" && (
        <p className="mt-1 text-xs text-fg-muted">{t("commit_hint")}</p>
      )}

      {/* Dropdown */}
      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          className="absolute z-50 start-0 end-0 mt-1 max-h-48 overflow-y-auto bg-white border border-border rounded-md shadow-md text-sm"
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
