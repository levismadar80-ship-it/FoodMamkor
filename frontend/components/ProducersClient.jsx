"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import ProducerCard from "@/components/ProducerCard";
import { SkeletonProducerGrid } from "@/components/Skeleton";
import { buildChipParams, CHIPS_CONFIG, CHIPS_DEFAULT } from "@/lib/producer-filters";
import api from "@/lib/api";

const FILTER_LIMIT = 100;

export default function ProducersClient({
  initialItems,
  initialTotal,
  initialPage,
  totalPages,
  perPage,
}) {
  const [chips, setChips] = useState(CHIPS_DEFAULT);
  const [filteredItems, setFilteredItems] = useState(null);
  const [loading, setLoading] = useState(false);

  const hasActiveChips = Object.values(chips).some(Boolean);
  const displayItems = hasActiveChips ? (filteredItems ?? []) : initialItems;
  const activeChips = CHIPS_CONFIG.filter((c) => chips[c.key]);

  const fetchFiltered = useCallback((chipState) => {
    const params = buildChipParams(chipState);
    if (Object.keys(params).length === 0) {
      setFilteredItems(null);
      return;
    }
    setLoading(true);
    api
      .get("/producers", { params: { ...params, limit: FILTER_LIMIT, offset: 0 } })
      .then((r) => setFilteredItems(Array.isArray(r.data) ? r.data : []))
      .catch(() => setFilteredItems([]))
      .finally(() => setLoading(false));
  }, []);

  const toggleChip = (key) => {
    const next = { ...chips, [key]: !chips[key] };
    setChips(next);
    fetchFiltered(next);
  };

  const clearAll = () => {
    setChips(CHIPS_DEFAULT);
    setFilteredItems(null);
  };

  const showFilterEmpty =
    hasActiveChips && !loading && filteredItems !== null && filteredItems.length === 0;
  const showPageOverflow =
    !hasActiveChips && initialItems.length === 0 && initialTotal > 0;
  const showCatalogEmpty = !hasActiveChips && initialTotal === 0;
  const showGrid = !loading && !showFilterEmpty && !showPageOverflow && !showCatalogEmpty;

  const counterText = (() => {
    if (!showGrid) return null;
    if (hasActiveChips) return `נמצאו ${filteredItems?.length ?? 0} בתי עסק`;
    const start = (initialPage - 1) * perPage + 1;
    const end = Math.min(initialPage * perPage, initialTotal);
    return `מציגים ${start}–${end} מתוך ${initialTotal}`;
  })();

  return (
    <>
      <Breadcrumb
        items={[{ href: "/", label: "בית" }, { label: "כל בתי העסק" }]}
        className="mb-4"
      />
      <h1 className="font-headline text-3xl font-bold text-site-text mb-6">
        כל בתי העסק
      </h1>

      {/* Chip row */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {CHIPS_CONFIG.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => toggleChip(chip.key)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium border transition shrink-0 ${
              chips[chip.key]
                ? "bg-primary text-white border-primary"
                : "bg-white text-site-text border-border hover:border-primary hover:text-primary"
            }`}
          >
            <span aria-hidden="true">{chip.icon}</span>
            {chip.label}
          </button>
        ))}
      </div>

      {/* Active filter strip */}
      {hasActiveChips && (
        <div className="flex items-center gap-2 mb-4 overflow-x-auto scrollbar-hide -mx-1 px-1 py-2 bg-light border-y border-border">
          <span className="text-xs text-primary font-semibold whitespace-nowrap shrink-0">
            מסנן לפי:
          </span>
          {activeChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => toggleChip(chip.key)}
              className="inline-flex items-center gap-1 bg-white text-primary border border-primary rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap shrink-0"
            >
              <span aria-hidden="true" className="text-[10px] font-bold">×</span>
              {chip.icon} {chip.label}
            </button>
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-primary underline whitespace-nowrap shrink-0 ms-1"
          >
            נקי הכל
          </button>
        </div>
      )}

      {/* Counter */}
      {counterText && (
        <p className="text-sm text-site-muted mb-4" aria-live="polite">
          {counterText}
        </p>
      )}

      {/* Content area */}
      {loading ? (
        <SkeletonProducerGrid count={8} />
      ) : showFilterEmpty ? (
        <FilterEmptyState onClear={clearAll} />
      ) : showPageOverflow ? (
        <PageOverflowState />
      ) : showCatalogEmpty ? (
        <CatalogEmptyState />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-3 xl:grid-cols-4">
            {displayItems.map((p) => (
              <ProducerCard key={p.id} producer={p} referrer="producers-index" />
            ))}
          </div>
          {!hasActiveChips && totalPages > 1 && (
            <ServerPageLinks page={initialPage} totalPages={totalPages} />
          )}
        </>
      )}
    </>
  );
}

function FilterEmptyState({ onClear }) {
  return (
    <div className="text-center py-16">
      <div
        className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-light mb-4"
        aria-hidden="true"
      >
        <span className="text-2xl">🌱</span>
      </div>
      <h2 className="font-headline text-xl font-bold text-site-text mb-2">
        לא מצאנו בתי עסק שמתאימים לסינון הזה
      </h2>
      <p className="text-site-muted text-sm mb-6">נסי להסיר אחד מהסינונים</p>
      <button
        type="button"
        onClick={onClear}
        className="bg-primary text-white px-6 py-3 rounded-[12px] font-medium hover:bg-primary-light transition"
      >
        נקי הכל והצגי הכל
      </button>
    </div>
  );
}

function CatalogEmptyState() {
  return (
    <div className="text-center py-16">
      <div
        className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-light mb-4"
        aria-hidden="true"
      >
        <span className="text-2xl">🌿</span>
      </div>
      <h2 className="font-headline text-xl font-bold text-site-text mb-2">
        הרשימה בדרך
      </h2>
      <p className="text-site-muted text-sm mb-6 max-w-sm mx-auto">
        הציעי עסק שאת אוהבת, או הירשמי לעדכונים כשמצטרפות חדשות
      </p>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link
          href="/register/producer"
          className="bg-primary text-white px-6 py-3 rounded-[12px] font-medium hover:bg-primary-light transition"
        >
          הוסיפי את העסק שלך 🌿
        </Link>
        <Link
          href="/about#newsletter"
          className="border border-primary text-primary px-6 py-3 rounded-[12px] font-medium hover:bg-light transition"
        >
          הודיעי לי כשמצטרפות חדשות
        </Link>
      </div>
    </div>
  );
}

function PageOverflowState() {
  return (
    <div className="text-center py-16">
      <p className="text-site-muted mb-4">הגעת לסוף הרשימה</p>
      <Link
        href="/producers"
        className="inline-flex items-center bg-primary text-white px-5 py-2 rounded-[12px] hover:bg-primary-light transition"
      >
        חזרי לעמוד ראשון
      </Link>
    </div>
  );
}

function ServerPageLinks({ page, totalPages }) {
  if (totalPages <= 1) return null;
  const prev =
    page > 1 ? (page - 1 === 1 ? "/producers" : `/producers?page=${page - 1}`) : null;
  const next = page < totalPages ? `/producers?page=${page + 1}` : null;

  return (
    <nav
      aria-label="עימוד"
      className="flex items-center justify-center gap-3 mt-8 text-sm"
    >
      {prev ? (
        <Link
          href={prev}
          className="border border-border bg-white text-site-text px-4 py-2 rounded-[12px] hover:bg-light transition"
        >
          ← עמוד קודם
        </Link>
      ) : (
        <span className="border border-border text-site-muted px-4 py-2 rounded-[12px] opacity-50">
          ← עמוד קודם
        </span>
      )}
      <span className="text-site-muted">עמוד {page} מתוך {totalPages}</span>
      {next ? (
        <Link
          href={next}
          className="border border-border bg-white text-site-text px-4 py-2 rounded-[12px] hover:bg-light transition"
        >
          עמוד הבא →
        </Link>
      ) : (
        <span className="border border-border text-site-muted px-4 py-2 rounded-[12px] opacity-50">
          עמוד הבא →
        </span>
      )}
    </nav>
  );
}
