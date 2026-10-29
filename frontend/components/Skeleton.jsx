"use client";

import { useTranslations } from "next-intl";

/**
 * Skeleton placeholder. Use in place of a spinner while fetching lists of
 * cards. MEH-991 (CARD-26): 1.8s opacity pulse on fg-muted@0.15 bars per the
 * ProducerCard v4 skeleton spec (was a gradient shimmer). Keyframed inline so
 * we don't depend on tailwind config edits.
 */

/**
 * MEH-1054: the `.skeleton-box` pulse rules, extracted from
 * SkeletonProducerGrid so other skeleton consumers (MapBottomSheet's MAP-16
 * list skeleton) can mount them without duplicating the keyframes (single
 * owner, MEH-271). styled-jsx dedupes identical global blocks, so rendering
 * this in several mounted components is safe. NOTE: SkeletonCard/SkeletonLine
 * alone do NOT inject styles — a page using them must render <SkeletonStyles/>
 * (or SkeletonProducerGrid) once.
 */
export function SkeletonStyles() {
  return (
    <style jsx global>{`
      .skeleton-box {
        /* fg-muted (#5c584f) @ 0.15 — ProducerCard v4 skeleton spec */
        background: rgba(92, 88, 79, 0.15);
        animation: skeleton-pulse 1.8s infinite ease-in-out;
      }
      @keyframes skeleton-pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.5;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .skeleton-box {
          animation: none;
        }
      }
    `}</style>
  );
}

export function SkeletonCard({ className = "" }) {
  return (
    <div
      className={`skeleton-box rounded-[16px] ${className}`}
      style={{ height: "320px" }}
      aria-hidden="true"
    />
  );
}

export function SkeletonLine({ width = "100%", height = "14px", className = "" }) {
  return (
    <div
      className={`skeleton-box rounded-lg ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

/**
 * ProducerCard-shaped skeleton. Matches the Phase B anatomy so we don't
 * regress CLS: square image on mobile → 4:3 on desktop, body of name +
 * location + description + pills + footer rows, no icon grid.
 */
function SkeletonProducerCard() {
  return (
    <div
      className="bg-surface-card border border-border rounded-none overflow-hidden flex flex-col"
      aria-hidden="true"
    >
      <div className="bg-background w-full aspect-square lg:aspect-[4/3]" />
      <div className="p-4 flex-1 flex flex-col gap-2">
        <div className="skeleton-box rounded-lg h-[20px] w-[80%]" />
        <div className="skeleton-box rounded-lg h-[13px] w-[55%]" />
        <div className="skeleton-box rounded-lg h-[14px] w-[90%]" />
        <div className="flex gap-1.5 mt-1">
          <div className="skeleton-box rounded-full h-[20px] w-[54px]" />
          <div className="skeleton-box rounded-full h-[20px] w-[48px]" />
        </div>
        <div className="mt-auto pt-3 flex items-center justify-between">
          <div className="skeleton-box rounded-lg h-[16px] w-[60px]" />
          <div className="skeleton-box rounded-full h-[18px] w-[18px]" />
        </div>
      </div>
    </div>
  );
}

/**
 * Grid of skeleton cards — matches the producer grid layout.
 */
export function SkeletonProducerGrid({ count = 8 }) {
  const t = useTranslations("common.skeleton");
  return (
    <div
      className="grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-4"
      role="status"
      aria-label={t("loading_businesses")}
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonProducerCard key={i} />
      ))}
      {/* MEH-1054: rules extracted to SkeletonStyles (shared with MapBottomSheet) */}
      <SkeletonStyles />
    </div>
  );
}

/* ── MEH-2601 — shape skeletons for dashboard + admin wait states ──────────
   Where the coming content's SHAPE is known (a list, a table, a form, stat
   tiles) draw it, instead of the bare «בטעינה...» line those screens showed.
   Unknown shape → components/BrandLoader.jsx (MEH-2599), never these.
   Each one mounts <SkeletonStyles/> itself, carries role="status" and keeps
   the screen's existing loading copy sr-only, so specs that wait for that
   copy to leave the DOM keep working and no new copy enters the UI. */

function SkeletonStatus({ label, className, testId, children }) {
  return (
    <div className={className} role="status" aria-busy="true" data-testid={testId}>
      {label ? <span className="sr-only">{label}</span> : null}
      {children}
      <SkeletonStyles />
    </div>
  );
}

/** Rows of thumbnail + title + meta line — recipe / event / follower lists. */
export function SkeletonList({ count = 4, label, className = "", testId }) {
  return (
    <SkeletonStatus label={label} className={`space-y-3 ${className}`} testId={testId}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 bg-surface-card border border-border rounded-[12px] p-3"
          aria-hidden="true"
        >
          <div className="skeleton-box rounded-[9px] w-11 h-11 shrink-0" />
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div className="skeleton-box rounded-lg h-[14px] w-[62%]" />
            <div className="skeleton-box rounded-lg h-[10px] w-[38%]" />
          </div>
        </div>
      ))}
    </SkeletonStatus>
  );
}

/**
 * Admin data table. md and up: a header line + `rows` lines of `cols` cells.
 * Below md: one card per row, three label/value lines — the same shape the
 * `.table-stack` tables (MEH-2426) collapse to, so nothing scrolls sideways.
 */
export function SkeletonTable({ rows = 5, cols = 4, label, className = "", testId }) {
  const widths = ["70%", "45%", "55%", "35%", "60%", "40%", "50%"];
  return (
    <SkeletonStatus label={label} className={className} testId={testId}>
      <div
        className="hidden md:block rounded-[12px] border border-border overflow-hidden bg-surface-card"
        aria-hidden="true"
      >
        <div
          className="grid gap-4 px-4 py-3 bg-background-alt/60"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="skeleton-box rounded-lg h-[10px] w-[50%]" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="grid gap-4 px-4 py-4 border-t border-border"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: cols }).map((_, c) => (
              <div
                key={c}
                className="skeleton-box rounded-lg h-[14px]"
                style={{ width: widths[(r + c) % widths.length] }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="md:hidden space-y-3" aria-hidden="true">
        {Array.from({ length: Math.min(rows, 4) }).map((_, r) => (
          <div key={r} className="bg-surface-card border border-border rounded-[12px] px-4 py-3 space-y-2">
            {[0, 1, 2].map((l) => (
              <div key={l} className="flex items-center gap-3">
                <div className="skeleton-box rounded-lg h-[10px] w-16 shrink-0" />
                <div className="skeleton-box rounded-lg h-[12px]" style={{ width: widths[(r + l) % widths.length] }} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </SkeletonStatus>
  );
}

/** Label + field pairs — the edit pages, settings, the dashboard edit cards. */
export function SkeletonForm({ fields = 5, label, className = "", testId }) {
  return (
    <SkeletonStatus label={label} className={`space-y-5 ${className}`} testId={testId}>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2" aria-hidden="true">
          <div className="skeleton-box rounded-lg h-[12px] w-28" />
          <div className={`skeleton-box rounded-[12px] w-full ${i === fields - 1 ? "h-24" : "h-11"}`} />
        </div>
      ))}
    </SkeletonStatus>
  );
}

/** A row of stat tiles — the admin home and analytics. */
export function SkeletonTiles({ count = 4, label, className = "", testId }) {
  return (
    <SkeletonStatus
      label={label}
      className={`grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 ${className}`}
      testId={testId}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-surface-card border border-border rounded-[16px] p-4 space-y-3" aria-hidden="true">
          <div className="skeleton-box rounded-lg h-[10px] w-[55%]" />
          <div className="skeleton-box rounded-lg h-[28px] w-[40%]" />
        </div>
      ))}
    </SkeletonStatus>
  );
}
