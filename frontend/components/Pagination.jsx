"use client";

import { useTranslations } from "next-intl";
import { buildPageRange, clampPage } from "@/lib/pagination";

/**
 * Pagination — numbered page buttons with prev/next arrows + a
 * per-page selector (MEH-23).
 *
 * Props:
 *   - page            (number)   current 1-indexed page
 *   - totalPages      (number)   total page count (>= 1)
 *   - onChange(page)             called with the new 1-indexed page
 *   - perPage         (number)   optional — omit to hide the selector
 *   - onPerPageChange (number)   called with the new per-page value
 *   - perPageOptions             default [10, 25, 50]
 *
 * Accessibility:
 *   role="navigation", aria-label="Pagination" (translated)
 *   aria-current="page" on the active button
 *   Disabled prev/next when at boundaries.
 */
export default function Pagination({
  page,
  totalPages,
  onChange,
  perPage,
  onPerPageChange,
  perPageOptions = [10, 25, 50],
}) {
  const t = useTranslations("common.pagination");
  const safePage = clampPage(page, totalPages);
  const range = buildPageRange(safePage, totalPages);
  const showPerPage = typeof perPage === "number" && typeof onPerPageChange === "function";

  const go = (n) => {
    const next = clampPage(n, totalPages);
    if (next !== safePage) onChange?.(next);
  };

  return (
    <nav
      role="navigation"
      aria-label={t("aria_label")}
      className="flex flex-wrap items-center justify-between gap-3 mt-6"
      data-testid="pagination"
    >
      {showPerPage ? (
        <label className="inline-flex items-center gap-2 text-sm text-fg-muted">
          {t("per_page_label")}
          <select
            value={perPage}
            onChange={(e) => onPerPageChange(Number(e.target.value))}
            className="border border-border rounded-[8px] px-2 py-1 bg-white text-site-text"
            aria-label={t("per_page_aria")}
          >
            {perPageOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <span />
      )}

      <div className="flex items-center gap-1" role="group">
        <button
          type="button"
          onClick={() => go(safePage - 1)}
          disabled={safePage <= 1}
          aria-label={t("prev_aria")}
          className="px-3 py-1.5 rounded-[8px] text-sm border border-border bg-white hover:bg-green-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t("prev")}
        </button>

        {range.map((entry, i) => {
          if (entry === "…") {
            return (
              <span
                key={`ellipsis-${i}`}
                aria-hidden="true"
                className="px-2 text-fg-muted text-sm"
              >
                …
              </span>
            );
          }
          const active = entry === safePage;
          return (
            <button
              key={entry}
              type="button"
              onClick={() => go(entry)}
              aria-current={active ? "page" : undefined}
              aria-label={t("page_aria", { page: entry })}
              className={`min-w-[36px] px-2 py-1.5 rounded-[8px] text-sm border transition ${
                active
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-site-text border-border hover:bg-green-50"
              }`}
            >
              {entry}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => go(safePage + 1)}
          disabled={safePage >= totalPages}
          aria-label={t("next_aria")}
          className="px-3 py-1.5 rounded-[8px] text-sm border border-border bg-white hover:bg-green-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t("next")}
        </button>
      </div>
    </nav>
  );
}
