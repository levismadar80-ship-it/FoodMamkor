import Breadcrumb from "@/components/Breadcrumb";
import ProducersClient from "@/components/ProducersClient";
import { clampPage } from "@/lib/pagination";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
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
  const canonical =
    page === 1 ? `${SITE_URL}/producers` : `${SITE_URL}/producers?page=${page}`;
  return {
    title,
    description: "דפדפי בכל בתי העסק, מגדלים וחוות מקומיות על מהמקור.",
    alternates: { canonical },
  };
}

export default async function ProducersIndexPage({ searchParams }) {
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
      <h1 className="font-headline text-3xl font-bold text-site-text mb-6">
        כל בתי העסק
      </h1>
      <ProducersClient
        initialItems={items}
        initialTotal={total}
        initialPage={page}
        totalPages={totalPages}
      />
    </div>
  );
}
