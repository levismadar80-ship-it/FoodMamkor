// @ts-check
/**
 * Module:   category-label
 * Purpose:  The one place a category's shown name is chosen: the locale's
 *           `category_names.<slug>` message when the category has a known
 *           slug, else the DB name. /en shows English, /he the same Hebrew as
 *           the DB (MEH-3076, names approved by Sapir 21/11).
 * Does NOT: translate a business's own text (MEH-3637, post-launch), change
 *           how categories are matched or filtered — the DB `name` and `id`
 *           stay the keys everywhere — or touch JSON-LD (lib/seo.js keeps the
 *           Hebrew name the page is about).
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
  if (!slug) return name;
  const key = `category_names.${slug}`;
  return t.has(key) ? t(key) : name;
}
