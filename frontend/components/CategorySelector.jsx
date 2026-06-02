"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

const POPULAR_COUNT = 6;

export default function CategorySelector({ categories, selectedIds, onChange, onRequestCategory }) {
  const t = useTranslations("forms.category_selector");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

  const q = query.trim().toLowerCase();
  const filtered = q ? categories.filter((c) => c.name.includes(q)) : null;
  const noResults = q.length > 0 && filtered.length === 0;

  const more = categories.slice(POPULAR_COUNT);
  const shown = q ? filtered : expanded ? categories : categories.slice(0, POPULAR_COUNT);
  const sectionLabel = q ? t("section_results") : t("section_popular");

  return (
    <div>
      <p className="font-medium mb-2 text-sm">
        {t("label")} <span className="text-red-700">*</span>
      </p>

      <div className="relative mb-3">
        <span className="absolute top-1/2 right-3 -translate-y-1/2 text-fg-muted text-sm pointer-events-none select-none">
          🔍
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search_placeholder")}
          className="w-full border border-[#e5e0d8] rounded-[10px] py-2 pr-9 pl-3 text-sm bg-[#faf8f4] focus:outline-none focus:border-primary transition"
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
          <div className="flex flex-wrap gap-2">
            {shown.map((cat) => {
              const selected = selectedIds.includes(cat.id);
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => onChange(cat.id)}
                  className={`inline-flex items-center gap-1 px-3 py-2 rounded-full text-sm border transition min-h-[40px] ${
                    selected
                      ? "bg-primary text-white border-primary"
                      : "bg-[#F5F0E8] text-text border-[#e5e0d8] hover:border-primary hover:bg-primary/5"
                  }`}
                >
                  {cat.emoji} {cat.name}
                  {selected && <span className="ms-0.5 text-[11px]">✓</span>}
                </button>
              );
            })}
          </div>

          {!q && more.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 text-sm text-primary hover:underline block"
            >
              {expanded ? t("show_less") : t("show_more", { count: more.length })}
            </button>
          )}
        </>
      )}
    </div>
  );
}
