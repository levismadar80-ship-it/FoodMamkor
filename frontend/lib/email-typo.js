// @ts-check

/**
 * Module:   email-typo
 * Purpose:  Suggest a fix for a mistyped email DOMAIN (gmial.com → gmail.com,
 *           gmail.con → gmail.com, walla.co.ill → walla.co.il) — the mailcheck
 *           pattern (MEH-3123, Sapir 14/11). Suggest only, never block.
 * Rules:    only a domain within edit distance 2 of a well-known mail domain
 *           (1 for short ones), or a known-bad ending; a domain that is itself
 *           well-known, or anything else (a business's own domain), gets null.
 * Related:  components/EmailTypoHint.jsx (the only UI caller).
 * History:  MEH-3123 (creation).
 */

// Common personal-mail domains in Israel. Numbered ISP domains (012/013/014…)
// are left out on purpose: they sit one edit apart from each other.
const KNOWN = [
  "gmail.com",
  "walla.co.il",
  "walla.com",
  "hotmail.com",
  "hotmail.co.il",
  "yahoo.com",
  "outlook.com",
  "icloud.com",
  "live.com",
  "me.com",
  "bezeqint.net",
  "netvision.net.il",
];

// Endings that are never right, and what they meant.
const BAD_ENDINGS = [
  [".con", ".com"],
  [".cmo", ".com"],
  [".ocm", ".com"],
  [".vom", ".com"],
  [".xom", ".com"],
  [".comm", ".com"],
  [".co.ill", ".co.il"],
  [".co.ik", ".co.il"],
  [".co.il.", ".co.il"],
  [".coil", ".co.il"],
];

/** Optimal-string-alignment distance (a swap counts as one edit). */
function distance(a, b) {
  /** @type {number[][]} */
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** The nearest well-known domain within the allowed distance, else null. */
function nearestKnown(domain) {
  let best = null;
  let bestDist = Infinity;
  for (const known of KNOWN) {
    const dist = distance(domain, known);
    if (dist < bestDist) {
      best = known;
      bestDist = dist;
    }
  }
  if (!best) return null;
  // Short names (me.com) sit one edit from real, unrelated domains.
  const limit = best.length >= 9 ? 2 : best.length >= 8 ? 1 : 0;
  return bestDist > 0 && bestDist <= limit ? best : null;
}

/**
 * @param {string} email
 * @returns {string | null} the corrected address, or null when there is
 *   nothing to suggest.
 */
export function suggestEmail(email) {
  const value = String(email ?? "").trim();
  const at = value.lastIndexOf("@");
  if (at < 1 || at === value.length - 1) return null;
  const local = value.slice(0, at);
  let domain = value.slice(at + 1).toLowerCase();
  if (!domain.includes(".") && !domain.endsWith("coil")) return null;
  if (KNOWN.includes(domain)) return null;
  for (const [bad, good] of BAD_ENDINGS) {
    if (domain.endsWith(bad)) {
      domain = domain.slice(0, -bad.length) + good;
      break;
    }
  }
  const fixed = KNOWN.includes(domain) ? domain : nearestKnown(domain) ?? domain;
  const suggestion = `${local}@${fixed}`;
  return suggestion.toLowerCase() === value.toLowerCase() ? null : suggestion;
}
