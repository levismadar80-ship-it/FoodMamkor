/**
 * MEH-1701 self-QA — the mobile admin nav shows the same pending-queue badges
 * the desktop sidebar shows.
 *
 * Drives the REAL /he/admin/help page (any /admin/* route mounts the layout;
 * help needs the fewest fixtures) in Chromium against `next start`, with every
 * /api/** call fulfilled from fixtures (no backend in the CC sandbox).
 *
 * State matrix (labels.md 5-state rule, stated per the card):
 *   many  — mod=7, kashrut=3  -> two badges, both navs
 *   one   — mod=1, kashrut=1  -> two badges showing 1
 *   zero  — mod=0, kashrut=0  -> NO badge (and the nav itself is asserted
 *           present first, so the zero cannot also mean "page never rendered")
 *   denied — role!=admin      -> access-denied state, no admin nav at all
 *
 * Run:  node e2e/qa-meh1701-admin-mobile-badge.mjs [--before]
 * --before captures only the desktop-1440 many-state shot (for the
 * no-visual-change proof against the pre-change build).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-1701";
const BASE = "http://localhost:3100";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BEFORE_ONLY = process.argv.includes("--before");

const ADMIN = { id: 1, email: "admin@example.com", role: "admin", name: "ספיר" };
const NON_ADMIN = { id: 2, email: "user@example.com", role: "user", name: "רות" };

const STATES = [
  { key: "many", user: ADMIN, mod: 7, kashrut: 3, expectBadges: { "/admin": "7", "/admin/kashrut": "3" } },
  { key: "one", user: ADMIN, mod: 1, kashrut: 1, expectBadges: { "/admin": "1", "/admin/kashrut": "1" } },
  { key: "zero", user: ADMIN, mod: 0, kashrut: 0, expectBadges: {} },
  { key: "denied", user: NON_ADMIN, mod: 0, kashrut: 0, denied: true },
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  let failures = 0;
  const check = (ok, label) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failures += 1;
  };

  const viewports = BEFORE_ONLY
    ? [["1440", 1440, 1000]]
    : [["375", 375, 812], ["1440", 1440, 1000]];
  const states = BEFORE_ONLY ? [STATES[0]] : STATES;

  for (const [vpLabel, width, height] of viewports) {
    for (const state of states) {
      const ctx = await browser.newContext({
        viewport: { width, height },
        locale: "he-IL",
        timezoneId: "Asia/Jerusalem",
        reducedMotion: "reduce",
      });
      await ctx.route("**/*", async (route) => {
        const url = route.request().url();
        if (!url.includes("/api/")) return route.continue();
        const path = new URL(url).pathname.replace(/^\/api/, "");
        const body =
          path === "/auth/me" ? state.user
          : path === "/admin/dashboard"
            ? { stats: { pending_moderation_count: state.mod, pending_kashrut_requests: state.kashrut } }
          : {};
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      });

      const page = await ctx.newPage();
      const pageErrors = [];
      page.on("pageerror", (e) => pageErrors.push(String(e)));
      await page.addInitScript(() => localStorage.setItem("token", "qa-fixture-token"));
      await page.goto(`${BASE}/admin/help`, { waitUntil: "load" });
      // Bounded settle for the layout's own /admin/dashboard fetch to land.
      await page.waitForTimeout(1200);

      const name = BEFORE_ONLY ? `before-desktop-${state.key}` : `${state.key}-${vpLabel}`;

      if (state.denied) {
        const denied = await page.getByTestId("access-denied").count();
        check(denied === 1, `${name}: access-denied state renders`);
        const navs = await page.locator("aside.bg-primary-dark nav, div.bg-primary-dark.md\\:hidden nav").count();
        check(navs === 0, `${name}: no admin nav mounts for a non-admin`);
      } else {
        // CONTROL first: the nav must exist before any badge count is read —
        // a dead page would otherwise report the reassuring zero.
        const mobileNav = page.locator("div.bg-primary-dark.md\\:hidden nav");
        const desktopNav = page.locator("aside.bg-primary-dark nav");
        check((await mobileNav.count()) === 1, `${name}: mobile nav present (control)`);
        check((await desktopNav.count()) === 1, `${name}: desktop nav present (control)`);

        for (const nav of [
          { loc: mobileNav, label: "mobile" },
          { loc: desktopNav, label: "desktop" },
        ]) {
          const badges = nav.loc.locator("span.bg-yellow-400");
          const texts = await badges.allTextContents();
          const expected = Object.values(state.expectBadges);
          // In --before mode the mobile badge is EXPECTED to be missing (that
          // is the bug being fixed) — the capture is the deliverable, not the
          // assertion. Log observed state instead of asserting it.
          if (BEFORE_ONLY) {
            console.log(`INFO  ${name} ${nav.label}: badges [${texts}] (pre-change build)`);
            continue;
          }
          check(
            texts.length === expected.length && expected.every((v) => texts.includes(v)),
            `${name} ${nav.label}: badges [${texts}] == expected [${expected}]`,
          );
          if (expected.length && (await badges.count()) > 0) {
            const aria = await badges.first().getAttribute("aria-label");
            check(!!aria && aria.length > 0, `${name} ${nav.label}: badge carries aria-label ("${aria}")`);
          }
        }
      }

      check(pageErrors.length === 0, `${name}: 0 page errors (got ${pageErrors.length})`);
      await page.screenshot({ path: `${OUT}/${name}.png` });
      await ctx.close();
    }
  }

  await browser.close();
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("HARNESS ERROR (every result above/below is void):", e);
  process.exit(2);
});
