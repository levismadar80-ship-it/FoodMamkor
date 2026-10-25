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
// This is NOT new copy and needs no rule-22 approval — it is the string
// already shipping on every page, reused verbatim.
export const SITE_DESCRIPTION =
  "בתי עסק מקומיים מתחום המזון בישראל, כולם במקום אחד. כל בית עסק נבחר אישית.";

// MEH-2192: the ONE brand sentence that machine-identity surfaces share —
// the Organization JSON-LD `description` and public/llms.txt line 3 (a test
// asserts the file matches this constant, so the file cannot drift alone).
// Rule-22 approved verbatim by Sapir on MEH-2192 (06/09). SITE_DESCRIPTION
// above stays the per-page <meta name="description">; the two are different
// jobs — one describes the entity, the other sells the page to a SERP.
// MEH-2313 (25/10): «קטנים שבדקנו» → «מקומיים שבחרנו», approved verbatim.
export const CANONICAL_SENTENCE =
  "אוכל מבתי עסק מקומיים שבחרנו אישית — קרוב אלייך, בלי לחפש שעות.";

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

// MEH-2192: `founder` for the Organization node. The value is the name as it
// already appears in the /about signature copy (messages/he.json
// `about.signature.name`) — organization-jsonld.test.js pins the two together,
// so a copy edit there reds here instead of leaving the entity disagreeing
// with the page. Not read from he.json at runtime: seo.js is imported by
// server metadata paths and must stay free of the messages bundle.
export const BRAND_FOUNDER_NAME = "ספיר שנפ";
