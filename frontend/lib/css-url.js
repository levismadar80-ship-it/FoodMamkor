/**
 * Module:   css-url
 * Purpose:  A quoted, escaped CSS `url()` for an inline background-image. The
 *           picture can be an owner-supplied URL; a `)`, quote or space in it
 *           must not end the declaration (reviews #3811, #3815).
 * Touches:  Nothing — a pure string helper.
 */
export const cssUrl = (src) => `url(${JSON.stringify(String(src))})`;
