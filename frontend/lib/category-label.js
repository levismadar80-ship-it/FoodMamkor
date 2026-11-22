// @ts-check
/**
 * Module:   category-label
 * Purpose:  The one place a category's shown name is chosen: the locale's
 *           `category_names.<slug>` message when the category has a known
 *           slug, else the DB name. /en shows English, /he the same Hebrew as
 *           the DB (MEH-3076, names approved by Sapir 21/11).
 * Does NOT: translate a business's own text (MEH-3637, post-launch), change
 *           how categories are matched or filtered — the DB `name` and `id`
 *           stay the keys everywhere. Server-side SEO text (lib/seo.js) reads
 *           the same messages through its own localCategory().
 * Related:  backend/app/services/category_slug.py NAME_TO_SLUG (the slugs),
 *           messages/{he,en}.json `category_names`.
 */

/**
 * @param {{ (key: string): string, has: (key: string) => boolean }} t
 *   a translator for the ROOT namespace (useTranslations() / getTranslations({ locale })).
 * @param {{ name?: string|null, slug?: string|null }|null|undefined} category
 * @returns {string}
 */
export function categoryLabel(t, category) {
  const name = category?.name ?? "";
  const slug = category?.slug;
  // A slug is lowercase letters, digits, "-" or "_" (category_slug.py). The
  // check also keeps an object-prototype word ("constructor") from reaching
  // t.has, which walks plain properties and would answer true for it.
  if (!slug || !/^[a-z0-9_-]+$/.test(slug) || slug === "constructor" || slug === "__proto__") return name;
  const key = `category_names.${slug}`;
  return t.has(key) ? t(key) : name;
}
