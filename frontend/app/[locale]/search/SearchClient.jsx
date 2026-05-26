"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import ProducerCard from "@/components/ProducerCard";
import Breadcrumb from "@/components/Breadcrumb";
import { SkeletonProducerGrid } from "@/components/Skeleton";

/**
 * /search results page — two sections (businesses + products) (MEH-13).
 *
 * Reads ?q=<term> from the URL and fires both:
 *   - GET /producers?q=<term> — full producer list (same shape the homepage uses)
 *   - GET /search?q=<term>    — for the grouped products slice
 *
 * They run in parallel so the page paints as soon as either arrives.
 * Using the filename page.jsx (not page.js) so vitest's oxc parser can
 * handle the JSX directly without a dedicated loader config.
 *
 * useSearchParams must live inside a <Suspense> boundary for App
 * Router static prerender — without it, `next build` throws on
 * /search with "Error occurred prerendering page".
 */
export default function SearchClient() {
  return (
    <Suspense fallback={<SearchPageSkeleton />}>
      <SearchPageBody />
    </Suspense>
  );
}

function SearchPageSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-4 h-4 w-32 bg-border/50 rounded-lg animate-pulse" />
      <div className="h-8 w-64 bg-border/50 rounded-lg animate-pulse mb-6" />
      <SkeletonProducerGrid count={6} />
    </div>
  );
}

function SearchPageBody() {
  const t = useTranslations("search");
  const params = useSearchParams();
  const router = useRouter();
  const q = (params.get("q") || "").trim();
  const shouldFocus = params.get("focus") === "1";
  const inputRef = useRef(null);
  const [inputVal, setInputVal] = useState(q);

  const [producers, setProducers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (shouldFocus) {
      inputRef.current?.focus();
    }
  }, [shouldFocus]);

  const handleSearch = (e) => {
    e.preventDefault();
    const term = inputVal.trim();
    if (term) router.push(`/search?q=${encodeURIComponent(term)}`);
  };

  useEffect(() => {
    if (!q) {
      setProducers([]);
      setProducts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      api.get("/producers", { params: { q } }).then((r) => r.data).catch(() => []),
      api.get("/search", { params: { q } }).then((r) => r.data).catch(() => null),
    ])
      .then(([producerRows, searchPayload]) => {
        setProducers(Array.isArray(producerRows) ? producerRows : []);
        setProducts(searchPayload?.products || []);
      })
      .finally(() => setLoading(false));
  }, [q]);

  const totalHits = producers.length + products.length;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <Breadcrumb
        items={[
          { href: "/", label: t("breadcrumb_home") },
          { label: q ? t("breadcrumb_query", { q }) : t("breadcrumb_search") },
        ]}
        className="mb-4"
      />
      <h1 className="font-headline text-3xl font-bold text-text mb-4">
        {q ? t("title_results", { q }) : t("title_default")}
      </h1>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex items-center gap-2 mb-6 max-w-xl">
        <div className="flex-1 flex items-center gap-2 border border-border rounded-full px-4 py-2.5 bg-white focus-within:ring-2 focus-within:ring-primary/40">
          <MagnifyingGlass size={18} color="#6B6B6B" weight="regular" aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder={t("input_placeholder")}
            dir="rtl"
            className="flex-1 bg-transparent outline-none text-text placeholder:text-fg-muted text-sm"
            aria-label={t("input_aria")}
          />
        </div>
        <button
          type="submit"
          className="bg-primary text-white px-4 py-2.5 rounded-full text-sm font-medium hover:bg-primary-dark transition"
        >
          {t("submit")}
        </button>
      </form>

      {!loading && q && (
        <p className="text-fg-muted mb-8 text-sm">
          {totalHits === 0
            ? t("no_results_hint")
            : t("results_count", { totalHits })}
        </p>
      )}

      {!q && (
        <p className="text-fg-muted">
          {t("empty_prompt")}
        </p>
      )}

      {q && loading && <SkeletonProducerGrid count={6} />}

      {q && !loading && (
        <>
          {/* -------- Businesses -------- */}
          {producers.length > 0 && (
            <section className="mb-12">
              <h2 className="font-headline text-2xl font-bold text-text mb-4">
                {t("section_producers")} ({producers.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {producers.map((p) => (
                  <ProducerCard key={p.id} producer={p} referrer="search" />
                ))}
              </div>
            </section>
          )}

          {/* -------- Products -------- */}
          {products.length > 0 && (
            <section className="mb-12">
              <h2 className="font-headline text-2xl font-bold text-text mb-4">
                {t("section_products")} ({products.length})
              </h2>
              <ul className="divide-y divide-border bg-white rounded-[12px] border border-border overflow-hidden">
                {products.map((prod) => {
                  const href = prod.producer_slug
                    ? `/${prod.producer_slug}`
                    : `/producer/${prod.producer_id}`;
                  return (
                    <li key={prod.id}>
                      <Link
                        href={href}
                        className="flex flex-col gap-1 p-4 hover:bg-green-50/50 transition"
                      >
                        <span className="font-medium text-text">
                          {prod.name}
                        </span>
                        {prod.description && (
                          <span className="text-sm text-fg-muted line-clamp-2">
                            {prod.description}
                          </span>
                        )}
                        <span className="text-xs text-primary">
                          {t("product_by_prefix")} {prod.producer_name}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {totalHits === 0 && (
            <div className="text-center py-16">
              <div
                className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-green-50 mb-6 text-5xl"
                aria-hidden="true"
              >
                🌿
              </div>
              <h2 className="font-headline text-2xl font-bold text-text mb-2">
                {t("empty_title")}
              </h2>
              <p className="text-fg-muted mb-6 max-w-md mx-auto">
                {t("empty_subtitle")}
              </p>
              <Link
                href="/"
                className="inline-flex items-center bg-primary text-white px-6 py-3 rounded-[8px] hover:bg-primary-light transition font-medium"
              >
                {t("empty_home_cta")}
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
