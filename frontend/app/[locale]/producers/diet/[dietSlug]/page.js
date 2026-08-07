/**
 * Module:   producers-diet-landing
 * Purpose:  /producers/diet/[dietSlug] — the six indexable diet landing pages
 *           (MEH-1935). Uber-Eats template: breadcrumb → H1 → editorial intro →
 *           sibling chips → SSR'd filtered grid → copy-honesty line → FAQ, with
 *           ItemList + FAQPage + BreadcrumbList JSON-LD.
 * Touches:  nothing — read-only against GET /producers.
 * Does NOT: own the slug config (lib/diet-pages.js), the labels
 *           (lib/attribute-labels.js) or the JSON-LD shape (lib/seo.js).
 * Related:  MEH-1204 §B (hub-and-spoke internal links), MEH-1754 + MEH-1045
 *           (a 404 must mean "genuinely absent", and must be pre-streaming),
 *           MEH-1934 (unblocks the two `backed: false` slugs).
 * History:  MEH-1935 (creation, 2026-08-07).
 */
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import ProducerCard from "@/components/ProducerCard";
import Breadcrumb from "@/components/Breadcrumb";
import { API_URL } from "@/lib/env";
import { serverFetch } from "@/lib/server-fetch"; // MEH-977: timeout + transient-retry
import { buildAlternates, urlForLocalePath, OG_LOCALE } from "@/lib/i18n-seo";
import { BRAND_NAME } from "@/lib/constants";
import { buildDietPageJsonLd, serializeJsonLd, SITE_URL } from "@/lib/seo";
import {
  BACKED_DIET_PAGES,
  DIET_PAGE_MIN,
  dietPageLabel,
  dietPagePath,
  getDietPage,
  isDietPageBacked,
} from "@/lib/diet-pages";

// How many businesses the SSR'd grid renders. The ItemList JSON-LD mirrors
// exactly this set, so a crawler sees the same businesses in the markup and in
// the structured data.
const PER_PAGE = 24;

/**
 * MEH-1754 — the failure semantics are the whole point of this function, so
 * read before changing it.
 *
 * A 404 tells Google the page is GONE and de-indexing starts; a 5xx says "try
 * later". So the ONLY thing that may become notFound() here is a genuine
 * "fewer than DIET_PAGE_MIN businesses match" — a real, answered fact. Every
 * transport failure THROWS instead, reaching app/[locale]/error.js with a 5xx
 * and a Sentry event. Do NOT add a bare `catch` that returns an empty list:
 * that is precisely the swallow which made the 28/07 incident invisible for
 * four hours, and here it would silently 404 six indexable pages during any
 * backend wobble.
 */
async function fetchDietProducers(filterParam, limit) {
  const url = `${API_URL}/producers?${filterParam}=true&limit=${limit}&offset=0`;
  const res = await serverFetch(url, { next: { revalidate: 60 } });
  if (!res.ok) {
    const err = new Error(
      `diet listing failed: ${res.status} ${res.statusText} (filter=${filterParam})`,
    );
    err.status = res.status;
    err.filterParam = filterParam;
    throw err;
  }
  // An ABSENT X-Total-Count means "unknown", not "zero" — and the difference
  // is a de-indexing event. `Number(null || 0)` would quietly resolve to 0,
  // drop under the threshold and 404 all six pages the moment the backend
  // stopped sending the header. That is the MEH-1754 class wearing a different
  // hat: believing a negative the query never actually established. Unknown
  // therefore throws (5xx) exactly like any other transport fault; only a
  // header we really read may put a page below the threshold.
  const rawTotal = res.headers.get("x-total-count");
  const total = Number(rawTotal);
  if (rawTotal === null || !Number.isFinite(total)) {
    const err = new Error(
      `diet listing missing X-Total-Count (filter=${filterParam}) — refusing to infer an empty result`,
    );
    err.status = 502;
    err.filterParam = filterParam;
    throw err;
  }
  const items = await res.json();
  return { items: Array.isArray(items) ? items : [], total };
}

/**
 * Resolve a slug to a servable page, or null.
 *
 * Two independent gates, and they are NOT redundant:
 *   1. `backed` — does the backend implement this filter at all? FastAPI
 *      ignores an unknown query param, so an unbacked slug would return the
 *      whole catalog and pass a count check while showing a grid that
 *      contradicts its own H1 (see lib/diet-pages.js).
 *   2. `total >= DIET_PAGE_MIN` — the thin-content / doorway-page gate.
 */
async function resolveDietPage(slug) {
  const entry = getDietPage(slug);
  if (!isDietPageBacked(entry)) return null;
  const { items, total } = await fetchDietProducers(entry.filterParam, PER_PAGE);
  if (total < DIET_PAGE_MIN) return null;
  return { entry, items, total };
}

/**
 * Sibling chips = MEH-1204 §B internal linking. A chip may only point at a
 * cell that itself passes the gate — a chip to a sub-threshold page is a link
 * to a 404, which §B calls out explicitly.
 *
 * Fails OPEN (chip omitted) when a sibling's count can't be read: losing one
 * internal link is a cosmetic degradation, whereas throwing would 500 this
 * page over an unrelated sibling's wobble. Distinct from the page's own fetch
 * above, which must throw — there the answer IS the page.
 */
async function fetchServableSiblings(currentSlug) {
  const others = BACKED_DIET_PAGES.filter((p) => p.slug !== currentSlug);
  const counts = await Promise.all(
    others.map((p) =>
      fetchDietProducers(p.filterParam, 1)
        .then((r) => r.total)
        .catch(() => 0),
    ),
  );
  return others.filter((_, i) => counts[i] >= DIET_PAGE_MIN);
}

export async function generateMetadata({ params }) {
  const { dietSlug, locale } = await params;
  // MEH-1045: notFound() HERE (pre-streaming, before the [locale] loading.js
  // boundary flushes the shell) is what makes the response a REAL 404. A
  // page-level notFound() alone streams 200 + 404 UI, and bots keep crawling
  // the soft-404.
  const resolved = await resolveDietPage(dietSlug);
  if (!resolved) notFound();

  const { entry } = resolved;
  const t = await getTranslations({ locale, namespace: "diet_pages" });
  const label = dietPageLabel(entry);
  const path = dietPagePath(entry.slug);
  const title = t("meta_title", { label });
  const description = t(`pages.${entry.attribute}.meta_description`);

  return {
    // title.absolute prevents the layout's `%s | ${BRAND_NAME}` template from
    // double-suffixing (the why-local / for-businesses precedent).
    title: { absolute: title },
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: urlForLocalePath(path, locale),
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
      images: ["/og-image.png"],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og-image.png"],
    },
    alternates: buildAlternates(path, locale),
  };
}

export default async function DietLandingPage({ params }) {
  const { dietSlug, locale } = await params;
  setRequestLocale(locale);

  const resolved = await resolveDietPage(dietSlug);
  if (!resolved) notFound();
  const { entry, items } = resolved;

  const t = await getTranslations({ locale, namespace: "diet_pages" });
  const label = dietPageLabel(entry);
  const path = dietPagePath(entry.slug);
  const intro = t(`pages.${entry.attribute}.intro`);
  // t.raw: the FAQ is an ARRAY of {question, answer} in messages/*.json.
  const faq = t.raw(`pages.${entry.attribute}.faq`) ?? [];
  const siblings = await fetchServableSiblings(entry.slug);

  const jsonLd = buildDietPageJsonLd({
    label,
    pageUrl: urlForLocalePath(path, locale),
    intro,
    faq,
    // Locale-correct item URLs. `${SITE_URL}${path}` would emit the Hebrew URL
    // on the /en page, so the structured data would point somewhere other than
    // the links the page itself renders (which go through @/i18n/navigation) —
    // and other than each item's own per-locale canonical.
    items: items.map((p) => ({
      name: p.name,
      url: urlForLocalePath(
        p.slug ? `/${p.slug}` : `/producer/${p.id}`,
        locale,
      ),
    })),
    locale,
    producersUrl: urlForLocalePath("/producers", locale),
    producersLabel: t("breadcrumb_producers"),
  });

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:py-12">
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      )}

      <Breadcrumb
        className="mb-4"
        items={[
          { href: "/producers", label: t("breadcrumb_producers") },
          { label },
        ]}
      />

      <h1 className="text-2xl font-bold text-fg md:text-3xl">{label}</h1>
      <p className="mt-3 max-w-3xl text-base leading-relaxed text-fg-muted">
        {intro}
      </p>

      {siblings.length > 0 && (
        <nav aria-label={t("siblings_aria")} className="mt-6">
          <ul className="flex flex-wrap gap-2">
            {siblings.map((s) => (
              <li key={s.slug}>
                <Link
                  href={dietPagePath(s.slug)}
                  className="inline-flex items-center rounded-full border border-border bg-surface px-4 py-2 text-sm text-fg transition-colors hover:border-primary hover:text-primary"
                >
                  {dietPageLabel(s)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className="mt-8 grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((p) => (
          <ProducerCard key={p.id} producer={p} referrer="diet-landing" />
        ))}
      </div>

      {/*
        MEH-1507 copy-honesty: these are any-product, self-declared labels. The
        line states WHO established the marking and at what scope, in the same
        words on every one of the six pages.
      */}
      <p className="mt-6 text-sm text-fg-muted">{t("honesty")}</p>

      <section className="mt-12 max-w-3xl">
        <h2 className="text-xl font-bold text-fg">{t("faq_heading")}</h2>
        <dl className="mt-4 space-y-6">
          {/*
            Keyed by index, not by question text: the copy contract only
            requires each question to be non-empty, not unique, so a future
            editor repeating one would collide the keys. The list is static and
            ordered, which is exactly the case where an index key is safe.
          */}
          {faq.map((f, i) => (
            <div key={i}>
              <dt className="font-semibold text-fg">{f.question}</dt>
              <dd className="mt-1 leading-relaxed text-fg-muted">{f.answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="mt-10">
        <Link href="/producers" className="text-primary underline">
          {t("back_to_hub")}
        </Link>
      </p>
    </main>
  );
}
