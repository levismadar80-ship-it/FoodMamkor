/**
 * Module:   css-url
 * Purpose:  A quoted, escaped CSS `url()` for an inline background-image. The
 *           picture can be an owner-supplied URL; a `)`, quote or space in it
 *           must not end the declaration (reviews #3811, #3815).
 *           Control characters are dropped first: JSON.stringify writes them
 *           as `\n`-style escapes, which CSS does not read back.
 * Touches:  Nothing — a pure string helper.
 */
const CONTROL = /[\u0000-\u001F\u007F]/g;
export const cssUrl = (src) => `url(${JSON.stringify(String(src).replaceAll(CONTROL, ""))})`;
