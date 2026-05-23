export const BRAND_NAME = "מהמקור";

// MEH-476 PR Wave 6: outbound surface variant (sitemap slugs, Latin-script
// share text, EN-locale page titles). Q6 hybrid rule: UI chrome → BRAND_NAME;
// outbound prose / non-Hebrew metadata → BRAND_NAME_LATIN. Defined here so
// the two forms stay locked-step if a rebrand ever happens.
export const BRAND_NAME_LATIN = "Mehamakor";
