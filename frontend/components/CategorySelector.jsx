"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, MagnifyingGlass } from "@phosphor-icons/react";
// MEH-2163: the glyph (and its fallback) come from the registry's total
// lookup — the local `Leaf` import that used to supply the fallback here is
// gone, so there is one owner of that decision instead of three.
import { resolveCategoryGlyph } from "@/lib/category-registry";

/**
 * CategorySelector — register step-02 producer category picker (S7 card aesthetic).
 *
 * Re-skin of the prior emoji-pill control to the S7 "card" design (MEH-203):
 * a 2-col card grid, unified geometric glyphs (CategoryIcons.jsx, MEH-683) for
 * every one of the 18 cards (Leaf fallback only for an unknown admin-created
 * category with no CATEGORY_ICONS row), and a live
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
// "דגים" is intentionally NOT in POPULAR — it resolves its own FishSimple glyph
// via CATEGORY_ICONS like every other non-popular card (MEH-683; see :203-206).
// MEH-2139: keyed by `categories.slug`, not by the Hebrew display name. A
// rename in the DB used to make the matching row vanish from this grid in
// silence — the comment two paragraphs down still calls that "seed drift is
// simply skipped", and it burned once already when «קוסמטיקה טבעית» needed a
// temporary alias to survive its own rename (MEH-1104).
//
// The slug and the I18N KEY are the same token by construction: chunk 1
// backfilled the slugs from these very constants, which are also the copy keys.
// That is why the old `glyph` field disappears here rather than sitting beside
// `slug` repeating it.
//
// It is NOT the same token as the GLYPH, and an earlier version of this comment
// said it was. The glyph map is still keyed by the Hebrew display name (the
// `resolveCategoryGlyph(cat)` call in the card loop below), so the glyph is the
// one thing on this card that a rename still drops. Left that way on purpose:
// that map is shared with three other surfaces (ProducersClient,
// HomeCategoryGrid, FilterChipsBar) whose data carries no slug, and the
// frontend has no name-to-slug table to derive a slug-keyed view from. Writing
// one would be a THIRD copy of backend/app/services/category_slug.NAME_TO_SLUG
// — in a language the test that pins the existing two cannot reach. The cost of
// the gap is a generic 46px glyph; the cost of the third copy is a table that
// can drift unpinned.
// MEH-2163 amended one word of that: a rename no longer drops to NO glyph, it
// drops to the registry fallback. The key choice is unchanged, and MEH-1456 is
// where it moves — one line, in lib/category-registry.js `categoryGlyphKey`.
const POPULAR = [
  { slug: "dairy" },
  { slug: "bread" },
  { slug: "meat" },
  { slug: "oil" },
  { slug: "veg" },
  { slug: "care" },
];
const POPULAR_SLUGS = POPULAR.map((p) => p.slug);

// MEH-1354: desc slugs for the 12 non-popular categories, so every card in
// the expanded grid carries a short example line (and the search filter can
// match synonyms — e.g. "גרנולה" → מוצרים מוכנים). Keys track the DB names
// in backend/seed_data.py CATEGORIES verbatim; copy lives in
// forms.category_selector.rest_descs (i18n). A future rename in the seed
// must update this map in the same PR (same contract as POPULAR above).
// MEH-2139: this used to be a Hebrew-name → slug map, which is now identity —
// the slug IS the i18n key, because chunk 1 deliberately backfilled these exact
// tokens. What remains is the SET of non-popular categories that have desc copy.
// A category outside it (admin-created, or a future seed addition before its
// copy lands) renders with no desc line, exactly as before.
const REST_DESC_SLUGS = new Set([
  "eggs",
  "fruit",
  "ferments",
  "prepared",
  "herbs",
  "cosmetics",
  "candles",
  "drinks",
  "spices",
  "chocolate",
  "honey",
  "fish",
]);

// MEH-1098 (B1): the non-food (home & personal-care) categories. Names track the
// DB values verbatim. They surface under a "בית וטיפוח" subheader in the expanded
// grid; everything else falls under "מזון". Presentational grouping only — the
// selection contract (category_ids) is unchanged. MEH-1104 (contract phase,
// ADR-007): the transitional pre-rename alias was removed after the production
// rename to "קוסמטיקה טבעית" was confirmed.
// MEH-2139: by slug, same reason as POPULAR — renaming any of these three used
// to silently drop it out of the «בית וטיפוח» group and back into «מזון».
const HOME_CARE_SLUGS = ["care", "cosmetics", "candles"];

// MEH-1297: a producer may pick at most 3 categories (Yelp model). The first
// selected is the primary — it drives categories[0] on the card/map pin. The
// selection ORDER is owned by the parent (form.category_ids append-on-select),
// so selectedIds[0] is the primary here; this component only reflects it.
const MAX_CATEGORIES = 3;

export default function CategorySelector({ categories, selectedIds, onChange, onRequestCategory }) {
  const t = useTranslations("forms.category_selector");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

  const q = query.trim().toLowerCase();

  // Ordered universe: popular-6 first (in POPULAR order), then the rest in DB
  // order. A popular row missing from the API (seed drift) is simply skipped.
  const popularCats = POPULAR.map((p) => categories.find((c) => c.slug === p.slug)).filter(Boolean);
  const restCats = categories.filter((c) => !POPULAR_SLUGS.includes(c.slug));
  const ordered = [...popularCats, ...restCats];

  const descFor = (c) => {
    if (POPULAR_SLUGS.includes(c.slug)) return t(`popular_descs.${c.slug}`);
    // MEH-1354: non-popular rows get their own desc line (uniform expanded
    // grid + synonym search). MEH-2139: keyed on the slug, so an admin-created
    // category — whose slug is a transliteration with no copy behind it —
    // renders no desc rather than a raw key path.
    return REST_DESC_SLUGS.has(c.slug) ? t(`rest_descs.${c.slug}`) : "";
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

  // B1: in the expanded (non-search) state, split the full grid into
  // food / home-and-care groups with presentational subheaders. Every other
  // state (popular-6, active search) stays a flat grid with no headers.
  const grouped = !q && expanded;
  const gridItems = grouped
    ? [
        { header: t("group_food"), key: "grp-food" },
        ...ordered
          .filter((c) => !HOME_CARE_SLUGS.includes(c.slug))
          .map((c) => ({ cat: c })),
        { header: t("group_home"), key: "grp-home" },
        ...ordered
          .filter((c) => HOME_CARE_SLUGS.includes(c.slug))
          .map((c) => ({ cat: c })),
      ]
    : shown.map((c) => ({ cat: c }));

  return (
    <div role="group" aria-label={`${t("label")} ${t("required_sr")}`}>
      <div className="flex items-center justify-between mb-1">
        <p className="font-medium text-sm">
          {t("label")}{" "}
          <span className="text-error" aria-hidden="true">
            *
          </span>
          {/* MEH-2015 chunk B: screen readers never heard "required" — the
              asterisk above is aria-hidden and a button-group has no native
              `required` attribute to announce. sr-only text carries it instead
              of `aria-required` on role="group" (invalid target per axe-core's
              aria-allowed-attr — that attribute is radiogroup-only). Mirrored
              onto the group's aria-label above so it survives regardless of
              which the screen reader announces on entry. */}
          <span className="sr-only">{t("required_sr")}</span>
        </p>
        {/* MEH-1297: live N/3 counter */}
        <span className="text-xs text-fg-muted tabular-nums" data-testid="category-counter">
          {t("counter", { count: selectedIds.length, max: MAX_CATEGORIES })}
        </span>
      </div>
      {/* MEH-1297: primary-first + cap hint */}
      <p className="text-[11px] text-fg-muted mb-2">{t("cap_hint")}</p>

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
          data-testid="category-search"
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
            {gridItems.map((item) => {
              if (item.header) {
                return (
                  <p
                    key={item.key}
                    role="presentation"
                    className="col-span-1 md:col-span-2 text-xs font-semibold text-fg-muted mt-3 first:mt-0 mb-1"
                  >
                    {item.header}
                  </p>
                );
              }
              const cat = item.cat;
              const selected = selectedIds.includes(cat.id);
              // MEH-1297: first-selected = primary; cap blocks new picks at 3.
              const isPrimary = selectedIds[0] === cat.id;
              const capDisabled = !selected && selectedIds.length >= MAX_CATEGORIES;
              const dimmed = q.length > 0 && !isMatch(cat);
              const desc = descFor(cat);
              // MEH-683 #4: the glyph map is keyed by canonical DB name (was
              // slug). MEH-2139: every OTHER lookup in this file moved to
              // `cat.slug`; this one did not, and that is the whole exception —
              // see the note above POPULAR for why. So "every card resolves its
              // own glyph" holds only while the DB name still matches the seed:
              // a renamed category, and an admin-created one, both fall back.
              // MEH-2163: that fallback is the registry's, not a local `Leaf`.
              const { glyph: Glyph, isFallback } = resolveCategoryGlyph(cat);
              return (
                <button
                  key={cat.id}
                  type="button"
                  data-testid={`category-chip-${cat.id}`}
                  aria-pressed={selected}
                  disabled={capDisabled}
                  onClick={() => onChange(cat.id)}
                  className={[
                    "relative grid grid-cols-[46px_1fr] items-center gap-[14px] text-start",
                    "rounded-[14px] border p-4 md:p-[18px] min-h-[78px] transition",
                    selected
                      ? "border-primary bg-green-50"
                      : capDisabled
                        ? "border-border bg-surface-card"
                        : "border-border bg-surface-card hover:border-primary",
                    // MEH-1297: cap-disabled cards read as unavailable, not dimmed-by-search.
                    capDisabled ? "opacity-50 cursor-not-allowed" : "",
                    dimmed ? "opacity-[.32]" : "",
                  ].join(" ")}
                >
                  <span
                    className={`flex items-center justify-center ${selected ? "text-primary" : "text-primary-dark"}`}
                    aria-hidden="true"
                  >
                    {/* MEH-2163: same two renderings as before — the mapped
                        glyph at 46px, the fallback at 46px `weight="light"`.
                        Only the identity of the fallback moved (registry). */}
                    {isFallback ? <Glyph size={46} weight="light" /> : <Glyph size={46} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-headline-display font-bold text-[19px] leading-tight text-text">
                      {cat.name}
                      {/* MEH-1297: "ראשית" pill on the first-selected category */}
                      {isPrimary && (
                        <span
                          data-testid="primary-badge"
                          className="ms-2 align-middle inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                        >
                          {t("primary_badge")}
                        </span>
                      )}
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
