/**
 * Module:   _cloudinary-stub
 * Purpose:  Stub Cloudinary image delivery for every e2e/flows/** spec, so the
 *           suite stops billing real Cloudinary bandwidth on every CI run.
 * Touches:  page.route() on the Playwright `page` fixture — no DOM, no app code.
 * Does NOT: touch e2e/visual/** (VRT needs real image bytes to compare pixels)
 *           and does NOT assert anything — specs keep their own assertions.
 * Related:  frontend/playwright.config.ts:35 (testMatch — the flows-vs-visual
 *           seam this file is scoped to by import, not by config) ·
 *           frontend/next.config.js (images.remotePatterns: res.cloudinary.com) ·
 *           frontend/lib/cloudinary.js (optimizeCloudinary — every Cloudinary
 *           URL in the app is built here) · frontend/components/ImageWithFallback.jsx
 *           (the shared next/image wrapper most producer/product imagery goes
 *           through) · frontend/e2e/CLAUDE.md (MEH-1968 stub-vs-mock taxonomy)
 * History:  MEH-1925 (creation, bandwidth-cut chunk).
 *
 * ── WHY TWO INTERCEPTION TARGETS, NOT ONE ───────────────────────────────────
 * A naive `page.route("**\/res.cloudinary.com/**", ...)` only catches requests
 * the BROWSER issues directly to Cloudinary — a CSS `background-image` (e.g.
 * HomeHero.jsx) or a plain `<img src="https://res.cloudinary.com/...">`.
 *
 * Most producer/product imagery goes through `next/image` (ImageWithFallback.jsx
 * wraps it, used by 12 files). `next.config.js` lists `res.cloudinary.com` under
 * `images.remotePatterns`, so `next/image` does NOT let the browser fetch
 * Cloudinary directly — the browser requests `/_next/image?url=<encoded>&w=..&q=..`
 * from the NEXT.JS SERVER, and the server fetches the real image from Cloudinary.
 * That server-side fetch is invisible to `page.route()`, which only sees
 * browser-issued requests. Stubbing only `res.cloudinary.com` therefore misses
 * the majority of the bandwidth this ticket exists to cut.
 *
 * The second route intercepts `/_next/image` itself, parses its own `url` query
 * param, and only stubs when THAT param points at `res.cloudinary.com` —
 * `images.unsplash.com` requests (also proxied through `/_next/image`) fall
 * through untouched via `route.continue()`, so unrelated imagery still renders
 * for real and unrelated network behaviour is not touched.
 *
 * ── WHY THIS IS A STUB, NOT A MOCK (MEH-1968) ───────────────────────────────
 * Per the taxonomy ratified in `e2e/CLAUDE.md`: a MOCK hides a network call the
 * spec's subject depends on; a STUB removes an incidental, unrelated one. Zero
 * flow specs assert on image bytes, `naturalWidth`/`naturalHeight`,
 * `toHaveScreenshot`, or a rendered `src` attribute (grepped across all 36
 * specs before writing this file) — image delivery is orthogonal to what these
 * specs check. That means this needs no justification against the three-
 * condition mock exception; it doesn't reach that clause at all.
 *
 * ── THE TWO MEASUREMENT KNOBS, AND WHY THEY ARE COMMITTED ───────────────────
 * The headline claim of this change is a request-count delta. A claim nobody
 * can re-derive is not evidence, so the instrument that produced it ships with
 * the fix rather than being a throwaway local edit:
 *
 *   E2E_CLOUDINARY_STUB=0   count but DON'T stub — `route.continue()` on every
 *                           match, which is behaviourally the pre-change suite.
 *                           This is the BASELINE arm.
 *   E2E_CLOUDINARY_COUNT=<path>  append `kind<TAB>disposition<TAB>url` per
 *                           matched request. `disposition=pass` means it
 *                           reached Cloudinary; `stub` means it did not.
 *
 * Neither is set in CI, so the committed default is "stub, don't count".
 *
 * The baseline arm doubles as this probe's CONTROL, which matters because a
 * counter that reports `0` after the fix is reporting exactly the reassuring
 * answer a completely dead counter would report (`.claude/rules/testing.md` —
 * "a probe whose null output is also its reassuring output is not evidence").
 * Run the baseline arm FIRST: if it does not produce a large non-zero count,
 * the counter is not wired and the post-fix `0` is worth nothing.
 */
import { appendFileSync } from "node:fs";
import { test as base, expect, type Page, type Route } from "@playwright/test";

const STUB_ENABLED = process.env.E2E_CLOUDINARY_STUB !== "0";
const COUNT_FILE = process.env.E2E_CLOUDINARY_COUNT || "";

// `disposition` is the load-bearing column: `pass` means the request was let
// through and DID reach Cloudinary; `stub` means it was fulfilled locally and
// did not. Counting matches alone would report nearly the same total in both
// arms — the fixture sees the same requests either way — and would read as "the
// fix did nothing." What changes is where they terminate, so that is what the
// instrument records.
function record(kind: "direct" | "next-image", disposition: "pass" | "stub", url: string): void {
  if (!COUNT_FILE) return;
  appendFileSync(COUNT_FILE, `${kind}\t${disposition}\t${url}\n`);
}

// 1x1 transparent PNG, inlined so this file has zero disk I/O and no extra
// fixture asset to keep in sync.
const PLACEHOLDER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function fulfillPlaceholder(route: Route): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: "image/png",
    body: PLACEHOLDER_PNG,
  });
}

// `page` is deliberately NOT declared in the extend generic: an empty generic is
// how Playwright is told this OVERRIDES the built-in fixture rather than
// declaring a new one that shadows it.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route("**/res.cloudinary.com/**", async (route) => {
      record("direct", STUB_ENABLED ? "stub" : "pass", route.request().url());
      if (STUB_ENABLED) await fulfillPlaceholder(route);
      else await route.continue();
    });
    await page.route("**/_next/image**", async (route) => {
      const target = new URL(route.request().url()).searchParams.get("url") || "";
      if (!target.includes("res.cloudinary.com")) {
        // Unsplash and any other remotePattern host — untouched, always real.
        await route.continue();
        return;
      }
      record("next-image", STUB_ENABLED ? "stub" : "pass", target);
      if (STUB_ENABLED) await fulfillPlaceholder(route);
      else await route.continue();
    });
    await use(page);
  },
});

export { expect };
export type { Page };
