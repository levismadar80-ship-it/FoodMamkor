"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlass } from "@phosphor-icons/react";
import api from "@/lib/api";
import { highlightMatch } from "@/lib/highlight";

/**
 * HeroSearch — hero autocomplete for the homepage (MEH-99).
 *
 * Differences from SmartSearch:
 *   - Submitting raw text navigates to /producers?q= (filtered listing).
 *   - Category selections navigate to /producers?q=<name>.
 *   - City selections navigate to /producers?q=<city>.
 *   - Producer/product selections go to the producer detail page.
 *   - Max 5 suggestions per section, 300ms debounce.
 *   - Self-contained: includes the magnifying glass icon on the end side (RTL-left).
 */

function Highlighted({ text, query }) {
  const parts = highlightMatch(text, query);
  return (
    <>
      {parts.map((part, i) =>
        typeof part === "string" ? (
          <span key={i}>{part}</span>
        ) : (
          <mark key={i} className="bg-yellow-100 text-inherit rounded px-0.5">
            {part.match}
          </mark>
        ),
      )}
    </>
  );
}

const DEBOUNCE_MS = 300;
const MAX_PER_SECTION = 5;
const EMPTY_RESULT = { producers: [], products: [], cities: [], categories: [] };

export default function HeroSearch({ placeholder, srLabel, className = "" }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [results, setResults] = useState(EMPTY_RESULT);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

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
        .get("/search", { params: { q, limit: MAX_PER_SECTION }, signal: controller.signal })
        .then((r) => setResults(r.data || EMPTY_RESULT))
        .catch(() => setResults(EMPTY_RESULT))
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [value]);

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

  useEffect(() => {
    const handler = (e) => {
      if (!containerRef.current?.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const navigate = (row) => {
    setIsOpen(false);
    if (row.kind === "producer") {
      const path = row.data.slug ? `/${row.data.slug}` : `/producer/${row.data.id}`;
      router.push(path);
    } else if (row.kind === "category") {
      router.push(`/producers?q=${encodeURIComponent(row.data.name)}`);
    } else if (row.kind === "city") {
      router.push(`/producers?q=${encodeURIComponent(row.data)}`);
    }
  };

  const submitRaw = () => {
    const q = value.trim();
    if (!q) return;
    setIsOpen(false);
    router.push(`/producers?q=${encodeURIComponent(q)}`);
  };

  const handleKeyDown = (e) => {
    if (!isOpen || flatRows.length === 0) {
      if (e.key === "Enter") {
        e.preventDefault();
        submitRaw();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, flatRows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = flatRows[highlightIdx];
      if (row) navigate(row);
      else submitRaw();
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const trimmed = value.trim();
  const hasResults = flatRows.length > 0;
  const showDropdown = isOpen && trimmed.length >= 2;
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
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setIsOpen(true);
          setHighlightIdx(0);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="flex-1 min-w-0 bg-transparent outline-none text-site-text placeholder:text-site-muted text-base focus-visible:ring-2 focus-visible:ring-primary/40 rounded-full"
        autoComplete="off"
        role="combobox"
        aria-expanded={showDropdown && hasResults}
        aria-autocomplete="list"
        aria-controls="hero-search-listbox"
        aria-activedescendant={hasResults ? `hero-search-row-${highlightIdx}` : undefined}
      />

      {/* Magnifying glass on the end-side (left in RTL) */}
      <button
        type="button"
        onClick={submitRaw}
        className="shrink-0 text-primary hover:text-primary-dark transition p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label="חיפוש"
      >
        <MagnifyingGlass size={22} weight="bold" aria-hidden="true" />
      </button>

      {showDropdown && (
        <div
          id="hero-search-listbox"
          role="listbox"
          data-testid="hero-search-dropdown"
          className="absolute z-[1000] top-full mt-2 inset-x-0 bg-white border border-border rounded-[12px] shadow-xl max-h-[70vh] overflow-auto text-right"
          dir="rtl"
        >
          {loading && !hasResults && (
            <p className="px-3 py-3 text-xs text-site-muted">טוענת תוצאות...</p>
          )}
          {!loading && !hasResults && (
            <p className="px-3 py-3 text-xs text-site-muted">
              אין תוצאות עבור &quot;{trimmed}&quot;
            </p>
          )}

          {results.producers.length > 0 && (
            <Section title="🏪 בתי עסק">
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
                    <div className="font-medium">
                      <Highlighted text={p.name} query={trimmed} />
                    </div>
                    {p.city && (
                      <div className="text-xs text-site-muted mt-0.5">{p.city}</div>
                    )}
                  </Row>
                );
              })}
            </Section>
          )}

          {results.categories.length > 0 && (
            <Section title="🏷️ קטגוריות">
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
                    <span>{c.emoji ? `${c.emoji} ` : ""}</span>
                    <Highlighted text={c.name} query={trimmed} />
                  </Row>
                );
              })}
            </Section>
          )}

          {results.cities.length > 0 && (
            <Section title="📍 ערים">
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
                    <Highlighted text={city} query={trimmed} />
                  </Row>
                );
              })}
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
      <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-site-muted">
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
      className={`px-3 py-2.5 cursor-pointer text-sm ${
        active ? "bg-light text-primary" : "text-site-text hover:bg-light/50"
      }`}
    >
      {children}
    </li>
  );
}
