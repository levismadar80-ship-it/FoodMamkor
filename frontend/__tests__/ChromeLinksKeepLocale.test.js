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
    const src = readFileSync(join(__dirname, "..", rel), "utf8");
    it(`${rel} does not import next/link`, () => {
      expect(src).not.toMatch(NEXT_LINK);
    });
    it(`${rel} imports Link from @/i18n/navigation`, () => {
      expect(src).toMatch(INTL_LINK);
    });
    // A router.push("/x") from next/navigation drops /en the same way.
    it(`${rel} does not take useRouter from next/navigation`, () => {
      expect(src).not.toMatch(NEXT_ROUTER);
    });
  }
});
