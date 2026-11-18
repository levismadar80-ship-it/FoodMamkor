// @ts-check
export const BRAND_NAME = "מהמקור";

// MEH-476 PR Wave 6: outbound surface variant (sitemap slugs, Latin-script
// share text, EN-locale page titles). Q6 hybrid rule: UI chrome → BRAND_NAME;
// outbound prose / non-Hebrew metadata → BRAND_NAME_LATIN. Defined here so
// the two forms stay locked-step if a rebrand ever happens.
export const BRAND_NAME_LATIN = "Mehamakor";

// MEH-2192: the site's canonical one-line description. Lived as a private
// `SITE_DESCRIPTION` const inside app/[locale]/layout.js, where it fed the
// <meta name="description">, the OG card and the Twitter card. The
// Organization JSON-LD node needs the SAME sentence — an entity description
// that disagrees with the page's own meta description is exactly the
// inconsistency E-E-A-T/GEO tooling reads as a weak signal.
//
// Moved rather than copied, deliberately: two owners for one sentence is the
// drift shape workflow.md calls Smell #1, and copy is the kind of string that
// gets edited in one place and forgotten in the other. layout.js now imports
// it from here.
//
// MEH-2364 (26/10): now the ADR-011 locked tagline, verbatim, on the footer,
// meta and OG surfaces (__tests__/adr011-tagline.test.js ties all of them to
// the ADR). Changing it needs a new ADR superseding ADR-011, not a copy edit.
// MEH-3424 / ADR-043: the ONE sentence that says what the site is, on every
// surface that describes it in a line: <meta name="description">, og/twitter
// description, the Organization JSON-LD `description` and public/llms.txt.
// Approved verbatim by Sapir on 18/11/2026 (rule 22). It replaced the ADR-011
// tagline here, which speaks to business owners and was read by ChatGPT as
// the site's self-description (ADR-041). The tagline stays on the footer.
export const SITE_DESCRIPTION =
  "במהמקור מוצאים אוכל מבתי עסק מקומיים קרוב לבית, במקום אחד.";

// MEH-2192: the brand sentence (the home hero subheading). Since MEH-3424 /
// ADR-043 it is the Organization JSON-LD `slogan`, no longer its
// `description` or the llms.txt summary — those carry SITE_DESCRIPTION above.
// Rule-22 approved verbatim by Sapir on MEH-2192 (06/09).
// MEH-2313 (25/10): «קטנים שבדקנו» → «מקומיים שבחרנו», approved verbatim.
export const CANONICAL_SENTENCE =
  "אוכל מבתי עסק מקומיים שבחרנו אישית — קרוב לבית, בלי לחפש שעות.";

// MEH-2192: `sameAs` for the Organization node — the profiles that corroborate
// the entity, and the same four the footer links (components/Footer.jsx).
// MEH-2311 (25/10): Facebook, TikTok and YouTube joined Instagram once each had
// a fixed handle. Do not add a profile here until its URL is permanent: an
// unresolvable sameAs is worse than an absent one, because it asserts an
// identity nobody can verify.
export const BRAND_SAME_AS = [
  "https://www.instagram.com/meha_makor",
  "https://www.facebook.com/mehamakor",
  "https://www.tiktok.com/@mehamakor",
  "https://www.youtube.com/@Mehamakor",
];

// MEH-3323: the founders, one place. Two sisters founded Mehamakor (Sapir
// 15/11) — every surface that names a founder reads from here or from copy
// that organization-jsonld.test.js pins to it. Order is fixed (Sapir first,
// as in the approved copy); names never rotate. Not read from he.json at
// runtime: seo.js is imported by server metadata paths and must stay free of
// the messages bundle. (MEH-2192 introduced the single-founder predecessor.)
export const FOUNDERS = Object.freeze([
  Object.freeze({ name: "ספיר שנפ" }),
  Object.freeze({ name: "טופז שנפ" }),
]);
