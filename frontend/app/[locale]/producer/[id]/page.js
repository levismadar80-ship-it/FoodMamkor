import * as Sentry from "@sentry/nextjs";
import ProducerDetail from "./ProducerDetail";
import { buildProducerMetadata, buildJsonLd, serializeJsonLd, buildPageUrl, SITE_URL } from "@/lib/seo";
import { API_URL } from "@/lib/env";
import { serverFetch } from "@/lib/server-fetch"; // MEH-977: timeout + transient-retry
import { buildAlternates, buildEntityTitle, OG_LOCALE } from "@/lib/i18n-seo";
import { ProducerDetailSchema } from "@/lib/schemas"; // MEH-1752: the detail contract

const ROUTE = "/[locale]/producer/[id]";

// MEH-1885: validate the payload, report the mismatch, render anyway.
// Decision locked in docs/audits/producer-detail-page-validation.md §6 —
// `.parse()` would turn a silent SEO defect into an availability incident, and
// `notFound()` is forbidden here (the MEH-1754 indexing-risk class). Neither is
// re-litigated; this is the third row of that table.
//
// Reporting is inline at all four SSR sites rather than behind a shared
// helper, per the ticket's over-engineering guard: "four call sites, one
// pattern, inline". Call shape copied from lib/api.js:141.
// A non-ok response only reports at >= 500: a 404 here is an ordinary
// outcome (deleted producer, crawler on a stale URL) and paging the operator
// on it would bury the signal this ticket exists to create. Same threshold as
// lib/api.js:140.
async function getProducer(id) {
  try {
    const res = await serverFetch(`${API_URL}/producers/${id}`, { next: { revalidate: 60 } });
    if (!res.ok) {
      if (res.status >= 500) {
        Sentry.captureMessage("SSR fetch failed", {
          level: "error",
          extra: { route: ROUTE, id, status: res.status },
        });
      }
      return null;
    }
    const data = await res.json();
    const parsed = ProducerDetailSchema.safeParse(data);
    if (!parsed.success) {
      Sentry.captureMessage("SSR payload failed schema validation", {
        level: "warning",
        extra: { route: ROUTE, id, issues: parsed.error.issues },
      });
    }
    // Return `data`, NEVER `parsed.data`: z.object strips undeclared keys, and
    // ProducerDetailSchema declares 51 of ProducerDetailOut's 81 fields — so
    // returning the parsed object would delete 30 fields from the JSON-LD
    // input. That is the MEH-901 stripping class, which this ticket must not
    // introduce while trying to observe it. safeParse here is a probe, not a
    // transform.
    return data;
  } catch (err) {
    // Was a bare `catch { return null }` — the swallow this ticket removes.
    // Still returns null (behaviour unchanged); it just stops being silent.
    Sentry.captureException(err, { extra: { route: ROUTE, id } });
    return null;
  }
}

// MEH-476 PR 3b2: per-page hreflang for producer-by-id route. D1 title
// format ({name} | brand) applied per-locale.
// MEH-1060 (SEO-01): when the producer has a slug, canonical + hreflang must
// point to the slug URL — matching the JSON-LD @id/url (buildPageUrl) and the
// sitemap entry, so the three SEO signals agree instead of self-canonicaling
// to /producer/{id}. buildPageUrl is the single owner of the slug-vs-id
// preference; strip SITE_URL to get the relative path buildAlternates expects.
// 404 (no producer) keeps the /producer/{id} path.
export async function generateMetadata(props) {
  const params = await props.params;
  const { id, locale } = params;
  const producer = await getProducer(id);
  const path = producer ? buildPageUrl(producer).replace(SITE_URL, "") : `/producer/${id}`;
  const alternates = buildAlternates(path, locale);

  if (!producer) {
    return {
      // title.absolute prevents layout's `%s | brand` template double-suffix.
      title: { absolute: buildEntityTitle(null, locale) },
      // MEH-476 followup: 404 paths should not be indexed even though
      // they still emit valid hreflang (so cross-locale 404s are linked).
      robots: { index: false, follow: false },
      alternates,
    };
  }

  const base = buildProducerMetadata(producer);
  return {
    ...base,
    title: { absolute: buildEntityTitle(producer.name, locale) },
    openGraph: {
      ...base.openGraph,
      locale: OG_LOCALE[locale],
    },
    alternates,
  };
}

function ProducerJsonLd({ producer, locale }) {
  const jsonLd = buildJsonLd(producer, locale);
  if (!jsonLd) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
    />
  );
}

export default async function ProducerPage(props) {
  const params = await props.params;
  const producer = await getProducer(params.id);

  return (
    <>
      <ProducerJsonLd producer={producer} locale={params.locale} />
      <ProducerDetail />
    </>
  );
}
