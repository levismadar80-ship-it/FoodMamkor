"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { highlightMatch } from "@/lib/highlight";

/**
 * SmartSearch — hero autocomplete with 4 grouped sections (MEH-13):
 *   בתי עסק (producers) · מוצרים (products) · ערים · קטגוריות
 *
 * Backend: GET /search?q=... returns {producers, products, cities, categories}.
 * This component debounces keystrokes at 200ms, renders non-empty
 * sections, supports keyboard navigation across the whole flat list of
 * rows, highlights matching text via <mark>, and falls back to
 * navigating to /search?q=<raw> when the user hits Enter without
 * selecting a suggestion.
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

const DEBOUNCE_MS = 200;
const EMPTY_RESULT = { producers: [], products: [], cities: [], categories: [] };

export default function SmartSearch({ placeholder, srLabel, className = "" }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [results, setResults] = useState(EMPTY_RESULT);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  // Debounced fetch. Cancels in-flight requests if the user keeps typing.
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
        .get("/search", { params: { q }, signal: controller.signal })
        .then((r) => setResults(r.data || EMPTY_RESULT))
        .catch(() => setResults(EMPTY_RESULT))
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [value]);

  // Flat list of rows across sections so keyboard nav is single-cursor.
  const flatRows = useMemo(() => {
    const rows = [];
    for (const p of results.producers) {
      rows.push({ kind: "producer", id: p.id, data: p });
    }
    for (const p of results.products) {
      rows.push({ kind: "product", id: p.id, data: p });
    }
    for (const c of results.cities) {
      rows.push({ kind: "city", id: c, data: c });
    }
    for (const c of results.categories) {
      rows.push({ kind: "category", id: c.id, data: c });
    }
    return rows;
  }, [results]);

  // Outside click closes.
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
      const path = row.data.slug
        ? `/${row.data.slug}`
        : `/producer/${row.data.id}`;
      router.push(path);
    } else if (row.kind === "product") {
      const path = row.data.producer_slug
        ? `/${row.data.producer_slug}`
        : `/producer/${row.data.producer_id}`;
      router.push(path);
    } else if (row.kind === "city") {
      router.push(`/search?q=${encodeURIComponent(row.data)}`);
    } else if (row.kind === "category") {
      router.push(`/?category=${row.data.id}`);
    }
  };

  const submitRaw = () => {
    const q = value.trim();
    if (!q) return;
    setIsOpen(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
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
  // Render index helpers so each section can pass its absolute index for
  // aria-activedescendant and highlight.
  let cursor = 0;

  return (
    <div ref={containerRef} className={`relative min-w-0 ${className}`}>
      {srLabel && (
        <label htmlFor="smart-search-input" className="sr-only">
          {srLabel}
        </label>
      )}
      <input
        ref={inputRef}
        id="smart-search-input"
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
        className="flex-1 w-full bg-transparent outline-none text-site-text placeholder:text-site-muted text-base focus-visible:ring-2 focus-visible:ring-primary/40 rounded-full"
        autoComplete="off"
        role="combobox"
        aria-expanded={showDropdown && hasResults}
        aria-autocomplete="list"
        aria-controls="smart-search-listbox"
        aria-activedescendant={
          hasResults ? `smart-search-row-${highlightIdx}` : undefined
        }
      />

      {showDropdown && (
        <div
          id="smart-search-listbox"
          role="listbox"
          data-testid="smart-search-dropdown"
          className="absolute z-[1000] mt-2 w-full bg-white border border-border rounded-[12px] shadow-xl max-h-[70vh] overflow-auto text-right"
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
            <Section title="בתי עסק">
              {results.producers.map((p) => {
                const i = cursor++;
                return (
                  <Row
                    key={`prod-${p.id}`}
                    id={`smart-search-row-${i}`}
                    active={i === highlightIdx}
                    onSelect={() => navigate({ kind: "producer", data: p })}
                    onHover={() => setHighlightIdx(i)}
                  >
                    <div className="font-medium">
                      <Highlighted text={p.name} query={trimmed} />
                    </div>
                    {p.city && (
                      <div className="text-xs text-site-muted mt-0.5">
                        {p.city}
                      </div>
                    )}
                  </Row>
                );
              })}
            </Section>
          )}

          {results.products.length > 0 && (
            <Section title="מוצרים">
              {results.products.map((p) => {
                const i = cursor++;
                return (
                  <Row
                    key={`prd-${p.id}`}
                    id={`smart-search-row-${i}`}
                    active={i === highlightIdx}
                    onSelect={() => navigate({ kind: "product", data: p })}
                    onHover={() => setHighlightIdx(i)}
                  >
                    <div className="font-medium">
                      <Highlighted text={p.name} query={trimmed} />
                    </div>
                    <div className="text-xs text-site-muted mt-0.5">
                      אצל {p.producer_name}
                    </div>
                  </Row>
                );
              })}
            </Section>
          )}

          {results.cities.length > 0 && (
            <Section title="ערים">
              {results.cities.map((c) => {
                const i = cursor++;
                return (
                  <Row
                    key={`city-${c}`}
                    id={`smart-search-row-${i}`}
                    active={i === highlightIdx}
                    onSelect={() => navigate({ kind: "city", data: c })}
                    onHover={() => setHighlightIdx(i)}
                  >
                    <Highlighted text={c} query={trimmed} />
                  </Row>
                );
              })}
            </Section>
          )}

          {results.categories.length > 0 && (
            <Section title="קטגוריות">
              {results.categories.map((c) => {
                const i = cursor++;
                return (
                  <Row
                    key={`cat-${c.id}`}
                    id={`smart-search-row-${i}`}
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
      className={`px-3 py-2 cursor-pointer text-sm ${
        active ? "bg-light text-primary" : "text-site-text hover:bg-light/50"
      }`}
    >
      {children}
    </li>
  );
}
