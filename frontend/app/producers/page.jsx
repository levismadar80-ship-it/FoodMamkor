import Link from "next/link";
import ProducerCard from "@/components/ProducerCard";
import Breadcrumb from "@/components/Breadcrumb";
import Pagination from "@/components/Pagination";
import { clampPage } from "@/lib/pagination";

/**
 * Public paginated index (MEH-23). Server-rendered so crawlers can
 * walk the full catalog via /producers?page=N. Homepage stays curated
 * (hero, categories, recently viewed); this route is a pure list.
 *
 * 24 per page — 4 rows of 6 on desktop at the default grid width.
 */

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const SITE_URL = "https://mehamakor.online";
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

export async function generateMetadata({ searchParams }) {
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

export default async function ProducersIndexPage({ searchParams }) {
  // Parse the requested page; negative/NaN fall to 1. We fetch with the
  // raw value — if it's past the end the backend returns an empty page
  // and we show the empty-state CTA below without bouncing the user.
  const requestedPage = Math.max(1, Math.floor(Number(searchParams?.page) || 1));
  const { items, total } = await fetchPage(requestedPage);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = clampPage(requestedPage, totalPages);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <Breadcrumb
        items={[
          { href: "/", label: "בית" },
          { label: "כל בתי העסק" },
        ]}
        className="mb-4"
      />

      <h1 className="font-headline text-3xl font-bold text-site-text mb-2">
        כל בתי העסק
      </h1>
      <p className="text-site-muted mb-8 text-sm">
        {total === 0
          ? "אין עסקים להצגה"
          : `מציגים ${(page - 1) * PER_PAGE + 1}–${Math.min(
              page * PER_PAGE,
              total,
            )} מתוך ${total}`}
      </p>

      {items.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-site-muted mb-4">לא מצאנו עסקים בעמוד הזה 🌱</p>
          <Link
            href="/producers"
            className="inline-flex items-center bg-primary text-white px-5 py-2 rounded-[12px] hover:bg-primary-light transition"
          >
            חזרי לעמוד ראשון
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {items.map((p) => (
              <ProducerCard key={p.id} producer={p} referrer="producers-index" />
            ))}
          </div>

          {/* Server-rendered page links so crawlers can follow.
              Pagination is a client Link-based navigator; but we also
              emit plain <a> for prev/next that crawlers index easily. */}
          <ServerPageLinks page={page} totalPages={totalPages} />
        </>
      )}
    </div>
  );
}

function ServerPageLinks({ page, totalPages }) {
  if (totalPages <= 1) return null;

  const prev = page > 1 ? (page - 1 === 1 ? "/producers" : `/producers?page=${page - 1}`) : null;
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

