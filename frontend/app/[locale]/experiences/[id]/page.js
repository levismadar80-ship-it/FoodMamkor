// @ts-check
import { isOwnerPreview } from "@/lib/owner-preview";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import ExperienceDetailClient from "./ExperienceDetailClient";
import { ExperienceMetadataSchema } from "@/lib/schemas"; // MEH-1885: minimal metadata contract
import { fetchSsrEntity } from "@/lib/ssr-entity-fetch";
import { buildAlternates, OG_LOCALE } from "@/lib/i18n-seo";
import { siteOgImageUrl } from "@/lib/og-site-image";
import { buildExperienceJsonLd, serializeJsonLd } from "@/lib/seo"; // MEH-2478: Event JSON-LD

// MEH-476 PR 3b2: per-page hreflang + per-locale title. Was hardcoded HE
// static const. Fetches experience title server-side for D1 title format;
// gracefully falls back to seo.experience.title_fallback if API unreachable
// or experience not found (404 path).
// MEH-1885: safeParse + Sentry + render the raw payload. Failure behaviour is
// decided in docs/audits/producer-detail-page-validation.md §6 — never throw,
// never notFound() (the MEH-1754 class). Shared: lib/ssr-entity-fetch.js (MEH-3465).
const ROUTE = "/[locale]/experiences/[id]";

function getExperience(id) {
  // MEH-3465: the three-way fetch (null = missing, throw = unavailable) and
  // its reporting live in lib/ssr-entity-fetch.js, shared by four pages.
  return fetchSsrEntity({ path: "/experiences", id, route: ROUTE, noun: "experience", schema: ExperienceMetadataSchema });
}

export async function generateMetadata(props) {
  const params = await props.params;
  const { id, locale } = params;
  const [experience, t] = await Promise.all([
    getExperience(id),
    getTranslations({ locale, namespace: "seo.experience" }),
  ]);
  const path = `/experiences/${id}`;
  const alternates = buildAlternates(path, locale);
  // MEH-2101: meant to yield a REAL 404 status. MEH-3199 measured 14/11 on a
  // local build, before and after: 200 + noindex for a missing id (see
  // not-found.js). A page-level
  // notFound() alone streams 200 + 404 UI, because the shared
  // app/[locale]/loading.js boundary flushes the shell first — bots would
  // keep crawling a soft 404. (MEH-1045 established this on the slug route.)
  // Owner/admin preview (lib/owner-preview.js): the anonymous fetch cannot
  // see a pending item, so say nothing indexable and let the browser ask.
  if (!experience && isOwnerPreview(await props.searchParams)) {
    return { title: t("title_fallback"), robots: { index: false, follow: false } };
  }
  if (!experience) notFound();
  const entityName = experience?.title || experience?.name;

  if (!entityName) {
    // MEH-641: titleless entity treated as 404; SEO-worthless by design — see ticket for rationale.
    // MEH-476 followup: 404 paths should not be indexed even though they
    // still emit valid hreflang (so cross-locale 404s are linked).
    return {
      // MEH-2853: plain title — the layout template `%s | <brand>` adds the brand.
      title: t("title_fallback"),
      description: t("description_fallback"),
      robots: { index: false, follow: false },
      openGraph: {
        type: "article",
        locale: OG_LOCALE[locale],
        images: [siteOgImageUrl(locale)],
      },
      alternates,
    };
  }

  return {
    // MEH-2853: plain title — the layout template `%s | <brand>` adds the brand.
    title: entityName,
    description: experience?.description || t("description_fallback"),
    openGraph: {
      type: "article",
      locale: OG_LOCALE[locale],
      images: experience?.image_url ? [experience.image_url] : [siteOgImageUrl(locale)],
    },
    alternates,
  };
}

// MEH-2478: server-rendered Event + BreadcrumbList JSON-LD — same pattern as
// events/[id]/page.js EventJsonLd. The builder returns null (no markup) for an
// experience without a concrete date or a city: Google requires both.
function ExperienceJsonLd({ experience, locale }) {
  const jsonLd = buildExperienceJsonLd(experience, locale);
  if (!jsonLd) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
    />
  );
}

// ExperienceDetailClient uses useSearchParams() for the ?pending=1
// "just submitted" banner — wrap in Suspense per Next.js 14 rules.
export default async function ExperienceDetailPage(props) {
  const params = await props.params;
  // Same request as generateMetadata (revalidate:60 dedupes it), which already
  // 404s a missing experience; belt-and-braces for the body.
  const experience = await getExperience(params.id);
  // Owner/admin preview (lib/owner-preview.js): render the client, which asks
  // again with the user's token; the backend decides whether she may see it.
  const preview = !experience && isOwnerPreview(await props.searchParams);
  if (!experience && !preview) notFound();
  const t = await getTranslations({ locale: params.locale, namespace: "experiences.detail" });
  return (
    <>
      {experience && <ExperienceJsonLd experience={experience} locale={params.locale} />}
      {/* MEH-2754: min-h-screen keeps the footer below the fold while the
          fallback shows, so swapping in the page shifts nothing in view. */}
      <Suspense
        fallback={
          <div className="max-w-3xl mx-auto px-4 py-16 text-center text-fg-muted min-h-screen" data-testid="page-suspense-fallback">
            {t("loading")}
          </div>
        }
      >
        {/* MEH-3199: server data in the first HTML; key resets on a move to another workshop. */}
        <ExperienceDetailClient key={experience?.id ?? params.id} initialExperience={experience} />
      </Suspense>
    </>
  );
}
