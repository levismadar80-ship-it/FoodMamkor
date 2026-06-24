"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Leaf, MagnifyingGlass } from "@phosphor-icons/react";
import { CATEGORY_ICONS } from "@/components/CategoryIcons";

/**
 * CategorySelector — register step-02 producer category picker (S7 card aesthetic).
 *
 * Re-skin of the prior emoji-pill control to the S7 "card" design (MEH-203):
 * a 2-col card grid, bespoke hand-drawn glyphs (CategoryIcons.jsx) for the 6
 * popular categories + a Phosphor Leaf fallback for the other 12, and a live
 * name+desc filter that DIMS (not hides) non-matching cards. The data contract
 * is unchanged — props categories / selectedIds / onChange(id) / onRequestCategory
 * still feed form.category_ids — so the mount (RegisterProducerClient.jsx:546)
 * and the MEH-530 license logic that reads form.category_ids need zero changes.
 *
 * Does NOT: own the license field (RegisterProducerClient.jsx — MEH-530), the
 * taxonomy (backend/seed_data.py — 18 DB categories), or routing.
 * Related: components/CategoryIcons.jsx (glyph paths); lib/home-categories.js
 * (the homepage marketing-group variant — intentionally a separate concept).
 * History: MEH-203 (S7 card re-skin; emoji-pill grid → card grid + dim-filter).
 */

// Popular-6 rest-state config. `name` matches the real DB category name
// (backend/seed_data.py) so the glyph attaches to the right row; `desc` comes
// from forms.category_selector.popular_descs keyed by glyph slug (i18n, Hebrew
// in both locales for now — DB category names are Hebrew-only). The other 12
// categories surface via search with a Leaf fallback, name-only.
// MEH-927: "בשר ודגים" split into "בשר" (kept here on the meat glyph) + "דגים".
// "דגים" is intentionally NOT in POPULAR — it uses the Leaf fallback like the
// other rest-categories until MEH-683 gives it a dedicated fish glyph.
const POPULAR = [
  { name: "חלב וגבינות", glyph: "dairy" },
  { name: "לחמים ואפייה", glyph: "bread" },
  { name: "בשר", glyph: "meat" },
  { name: "שמנים", glyph: "oil" },
  { name: "ירקות", glyph: "veg" },
  { name: "סבונים טבעיים", glyph: "care" },
];
const POPULAR_BY_NAME = Object.fromEntries(POPULAR.map((p) => [p.name, p]));
const POPULAR_NAMES = POPULAR.map((p) => p.name);

export default function CategorySelector({ categories, selectedIds, onChange, onRequestCategory }) {
  const t = useTranslations("forms.category_selector");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

  const q = query.trim().toLowerCase();

  // Ordered universe: popular-6 first (in POPULAR order), then the rest in DB
  // order. A popular row missing from the API (seed drift) is simply skipped.
  const popularCats = POPULAR.map((p) => categories.find((c) => c.name === p.name)).filter(Boolean);
  const restCats = categories.filter((c) => !POPULAR_NAMES.includes(c.name));
  const ordered = [...popularCats, ...restCats];

  const descFor = (c) => {
    const p = POPULAR_BY_NAME[c.name];
    return p ? t(`popular_descs.${p.glyph}`) : "";
  };
  const isMatch = (c) => `${c.name} ${descFor(c)}`.toLowerCase().includes(q);

  const matched = q ? ordered.filter(isMatch) : [];
  const noResults = q.length > 0 && matched.length === 0;

  // EMPTY → popular-6 (expandable to all 18). QUERY → all 18 with matches
  // first; non-matches stay rendered but dimmed (never removed).
  const shown = q
    ? [...matched, ...ordered.filter((c) => !isMatch(c))]
    : expanded
      ? ordered
      : popularCats;

  const sectionLabel = q ? t("section_results") : t("section_popular");

  return (
    <div role="group" aria-label={t("label")}>
      <p className="font-medium mb-2 text-sm">
        {t("label")} <span className="text-red-700">*</span>
      </p>

      {/* Search — magnifier on the start side, 16px font to avoid iOS zoom. */}
      <label htmlFor="category-search" className="block text-sm font-medium text-text mb-1">
        {t("search_label")}
      </label>
      <div className="relative mb-3">
        <MagnifyingGlass
          size={18}
          className="absolute start-3.5 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none"
          aria-hidden="true"
        />
        <input
          id="category-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search_placeholder")}
          className="w-full border border-border rounded-[10px] ps-[46px] pe-3 py-2 text-base bg-surface-card text-text focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 transition"
          dir="rtl"
        />
      </div>

      {noResults ? (
        <p className="text-xs text-fg-muted mt-1">
          {t("no_results_prefix")}{" "}
          <button type="button" onClick={onRequestCategory} className="text-primary underline">
            {t("no_results_cta")}
          </button>
        </p>
      ) : (
        <>
          <p className="text-xs text-fg-muted mb-2">{sectionLabel}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {shown.map((cat) => {
              const selected = selectedIds.includes(cat.id);
              const dimmed = q.length > 0 && !isMatch(cat);
              const desc = descFor(cat);
              const popular = POPULAR_BY_NAME[cat.name];
              const Glyph = popular ? CATEGORY_ICONS[popular.glyph] : null;
              return (
                <button
                  key={cat.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onChange(cat.id)}
                  className={[
                    "relative grid grid-cols-[46px_1fr] items-center gap-[14px] text-start",
                    "rounded-[14px] border p-4 md:p-[18px] min-h-[78px] transition",
                    selected
                      ? "border-primary bg-green-50"
                      : "border-border bg-surface-card hover:border-primary",
                    dimmed ? "opacity-[.32]" : "",
                  ].join(" ")}
                >
                  <span
                    className={`flex items-center justify-center ${selected ? "text-primary" : "text-primary-dark"}`}
                    aria-hidden="true"
                  >
                    {Glyph ? <Glyph size={46} strokeWidth={5.5} /> : <Leaf size={46} weight="light" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-headline-display font-bold text-[19px] leading-tight text-text">
                      {cat.name}
                    </span>
                    {desc && (
                      <span className="block text-[12.5px] text-fg-muted mt-0.5 leading-snug">{desc}</span>
                    )}
                  </span>
                  <span
                    className={`absolute top-3.5 end-3.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white transition-opacity ${
                      selected ? "opacity-100" : "opacity-0"
                    }`}
                    aria-hidden="true"
                  >
                    <Check size={14} weight="bold" />
                  </span>
                </button>
              );
            })}
          </div>

          {!q && restCats.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              // F7 (register polish): py-3 lifts the tap target to ≥44px (text-sm 20px + 2×12px) without changing the visible text size.
              className="mt-2 py-3 text-sm text-primary hover:underline block"
            >
              {expanded ? t("show_less") : t("show_more", { count: restCats.length })}
            </button>
          )}
        </>
      )}
    </div>
  );
}
