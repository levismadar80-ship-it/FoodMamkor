"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import api from "@/lib/api";
import ProducerCard from "@/components/ProducerCard";
import { SkeletonProducerGrid } from "@/components/Skeleton";

const CHIPS = [
  { key: "kosher",       label: "כשר",       icon: "✡️" },
  { key: "organic",      label: "אורגני",     icon: "🌿" },
  { key: "has_delivery", label: "משלוח",      icon: "🚚" },
  { key: "verified",     label: "מאומת בלבד", icon: "✅" },
];

const INIT_CHIPS = { kosher: false, organic: false, has_delivery: false, verified: false };

const SPARSE_THRESHOLD = 10;

export default function ProducersClient({ initialItems, initialTotal, initialPage, totalPages }) {
  const [chips, setChips] = useState(INIT_CHIPS);
  const [filteredItems, setFilteredItems] = useState(null);
  const [filteredTotal, setFilteredTotal] = useState(null);
  const [loading, setLoading] = useState(false);

  const anyActive = Object.values(chips).some(Boolean);
  const items = filteredItems ?? initialItems;
  const total = filteredTotal ?? initialTotal;

  const buildParams = (chipState) => {
    const p = {};
    if (chipState.kosher)       p.kosher = true;
    if (chipState.organic)      p.organic = true;
    if (chipState.has_delivery) p.has_delivery = true;
    if (chipState.verified)     p.verified = true;
    return p;
  };

  const fetchFiltered = useCallback(async (chipState) => {
    if (!Object.values(chipState).some(Boolean)) {
      setFilteredItems(null);
      setFilteredTotal(null);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get("/producers", { params: { limit: 100, ...buildParams(chipState) } });
      const data = Array.isArray(res.data) ? res.data : [];
      setFilteredItems(data);
      setFilteredTotal(Number(res.headers?.["x-total-count"] || data.length));
    } catch {
      setFilteredItems([]);
      setFilteredTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleChip = (key) => {
    setChips((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      fetchFiltered(next);
      return next;
    });
  };

  const clearAll = () => {
    setChips(INIT_CHIPS);
    setFilteredItems(null);
    setFilteredTotal(null);
  };

  const activeChips = CHIPS.filter((c) => chips[c.key]);

  return (
    <>
      {/* Filter chips */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {CHIPS.map((chip) => (
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
      {anyActive && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-sm text-site-muted shrink-0">מסנן לפי:</span>
          {activeChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => toggleChip(chip.key)}
              className="inline-flex items-center gap-1 bg-light text-primary border border-primary/30 px-3 py-1 rounded-full text-sm hover:bg-primary hover:text-white transition"
              aria-label={`הסר סינון: ${chip.label}`}
            >
              <span aria-hidden="true">{chip.icon}</span>
              {chip.label}
              <span aria-hidden="true" className="ms-1 font-bold leading-none">×</span>
            </button>
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="text-sm text-primary hover:underline"
          >
            נקי הכל
          </button>
        </div>
      )}

      {/* Result counter */}
      {!loading && total > 0 && (
        <p className="text-sm text-site-muted mb-3" aria-live="polite">
          מציגים{" "}
          <span className="font-semibold text-site-text">{items.length}</span>{" "}
          מתוך{" "}
          <span className="font-semibold text-site-text">{total}</span>
        </p>
      )}

      {/* Main content area */}
      {loading ? (
        <SkeletonProducerGrid count={8} />
      ) : items.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((p) => (
              <ProducerCard key={p.id} producer={p} referrer="producers-index" />
            ))}
          </div>

          {/* Growth-phase banner — only when browsing unfiltered with a small catalog */}
          {!anyActive && total < SPARSE_THRESHOLD && (
            <div className="mt-10 bg-white border border-border rounded-[16px] p-6 text-center">
              <p className="font-headline text-lg font-bold text-site-text mb-1">
                הרשימה גדלה — מצאנו {total} בתי עסק עד כה
              </p>
              <p className="text-site-muted text-sm mb-4">
                מדי שבוע מצטרפות בעלות עסקים נוספות
              </p>
              <div className="flex justify-center gap-3 flex-wrap">
                <Link
                  href="/register/producer"
                  className="inline-flex items-center bg-primary text-white px-5 py-2.5 rounded-[12px] text-sm font-medium hover:bg-primary-light transition"
                >
                  הציעי עסק לדירקטורי 🌿
                </Link>
                <Link
                  href="/about#newsletter"
                  className="inline-flex items-center border border-primary text-primary px-5 py-2.5 rounded-[12px] text-sm font-medium hover:bg-light transition"
                >
                  הודיעי לי כשמצטרפות חדשות
                </Link>
              </div>
            </div>
          )}

          {/* Server-rendered pagination links — suppressed when any chip is active */}
          {!anyActive && <ServerPageLinks page={initialPage} totalPages={totalPages} />}
        </>
      ) : anyActive ? (
        /* Filter returned 0 results */
        <div className="text-center py-16">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-light mb-4"
            aria-hidden="true"
          >
            <span className="text-2xl">🔍</span>
          </div>
          <h3 className="font-headline text-xl font-bold text-site-text mb-2">
            לא מצאנו בתי עסק שמתאימים לסינון הזה
          </h3>
          <p className="text-site-muted mb-5 max-w-sm mx-auto text-sm">
            נסי להסיר אחד מהסינונים
          </p>
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center bg-primary text-white px-6 py-3 rounded-[16px] hover:bg-primary-light transition font-medium"
          >
            נקי הכל והצגי הכל
          </button>
        </div>
      ) : (
        /* No items, no filters — user navigated past the last page */
        <div className="text-center py-16">
          <p className="text-site-muted mb-4">הגעת לסוף הרשימה</p>
          <Link
            href="/producers"
            className="inline-flex items-center bg-primary text-white px-5 py-2 rounded-[12px] hover:bg-primary-light transition"
          >
            חזרה לעמוד הראשון
          </Link>
        </div>
      )}
    </>
  );
}

function ServerPageLinks({ page, totalPages }) {
  if (totalPages <= 1) return null;

  const prev =
    page > 1
      ? page - 1 === 1
        ? "/producers"
        : `/producers?page=${page - 1}`
      : null;
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
      <span className="text-site-muted">
        עמוד {page} מתוך {totalPages}
      </span>
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
