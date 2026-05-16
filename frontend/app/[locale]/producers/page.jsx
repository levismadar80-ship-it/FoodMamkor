import { Suspense } from "react";
import ProducersClient from "@/components/ProducersClient";
import { SkeletonProducerGrid } from "@/components/Skeleton";
import { clampPage } from "@/lib/pagination";
import { API_URL, SITE_URL } from "@/lib/env";

/**
 * Public paginated index (MEH-23). Server-rendered so crawlers can
 * walk the full catalog via /producers?page=N. Homepage stays curated
 * (hero, categories, recently viewed); this route is a pure list.
 *
 * 24 per page — 4 rows of 6 on desktop at the default grid width.
 * Client-side filter chips live in ProducersClient; they re-fetch
 * against the same /producers API without breaking SSR for crawlers.
 */

const PER_PAGE = 24;

async function fetchPage(page) {
  const offset = (page - 1) * PER_PAGE;
  try {
    const res = await fetch(
      `${API_URL}/producers?limit=${PER_PAGE}&offset=${offset}`,
      { next: { revalidate: 60 } },
    );
    if (!res.ok) return { items: [], total: 0 };
    const total = Number(res.headers.get("x-total-count") || 0);
    const items = await res.json();
    return { items: Array.isArray(items) ? items : [], total };
  } catch {
    return { items: [], total: 0 };
  }
}

export async function generateMetadata(props) {
  const searchParams = await props.searchParams;
  const page = clampPage(Number(searchParams?.page) || 1, 999);
  const title =
    page === 1
      ? "כל בתי העסק | מהמקור"
      : `כל בתי העסק — עמוד ${page} | מהמקור`;

  // Canonical + rel=prev/next help Google consolidate paginated results.
  const canonical =
    page === 1 ? `${SITE_URL}/producers` : `${SITE_URL}/producers?page=${page}`;

  return {
    title,
    description: "דפדפי בכל בתי העסק, מגדלים וחוות מקומיות על מהמקור.",
    alternates: { canonical },
  };
}

export default async function ProducersIndexPage(props) {
  const searchParams = await props.searchParams;
  const requestedPage = Math.max(1, Math.floor(Number(searchParams?.page) || 1));
  const { items, total } = await fetchPage(requestedPage);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = clampPage(requestedPage, totalPages);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <Suspense fallback={<SkeletonProducerGrid count={8} />}>
        <ProducersClient
          initialItems={items}
          initialTotal={total}
          initialPage={page}
          totalPages={totalPages}
          perPage={PER_PAGE}
        />
      </Suspense>
    </div>
  );
}
