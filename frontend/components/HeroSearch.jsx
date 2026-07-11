"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlass, ClockCounterClockwise, Fire } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { highlightMatch } from "@/lib/highlightMatch";

/**
 * HeroSearch — hero autocomplete for the homepage (MEH-99).
 *
 * Routes to /producers?q= on submit.
 *
 * Three dropdown states:
 *   empty + focused + recent exist    → recent searches (🕐, localStorage)
 *   empty + focused + no recent       → trending searches (🔥, /search/trending)
 *   ≥2 chars typed                    → live autocomplete (producers / categories / cities)
 */

// --- Recent searches helpers (localStorage) ---
const RECENT_KEY = "mehamakor_recent_searches";
const MAX_RECENT = 5;
const DEBOUNCE_MS = 300;
const MAX_PER_SECTION = 5;
const EMPTY_RESULT = { producers: [], products: [], cities: [], categories: [] };

function readRecent() {
  try {
    const raw = typeof window !== "undefined" && localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function pushRecent(query) {
  try {
    const prev = readRecent();
    const next = [query, ...prev.filter((q) => q !== query)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    return next;
  } catch {
    return readRecent();
  }
}

function deleteRecent(query) {
  try {
    const next = readRecent().filter((q) => q !== query);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    return next;
  } catch {
    return readRecent();
  }
}

export default function HeroSearch({ placeholder, srLabel, className = "" }) {
  const t = useTranslations("search.hero");
  const router = useRouter();
  const [value, setValue] = useState("");
  const [results, setResults] = useState(EMPTY_RESULT);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  const [trending, setTrending] = useState([]);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const trendingFetchedRef = useRef(false);

  // Hydrate recent searches after mount (localStorage is client-only).
  useEffect(() => {
    setRecentSearches(readRecent());
  }, []);

  // Debounced autocomplete fetch.
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setResults(EMPTY_RESULT);
      return;
    }
    const handle = setTimeout(() => {
      abortRef.current?.abort?.();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      api
        .get("/search", {
          params: { q, limit: MAX_PER_SECTION },
          signal: controller.signal,
        })
        .then((r) => setResults(r.data || EMPTY_RESULT))
        .catch(() => setResults(EMPTY_RESULT))
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [value]);

  // Outside-click closes dropdown.
  useEffect(() => {
    const handler = (e) => {
      if (!containerRef.current?.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Flat rows for keyboard navigation in autocomplete mode.
  const flatRows = useMemo(() => {
    const rows = [];
    for (const p of results.producers.slice(0, MAX_PER_SECTION)) {
      rows.push({ kind: "producer", id: p.id, data: p });
    }
    for (const c of results.categories.slice(0, MAX_PER_SECTION)) {
      rows.push({ kind: "category", id: c.id, data: c });
    }
    for (const city of results.cities.slice(0, MAX_PER_SECTION)) {
      rows.push({ kind: "city", id: city, data: city });
    }
    return rows;
  }, [results]);

  // Empty-state rows (recent OR trending) as keyboard-navigable options,
  // so the dropdown is one listbox model in both states (ARIA APG combobox).
  const emptyRows = useMemo(() => {
    if (recentSearches.length > 0) {
      return recentSearches.map((q) => ({ kind: "recent", id: q, data: q }));
    }
    return trending.map((q) => ({ kind: "trending", id: q, data: q }));
  }, [recentSearches, trending]);

  // Derived open/mode flags (used by both the keyboard handler and render).
  const trimmed = value.trim();
  const isAutocomplete = trimmed.length >= 2;
  const hasAutoResults = flatRows.length > 0;
  const showAutocomplete = isOpen && isAutocomplete;
  const showEmpty =
    isOpen && !isAutocomplete && (recentSearches.length > 0 || trending.length > 0);
  // The single set of rows the arrow keys + activedescendant address.
  const navRows = showAutocomplete ? flatRows : showEmpty ? emptyRows : [];

  // Keep the highlighted index within the currently-shown row set.
  useEffect(() => {
    setHighlightIdx((i) => (i > navRows.length - 1 ? 0 : i));
  }, [navRows.length]);

  // Unified selection dispatch — autocomplete rows navigate, query rows search.
  const selectRow = (row) => {
    if (row.kind === "recent" || row.kind === "trending") {
      submitRaw(row.data);
    } else {
      navigate(row);
    }
  };

  const handleFocus = () => {
    setIsOpen(true);
    setHighlightIdx(0);
    // Fetch trending once per mount, only when input is empty.
    if (!value.trim() && !trendingFetchedRef.current) {
      trendingFetchedRef.current = true;
      api
        .get("/search/trending")
        .then((r) => setTrending(Array.isArray(r.data) ? r.data : []))
        .catch(() => {});
    }
  };

  const submitRaw = (q = value.trim()) => {
    if (!q) return;
    const next = pushRecent(q);
    setRecentSearches(next);
    setValue(q);
    setIsOpen(false);
    router.push(`/producers?q=${encodeURIComponent(q)}`);
  };

  const navigate = (row) => {
    setIsOpen(false);
    if (row.kind === "producer") {
      const path = row.data.slug ? `/${row.data.slug}` : `/producer/${row.data.id}`;
      router.push(path);
    } else if (row.kind === "category") {
      submitRaw(row.data.name);
    } else if (row.kind === "city") {
      submitRaw(row.data);
    }
  };

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === "Enter") {
        e.preventDefault();
        submitRaw();
      }
      return;
    }

    // One keyboard model for both dropdown states (autocomplete + recent/
    // trending): ArrowUp/Down move the active option, Enter selects it,
    // Escape closes, Delete removes the active recent query (APG combobox).
    if (navRows.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIdx((i) => Math.min(i + 1, navRows.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const row = navRows[highlightIdx];
        if (row) selectRow(row);
        else submitRaw();
      } else if (e.key === "Escape") {
        setIsOpen(false);
      } else if (e.key === "Delete" && navRows[highlightIdx]?.kind === "recent") {
        e.preventDefault();
        const next = deleteRecent(navRows[highlightIdx].data);
        setRecentSearches(next);
        setHighlightIdx((i) => Math.max(0, Math.min(i, next.length - 1)));
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      submitRaw();
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  let cursor = 0;

  return (
    <div ref={containerRef} className={`relative flex items-center gap-2 min-w-0 ${className}`}>
      {srLabel && (
        <label htmlFor="hero-search-input" className="sr-only">
          {srLabel}
        </label>
      )}
      <input
        ref={inputRef}
        id="hero-search-input"
        data-testid="hero-search"
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setIsOpen(true);
          setHighlightIdx(0);
        }}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="flex-1 min-w-0 bg-transparent outline-none text-text placeholder:text-fg-muted text-base focus-visible:ring-2 focus-visible:ring-primary/40 rounded-full"
        autoComplete="off"
        role="combobox"
        aria-expanded={showAutocomplete || showEmpty}
        aria-autocomplete="list"
        aria-controls="hero-search-listbox"
        aria-activedescendant={
          isOpen && navRows.length > 0
            ? `hero-search-row-${Math.min(highlightIdx, navRows.length - 1)}`
            : undefined
        }
      />

      {/* Magnifying glass on the end-side (left in RTL) */}
      <button
        type="button"
        onClick={() => submitRaw()}
        // MEH-991 (HOME-05): filled green square submit per S14 (was icon-only).
        className="shrink-0 bg-action-primary hover:bg-action-primary-hover text-white rounded-md transition p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label={t("submit_aria")}
        data-testid="hero-search-submit"
      >
        <MagnifyingGlass size={22} weight="bold" aria-hidden="true" />
      </button>

      {/* ---- Autocomplete dropdown (≥2 chars) ---- */}
      {showAutocomplete && (
        <div
          id="hero-search-listbox"
          role="listbox"
          data-testid="hero-search-dropdown"
          className="absolute z-[1000] top-full mt-2 inset-x-0 bg-white border border-border rounded-[12px] shadow-xl max-h-[70vh] overflow-auto text-start"
          dir="rtl"
        >
          {loading && !hasAutoResults && (
            <p className="px-3 py-3 text-xs text-fg-muted">{t("loading")}</p>
          )}
          {!loading && !hasAutoResults && (
            <p className="px-3 py-3 text-xs text-fg-muted">
              {t("no_results_for")} &quot;{trimmed}&quot;
            </p>
          )}

          {results.producers.length > 0 && (
            <Section title={t("section_producers")}>
              {results.producers.slice(0, MAX_PER_SECTION).map((p) => {
                const i = cursor++;
                return (
                  <Row
                    key={`prod-${p.id}`}
                    id={`hero-search-row-${i}`}
                    active={i === highlightIdx}
                    onSelect={() => navigate({ kind: "producer", data: p })}
                    onHover={() => setHighlightIdx(i)}
                  >
                    <div className="font-medium">{highlightMatch(p.name, trimmed)}</div>
                    {p.city && (
                      <div className="text-xs text-fg-muted mt-0.5">{p.city}</div>
                    )}
                  </Row>
                );
              })}
            </Section>
          )}

          {results.categories.length > 0 && (
            <Section title={t("section_categories")}>
              {results.categories.slice(0, MAX_PER_SECTION).map((c) => {
                const i = cursor++;
                return (
                  <Row
                    key={`cat-${c.id}`}
                    id={`hero-search-row-${i}`}
                    active={i === highlightIdx}
                    onSelect={() => navigate({ kind: "category", data: c })}
                    onHover={() => setHighlightIdx(i)}
                  >
                    {highlightMatch(c.name, trimmed)}
                  </Row>
                );
              })}
            </Section>
          )}

          {results.cities.length > 0 && (
            <Section title={t("section_cities")}>
              {results.cities.slice(0, MAX_PER_SECTION).map((city) => {
                const i = cursor++;
                return (
                  <Row
                    key={`city-${city}`}
                    id={`hero-search-row-${i}`}
                    active={i === highlightIdx}
                    onSelect={() => navigate({ kind: "city", data: city })}
                    onHover={() => setHighlightIdx(i)}
                  >
                    {highlightMatch(city, trimmed)}
                  </Row>
                );
              })}
            </Section>
          )}
        </div>
      )}

      {/* ---- Empty-input dropdown (recent or trending) ---- */}
      {showEmpty && (
        <div
          id="hero-search-listbox"
          role="listbox"
          data-testid="hero-search-history"
          className="absolute z-[1000] top-full mt-2 inset-x-0 bg-white border border-border rounded-[12px] shadow-xl text-start"
          dir="rtl"
        >
          {recentSearches.length > 0 ? (
            <Section title={t("recent_heading")}>
              {recentSearches.map((q, i) => (
                <li
                  key={q}
                  id={`hero-search-row-${i}`}
                  role="option"
                  aria-selected={i === highlightIdx}
                  className={`flex items-center justify-between px-3 py-2.5 text-sm cursor-pointer min-h-[44px] ${
                    i === highlightIdx ? "bg-green-50 text-primary" : "text-text hover:bg-green-50/50"
                  }`}
                  onMouseEnter={() => setHighlightIdx(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    submitRaw(q);
                  }}
                >
                  <span className="flex items-center gap-2">
                    <ClockCounterClockwise
                      size={16}
                      className="text-fg-muted shrink-0"
                      aria-hidden="true"
                    />
                    {q}
                  </span>
                  {/* tabIndex -1: not a tab stop inside the option; keyboard
                      users remove via the Delete key (handleKeyDown). */}
                  <button
                    type="button"
                    tabIndex={-1}
                    className="text-fg-muted hover:text-text p-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    aria-label={t("remove_recent_aria", { q })}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setRecentSearches(deleteRecent(q));
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </Section>
          ) : (
            <Section title={t("trending_heading")}>
              {trending.map((q, i) => (
                <li
                  key={q}
                  id={`hero-search-row-${i}`}
                  role="option"
                  aria-selected={i === highlightIdx}
                  className={`flex items-center gap-2 px-3 py-2.5 text-sm cursor-pointer min-h-[44px] ${
                    i === highlightIdx ? "bg-green-50 text-primary" : "text-text hover:bg-green-50/50"
                  }`}
                  onMouseEnter={() => setHighlightIdx(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    submitRaw(q);
                  }}
                >
                  <Fire
                    size={16}
                    className="text-primary shrink-0"
                    aria-hidden="true"
                  />
                  {q}
                </li>
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="py-1">
      {/* MEH-1103: uppercase/tracking-wider dropped (MEH-867 rule — Hebrew has
          no uppercase and letter-spacing harms RTL legibility). Refs MEH-1073 T10. */}
      <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-fg-muted">
        {title}
      </div>
      <ul className="py-1">{children}</ul>
    </div>
  );
}

function Row({ id, active, onSelect, onHover, children }) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      onMouseDown={(e) => {
        e.preventDefault();
        onSelect();
      }}
      onMouseEnter={onHover}
      className={`px-3 py-2.5 cursor-pointer text-sm min-h-[44px] flex items-start flex-col justify-center ${
        active ? "bg-green-50 text-primary" : "text-text hover:bg-green-50/50"
      }`}
    >
      {children}
    </li>
  );
}
