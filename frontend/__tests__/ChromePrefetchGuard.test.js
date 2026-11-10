/**
 * MEH-2850 — the site chrome must not prefetch static pages in full.
 *
 * Header, BottomNav and the cookie banner are on screen on every page. After
 * #4260 their targets (/, /about, /privacy, /login, /register) are static, and
 * Next prefetches a static <Link> target IN FULL on viewport entry: its page
 * JS + the shared [locale] layout payload. Measured 10/11 (local next start,
 * 390px): +121 KB JS after load on /map, +137 KB on /events; blocking only the
 * `/` and `/about` prefetches restored the pre-#4260 bytes exactly.
 *
 * A source scan, not a render: a <Link> added to these files without
 * prefetch={false} brings the regression back, and nothing else would notice.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const FILES = [
  "components/Header.jsx",
  "components/BottomNav.jsx",
  "components/CookieBanner.jsx",
  "components/Footer.jsx",
  // Rendered inside the chrome: the footer's newsletter notice (→ /privacy)
  // and the dashboard/admin footer (→ /terms, /privacy, /accessibility,
  // /contact) — fresh reviewer on #4281.
  "components/CollectionNotice.jsx",
  "components/DashboardFooter.jsx",
];

/** Every `<Link ...>` opening tag in a file, as source text. */
export function linkTags(src) {
  const tags = [];
  const re = /<Link(\s|>)/g;
  let m;
  while ((m = re.exec(src))) {
    let depth = 0;
    let i = m.index;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    tags.push(src.slice(m.index, i + 1));
  }
  return tags;
}

/** `prefetch={false}` as its own prop — not `data-prefetch={false}`. */
const PREFETCH_OFF = /(?<![-\w])prefetch=\{\s*false\s*\}/;

describe("linkTags (self-test, MEH-1909)", () => {
  it("PREFETCH_OFF accepts the prop and rejects a lookalike", () => {
    expect(PREFETCH_OFF.test("<Link prefetch={false} href=\"/\">")).toBe(true);
    expect(PREFETCH_OFF.test("<Link prefetch={ false } href=\"/\">")).toBe(true);
    expect(PREFETCH_OFF.test("<Link data-prefetch={false} href=\"/\">")).toBe(false);
  });

  it("finds a multi-line tag and stops at the right `>`", () => {
    const src = '<Link\n  href="/"\n  onClick={() => a > b}\n>x</Link><Link prefetch={false} href="/a">y</Link>';
    const tags = linkTags(src);
    expect(tags).toHaveLength(2);
    expect(tags[0]).toContain("onClick={() => a > b}");
    expect(tags[0]).not.toContain("prefetch");
    expect(tags[1]).toContain("prefetch={false}");
  });
});

describe("site chrome links do not prefetch (MEH-2850)", () => {
  for (const rel of FILES) {
    it(`${rel}: every <Link> carries prefetch={false}`, () => {
      const src = readFileSync(path.resolve(__dirname, "..", rel), "utf8");
      const tags = linkTags(src);
      expect(tags.length, `${rel} has no <Link> — the scan read the wrong file`).toBeGreaterThan(0);
      const missing = tags.filter((t) => !PREFETCH_OFF.test(t));
      expect(missing, `add prefetch={false} to: ${missing.join(" | ")}`).toEqual([]);
    });
  }
});
