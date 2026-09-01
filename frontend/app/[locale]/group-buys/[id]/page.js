import { notFound } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { getTranslations } from "next-intl/server";
import GroupBuyDetailClient from "./GroupBuyDetailClient";
import { GroupBuyMetadataSchema } from "@/lib/schemas"; // MEH-1885: minimal metadata contract
import { API_URL } from "@/lib/env";
import { serverFetch } from "@/lib/server-fetch"; // MEH-977: timeout + transient-retry
import { buildAlternates, buildEntityTitle, OG_LOCALE } from "@/lib/i18n-seo";

// MEH-476 PR 3b2: per-page hreflang + per-locale title. Was no metadata at all.
// Fetches group-buy title server-side for D1 title format; gracefully falls
// back to seo.group_buy.title_fallback if API unreachable.
// MEH-1885: safeParse + Sentry + render the raw payload. Failure behaviour is
// decided in docs/audits/producer-detail-page-validation.md §6 — never throw,
// never notFound() (the MEH-1754 class). Inline per the over-engineering guard.
const ROUTE = "/[locale]/group-buys/[id]";

async function getGroupBuy(id) {
  // MEH-2101: `null` means ONE thing — this group-buy does not exist, and only a
  // 404 may become notFound(). Every other failure THROWS, so it reaches
  // app/[locale]/error.js and the response carries a 5xx.
  //
  // The old shape returned `null` for every `!res.ok` and swallowed the catch,
  // so a 404, a 500, a 429 and a timeout were indistinguishable — all four
  // rendered a soft 404 with no error status. That is not only a debugging
  // problem: a 404 tells Google the page is GONE and de-indexing starts, while
  // a 5xx says "try later". §6 of
  // docs/audits/producer-detail-page-validation.md used to forbid throwing
  // here; this ticket replaced that ruling with the three-way table.
  let res;
  try {
    res = await serverFetch(`${API_URL}/group-buys/${id}`, {
      next: { revalidate: 60 },
    });
  } catch (err) {
    // Network failure or timeout — not a missing group-buy. Report, then rethrow.
    Sentry.captureException(err, { extra: { route: ROUTE, id } });
    throw err;
  }

  if (res.status === 404) return null;

  if (!res.ok) {
    Sentry.captureMessage("SSR fetch failed", {
      level: "error",
      extra: { route: ROUTE, id, status: res.status },
    });
    const err = new Error(
      `group-buy lookup failed: ${res.status} ${res.statusText} (id=${id})`
    );
    // Read by Sentry in app/[locale]/error.js; keeps id+status on the event.
    err.status = res.status;
    err.entityId = id;
    throw err;
  }

  const data = await res.json();
  const parsed = GroupBuyMetadataSchema.safeParse(data);
  if (!parsed.success) {
    Sentry.captureMessage("SSR payload failed schema validation", {
      level: "warning",
      extra: { route: ROUTE, id, issues: parsed.error.issues },
    });
  }
  // Raw, never `parsed.data` — the schema is minimal, so parsing would strip
  // every undeclared key from the metadata input (MEH-901 class).
  return data;
}

export async function generateMetadata(props) {
  const params = await props.params;
  const { id, locale } = params;
  const [groupBuy, t] = await Promise.all([
    getGroupBuy(id),
    getTranslations({ locale, namespace: "seo.group_buy" }),
  ]);
  const path = `/group-buys/${id}`;
  const alternates = buildAlternates(path, locale);
  // MEH-2101: pre-streaming, so this yields a REAL 404 status. A page-level
  // notFound() alone streams 200 + 404 UI, because the shared
  // app/[locale]/loading.js boundary flushes the shell first — bots would
  // keep crawling a soft 404. (MEH-1045 established this on the slug route.)
  if (!groupBuy) notFound();
  const entityName = groupBuy?.title || groupBuy?.name;

  if (!entityName) {
    // MEH-641: titleless entity treated as 404; SEO-worthless by design — see ticket for rationale.
    // MEH-476 followup: 404 paths should not be indexed even though they
    // still emit valid hreflang (so cross-locale 404s are linked).
    return {
      title: { absolute: t("title_fallback") },
      description: t("description_fallback"),
      robots: { index: false, follow: false },
      openGraph: {
        type: "article",
        locale: OG_LOCALE[locale],
        images: ["/og-image.png"],
      },
      alternates,
    };
  }

  return {
    // title.absolute — buildEntityTitle already includes brand.
    title: { absolute: buildEntityTitle(entityName, locale) },
    description: groupBuy?.description || t("description_fallback"),
    openGraph: {
      type: "article",
      locale: OG_LOCALE[locale],
      images: groupBuy?.image_url ? [groupBuy.image_url] : ["/og-image.png"],
    },
    alternates,
  };
}

export default async function GroupBuyDetailPage(props) {
  const params = await props.params;
  return <GroupBuyDetailClient id={params.id} />;
}
