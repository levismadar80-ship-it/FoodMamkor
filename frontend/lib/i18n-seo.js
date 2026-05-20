/**
 * Shared i18n SEO helpers — MEH-476 PR 3b2.
 *
 * Why this file exists:
 *   PR 3b1 inlined hreflang + canonical helpers in app/[locale]/about/page.js
 *   and app/[locale]/layout.js. PR 3b2 propagates the pattern to ~16 more
 *   public routes — extracting here gives a single source of truth instead
 *   of 16+ duplicate copies (MEH-271 smell #2 — "remember to update X when
 *   you change Y").
 *
 * Why a new file rather than extending lib/seo.js:
 *   lib/seo.js owns producer-specific helpers (buildTitle, buildJsonLd,
 *   buildProducerMetadata) that are HE-only by design. Mixing locale-aware
 *   alternates helpers with HE-only content helpers would muddy the
 *   responsibility boundary. lib/seo.js stays HE-only content helpers;
 *   lib/i18n-seo.js owns locale-aware URL + alternates helpers.
 *
 * DO NOT add to routing.locales without also adding the matching
 * HREFLANG_CODES + OG_LOCALE entries below — silent drift class.
 */

import { SITE_URL } from "./env";
import { BRAND_NAME, BRAND_NAME_LATIN } from "./constants";
import { routing } from "@/i18n/routing";

// MEH-476 PR 1 + 3b2: hreflang codes emitted to Google. "he-IL" geo-targets
// the Israeli audience (mehamakor.online is IL-only); routing locale codes
// ("he", "en") stay unchanged in middleware + URL building.
export const HREFLANG_CODES = { he: "he-IL", en: "en" };

// MEH-476 PR 3a + 3b2: OG locale codes per Facebook's spec (underscored region).
export const OG_LOCALE = { he: "he_IL", en: "en_US" };
export const OG_ALTERNATE_LOCALES = ["he_IL", "en_US"];

// MEH-476 PR 3b2: brand suffix per locale for dynamic entity titles.
// Q6 hybrid: outbound prose (page titles ARE outbound) → BRAND_NAME_LATIN
// on EN; BRAND_NAME (HE) on HE. Both constants live in lib/constants.js
// so a future rebrand updates both forms in one place.
const BRAND_SUFFIX = { he: BRAND_NAME, en: BRAND_NAME_LATIN };

/**
 * Build a fully-qualified URL for a given path under a locale.
 * localePrefix is "as-needed": defaultLocale (he) has no prefix; others get
 * /<locale>. "/" is normalized to "" so the home URL has no trailing slash
 * (SITE_URL for HE, SITE_URL/en for EN).
 */
export function urlForLocalePath(path, locale) {
  const base = locale === routing.defaultLocale ? SITE_URL : `${SITE_URL}/${locale}`;
  const normalized = path === "/" ? "" : path;
  return `${base}${normalized}`;
}

/**
 * Build the alternates object for Next.js Metadata API.
 *   { canonical: <self-referencing URL>,
 *     languages: { 'he-IL': <HE URL>, 'en': <EN URL>, 'x-default': <HE URL> } }
 *
 * x-default → defaultLocale (HE) per MEH-366 Q1 decision: Israeli audience
 * is the primary market.
 */
export function buildAlternates(path, currentLocale) {
  const languages = Object.fromEntries(
    routing.locales.map((l) => [HREFLANG_CODES[l] ?? l, urlForLocalePath(path, l)]),
  );
  languages["x-default"] = urlForLocalePath(path, routing.defaultLocale);
  return {
    canonical: urlForLocalePath(path, currentLocale),
    languages,
  };
}

/**
 * Build a dynamic entity title — D1 format approved 2026-05-20:
 *   HE: "{name} | מהמקור"
 *   EN: "{name} | Mehamakor"
 * Falls back to brand name alone when entityName is missing (404, API down).
 */
export function buildEntityTitle(entityName, locale) {
  const brand = BRAND_SUFFIX[locale] ?? BRAND_NAME;
  if (!entityName) return brand;
  return `${entityName} | ${brand}`;
}
