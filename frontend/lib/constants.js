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

// MEH-2192: `sameAs` for the Organization node — the profiles that corroborate
// the entity. Exactly one canonical brand account exists today; it is the one
// the footer already links (components/Footer.jsx:138). Do not add speculative
// or placeholder profiles here: an unresolvable sameAs is worse than an absent
// one, because it asserts an identity nobody can verify.
export const BRAND_SAME_AS = ["https://www.instagram.com/meha_makor"];
