import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// MEH-2578 — the site chrome (header, bottom nav, footer, account sheet,
// dashboard footer, cookie banner) renders on every page, so an /en reader clicks it from
// anywhere. `next/link` does not add the locale prefix (`localePrefix:
// as-needed`), so a chrome link built with it drops /en and lands the reader
// on the Hebrew page. These files must take Link from `@/i18n/navigation`.
const CHROME = [
  "components/Header.jsx",
  "components/BottomNav.jsx",
  "components/Footer.jsx",
  "components/AccountSheet.jsx",
  "components/DashboardFooter.jsx",
  "components/CookieBanner.jsx",
];

const NEXT_LINK = /from\s+["']next\/link["']/;
const INTL_LINK = /import\s*\{[^}]*\bLink\b[^}]*\}\s*from\s+["']@\/i18n\/navigation["']/;
const NEXT_ROUTER = /import\s*\{[^}]*\buseRouter\b[^}]*\}\s*from\s+["']next\/navigation["']/;

describe("MEH-2578 chrome links keep the /en prefix", () => {
  for (const rel of CHROME) {
    // Read inside each case: a renamed file fails its own cases instead of
    // throwing at collection time with nothing reported.
    const src = () => readFileSync(join(__dirname, "..", rel), "utf8");
    it(`${rel} does not import next/link`, () => {
      expect(src()).not.toMatch(NEXT_LINK);
    });
    it(`${rel} imports Link from @/i18n/navigation`, () => {
      expect(src()).toMatch(INTL_LINK);
    });
    // A router.push("/x") from next/navigation drops /en the same way.
    it(`${rel} does not take useRouter from next/navigation`, () => {
      expect(src()).not.toMatch(NEXT_ROUTER);
    });
  }
});

// MEH-2579 — the same drop happens on every page link, not only the chrome:
// a card, a breadcrumb or a CTA built with next/link sends an /en reader to
// the Hebrew page. No file under app/ or components/ may import next/link;
// take Link from @/i18n/navigation. (Allowlist is empty on purpose — add a
// path here only with a reason next to it.)
describe("MEH-2579 no next/link anywhere in app/ or components/", () => {
  const { readdirSync, statSync } = require("node:fs");
  const ALLOW = new Set([]);
  const root = join(__dirname, "..");
  const walk = (dir) =>
    readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) return walk(p);
      return /\.(jsx?|tsx?)$/.test(name) ? [p] : [];
    });
  it("scans a real corpus (control: the six chrome files are in it)", () => {
    const files = [...walk(join(root, "app")), ...walk(join(root, "components"))];
    expect(files.length).toBeGreaterThan(200);
    for (const rel of CHROME) expect(files).toContain(join(root, rel));
  });
  it("no file imports next/link", () => {
    const files = [...walk(join(root, "app")), ...walk(join(root, "components"))];
    const offenders = files
      .filter((p) => !ALLOW.has(p.slice(root.length + 1)))
      .filter((p) => NEXT_LINK.test(readFileSync(p, "utf8")))
      .map((p) => p.slice(root.length + 1));
    expect(offenders).toEqual([]);
  });
});
