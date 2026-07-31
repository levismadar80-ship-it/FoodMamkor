"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  autocompleteAddresses,
  resolveSuggestion,
  newSessionToken,
} from "@/lib/places";

/**
 * AddressSearch — Israeli address autocomplete (MEH-1234).
 *
 * Provider-agnostic (see lib/places.js). When NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
 * is set it uses Google Places Autocomplete (New) over REST — IL-restricted,
 * Hebrew, session-token'd (Wolt pattern); otherwise it falls back to the free
 * OpenStreetMap Nominatim path with IDENTICAL behavior to before, so the app
 * (and this component's API) works with no key at all.
 *
 * The component owns:
 *   - the ≥3-char / 450 ms debounce + requestSeq stale-response guard (kept)
 *   - the Places session-token lifecycle: mint one per autocomplete session,
 *     consume it on select (a fresh one is minted for the next search)
 *   - dedupe is done in lib/places.js so no two identical rows render
 *
 * MEH-1766 — visible degradation. A completed lookup that yields nothing (empty
 * result OR provider rejection) now renders a quiet Hebrew helper line telling
 * the user she can type the address by hand, and logs the two cases distinctly.
 * It is a HINT, never validation: free text stays submittable (Baymard — 18% of
 * address validators trap users by refusing force-proceed). The line is
 * suppressed while loading, below 3 chars, and on abort, so it can never flash
 * mid-typing.
 *
 * Props (UNCHANGED — LocationCard/RegisterProducer consumers untouched):
 *   - id (required) — for <label htmlFor>
 *   - label (string, sr-only-friendly)
 *   - value (string) — current input text
 *   - onChange(text)            — fires on every keystroke (free text)
 *   - onSelect({ street, neighborhood, city, postcode, lat, lng, displayName })
 *                                — fires when user picks a result
 *   - placeholder
 *   - className (optional, applied to wrapper)
 *   - inputTestId (optional) — data-testid placed on the <input> ITSELF, not the
 *     wrapper, so an existing Playwright `.fill()` locator keeps working when a
 *     raw <Input> is swapped for this component (MEH-1766). Omit it and nothing
 *     is rendered, so every pre-existing consumer is byte-identical.
 */
export default function AddressSearch({
  id,
  label,
  value,
  onChange,
  onSelect,
  placeholder,
  className = "",
  inputTestId,
}) {
  const t = useTranslations("search.address_search");
  const inputPlaceholder = placeholder ?? t("placeholder");
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [loading, setLoading] = useState(false);
  // MEH-1766: null while the field is quiet or a lookup is in flight; set to
  // "empty" | "error" only once a query has actually COMPLETED with nothing.
  const [providerIssue, setProviderIssue] = useState(null);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  // Track the latest in-flight request so a slow earlier response can't
  // overwrite a fresher result (classic out-of-order async hazard).
  const requestSeq = useRef(0);
  // Google Places session token — minted lazily per autocomplete session,
  // consumed on select. Nominatim ignores it (harmless).
  const sessionTokenRef = useRef(null);

  // Debounced provider lookup (Google Places when keyed, else Nominatim).
  useEffect(() => {
    const q = (value || "").trim();
    if (q.length < 3) {
      setSuggestions([]);
      // MEH-1766: below the query floor nothing has been asked, so nothing has
      // failed — the hint must never show here.
      setProviderIssue(null);
      return;
    }
    const seq = ++requestSeq.current;
    const controller = new AbortController();
    // Lazily open a session for the current autocomplete run (Google cost
    // control; Nominatim ignores the token).
    if (!sessionTokenRef.current) sessionTokenRef.current = newSessionToken();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const list = await autocompleteAddresses(q, {
          signal: controller.signal,
          sessionToken: sessionTokenRef.current,
        });
        if (seq !== requestSeq.current) return; // stale
        setSuggestions(list);
        setHighlight(0);
        setIsOpen(true);
        // MEH-1766: a successful call that matched nothing. Distinct from the
        // rejection branch below both on screen (same hint) and in the log.
        setProviderIssue(list.length === 0 ? "empty" : null);
        if (list.length === 0) {
          console.info(
            `[AddressSearch] provider returned 0 results for ${JSON.stringify(q)} — this is a genuine no-match, the provider answered normally.`,
          );
        }
      } catch (err) {
        // Aborted by the cleanup below (the user kept typing) — not a failure,
        // and a newer request already owns the field. No hint, no log.
        if (err?.name === "AbortError") return;
        if (seq !== requestSeq.current) return; // stale
        // Provider rejected the request, or the network did. Degrade visibly
        // (the hint) instead of silently: the input still accepts free text.
        setSuggestions([]);
        setProviderIssue("error");
        console.warn(
          `[AddressSearch] provider REJECTED the lookup for ${JSON.stringify(q)} — this is NOT a no-match. Suggestions are unavailable until it is fixed.`,
          {
            provider: err?.provider ?? "unknown",
            status: err?.status ?? null,
            detail: err?.detail ?? err?.message ?? String(err),
          },
        );
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (!containerRef.current?.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectResult = async (s) => {
    if (!s) return;
    // Close immediately for responsiveness; the resolve (Google details call)
    // finishes in the background and then fills the fields.
    setIsOpen(false);
    setSuggestions([]);
    try {
      const picked = await resolveSuggestion(s, {
        sessionToken: sessionTokenRef.current,
      });
      if (picked) {
        // Update the visible text to the street part if we have one, otherwise
        // the full display name (so the user sees something useful).
        onChange(picked.street || picked.displayName || s.primary);
        onSelect?.(picked);
      }
    } catch {
      // Resolve failed (e.g. Google details network error) — keep the typed
      // text; the user can still submit a manual address.
    } finally {
      // End the session: a fresh token is minted for the next search.
      sessionTokenRef.current = null;
    }
  };

  const handleKeyDown = (e) => {
    if (!isOpen || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions[highlight]) selectResult(suggestions[highlight]);
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
          data-testid={inputTestId}
          type="text"
          value={value || ""}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => suggestions.length > 0 && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={inputPlaceholder}
          className="flex-1 min-w-0 bg-transparent outline-none text-text placeholder:text-fg-muted"
          autoComplete="off"
          role="combobox"
          aria-expanded={isOpen && suggestions.length > 0}
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

      {isOpen && suggestions.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 w-full bg-white border border-border rounded-[8px] shadow-lg max-h-72 overflow-auto"
        >
          {suggestions.map((s, idx) => (
            <li
              key={s.id ?? idx}
              role="option"
              aria-selected={idx === highlight}
              onMouseDown={(e) => {
                e.preventDefault();
                selectResult(s);
              }}
              onMouseEnter={() => setHighlight(idx)}
              className={`px-3 py-2 cursor-pointer text-sm border-b border-border last:border-b-0 ${
                idx === highlight ? "bg-green-50 text-primary" : "text-text"
              }`}
            >
              <div className="font-medium">{s.primary}</div>
              {s.secondary && (
                <div className="text-xs text-fg-muted mt-0.5">
                  {s.secondary}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* MEH-1766: visible degradation. Shown ONLY after a completed lookup
          returned nothing — never while loading, never below 3 chars, never on
          abort (those all reset providerIssue to null). A hint, not an error:
          no aria-invalid, no submit gating, free text still wins. */}
      {providerIssue && !loading && (
        <p
          data-testid="address-search-no-results-hint"
          className="mt-1 text-xs text-fg-muted text-start"
        >
          {t("no_results_hint")}
        </p>
      )}
    </div>
  );
}
