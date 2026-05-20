import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import ExperienceDetailClient from "./ExperienceDetailClient";
import { API_URL } from "@/lib/env";
import { buildAlternates, buildEntityTitle, OG_LOCALE } from "@/lib/i18n-seo";

// MEH-476 PR 3b2: per-page hreflang + per-locale title. Was hardcoded HE
// static const. Fetches experience title server-side for D1 title format;
// gracefully falls back to seo.experience.title_fallback if API unreachable
// or experience not found (404 path).
async function getExperience(id) {
  try {
    const res = await fetch(`${API_URL}/experiences/${id}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
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
  const entityName = experience?.title || experience?.name;

  if (!entityName) {
    // MEH-476 followup: 404 paths should not be indexed even though they
    // still emit valid hreflang (so cross-locale 404s are linked).
    return {
      title: { absolute: t("title_fallback") },
      description: t("description_fallback"),
      robots: { index: false, follow: false },
      openGraph: {
        type: "article",
        locale: OG_LOCALE[locale],
        images: ["/og-image.jpg"],
      },
      alternates,
    };
  }

  return {
    // title.absolute — buildEntityTitle already includes brand.
    title: { absolute: buildEntityTitle(entityName, locale) },
    description: experience?.description || t("description_fallback"),
    openGraph: {
      type: "article",
      locale: OG_LOCALE[locale],
      images: experience?.image_url ? [experience.image_url] : ["/og-image.jpg"],
    },
    alternates,
  };
}

// ExperienceDetailClient uses useSearchParams() for the ?pending=1
// "just submitted" banner — wrap in Suspense per Next.js 14 rules.
export default function ExperienceDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-3xl mx-auto px-4 py-16 text-center text-site-muted">
          טוענת את החוויה...
        </div>
      }
    >
      <ExperienceDetailClient />
    </Suspense>
  );
}
