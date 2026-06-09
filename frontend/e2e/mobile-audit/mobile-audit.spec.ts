/**
 * MEH-233 — Mobile responsiveness audit (Audit 7/7). AUDIT-ONLY — captures
 * screenshots + structured findings; makes ZERO layout fixes.
 *
 * For each route × the active viewport (project) this:
 *   1. blocks external font/image/media hosts (sandbox can't reach them and
 *      they hang the page),
 *   2. navigates + lets layout settle,
 *   3. writes a full-page screenshot to ../docs/audits/screenshots/MEH-233/,
 *   4. runs the 7 Phase-C checks in-page and records findings.
 *
 * Findings per viewport are written to
 * ../docs/audits/MEH-233-findings__<project>.json; a separate node step
 * (scripts/build-mobile-audit-report.mjs) merges them into the markdown report.
 *
 * NOTE: this run targets a LOCAL frontend build with NO backend, so API-driven
 * content (producer lists, /producer/[id], /events, /favorites) renders as
 * loading/empty/error states. Structural checks (overflow, nav, header/footer,
 * tap targets, modals) are still valid; content-density overflow is a KNOWN
 * blind spot recorded in the report.
 */
import { test, expect, Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const SHOT_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "docs",
  "audits",
  "screenshots",
  "MEH-233"
);
const OUT_DIR = path.resolve(__dirname, "..", "..", "..", "docs", "audits");

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
type Finding = {
  route: string;
  viewport: string;
  check: number;
  checkName: string;
  severity: Severity;
  detail: string;
  screenshot: string;
};

// Phase B routes — every path verified to exist in frontend/app/[locale]/ in
// Phase A. he is the default locale (localePrefix "as-needed") → no /he prefix.
// /producer/[id] uses a placeholder id (no backend → expected empty/not-found).
const ROUTES: { path: string; slug: string; note?: string }[] = [
  { path: "/", slug: "home" },
  { path: "/map", slug: "map" },
  { path: "/login", slug: "login" },
  { path: "/register", slug: "register" },
  { path: "/register/producer", slug: "register-producer" },
  { path: "/producer/1", slug: "producer-detail", note: "placeholder id, no backend" },
  { path: "/favorites", slug: "favorites" },
  { path: "/settings", slug: "settings" },
  { path: "/admin", slug: "admin", note: "best-effort, no admin login" },
  { path: "/events", slug: "events" },
  { path: "/about", slug: "about" },
];

const findings: Finding[] = [];

test.beforeAll(() => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
});

test.afterAll(() => {
  const project = test.info().project.name;
  const file = path.join(OUT_DIR, `MEH-233-findings__${project}.json`);
  fs.writeFileSync(file, JSON.stringify(findings, null, 2));
  // eslint-disable-next-line no-console
  console.log(`\n=== ${findings.length} findings (${project}) → ${file} ===`);
});

async function blockExternal(page: Page) {
  // Sandbox cannot reach external CDNs (fonts, Cloudinary, Unsplash, Google
  // Maps/GSI). Abort them so the page doesn't hang on the network.
  await page.route("**/*", (route) => {
    const url = route.request().url();
    const isLocal = url.includes("localhost:3000") || url.startsWith("data:") || url.startsWith("blob:");
    if (isLocal) return route.continue();
    const type = route.request().resourceType();
    if (["image", "font", "media", "stylesheet"].includes(type)) return route.abort();
    // Allow other cross-origin (rare) to fail fast rather than hang.
    return route.abort();
  });
}

// The 7 Phase-C checks, evaluated in-page. Returns raw finding payloads.
async function runChecks(page: Page, viewportName: string) {
  return page.evaluate((vp) => {
    const out: { check: number; checkName: string; severity: string; detail: string }[] = [];
    const W = window.innerWidth;
    const H = window.innerHeight;

    const isVisible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return (
        r.width > 0 &&
        r.height > 0 &&
        s.visibility !== "hidden" &&
        s.display !== "none" &&
        s.opacity !== "0"
      );
    };
    // Visually-hidden helpers (sr-only skip links, screen-reader text) collapse
    // to ~1px or use clip/clip-path; they are a11y affordances, not real tap
    // targets — exclude from the < 44px count to avoid noise.
    const isScreenReaderOnly = (el: Element) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const clipped = s.clip === "rect(0px, 0px, 0px, 0px)" || /inset\(50%\)|circle\(0/.test(s.clipPath);
      const tiny = r.width <= 2 && r.height <= 2;
      const cls = typeof (el as HTMLElement).className === "string" ? (el as HTMLElement).className : "";
      return clipped || tiny || /\bsr-only\b/.test(cls);
    };
    // Leaflet map panes are intentionally larger than their clipping container
    // (tiles extend past the viewport by design) — not a layout defect.
    const isLeaflet = (el: Element) =>
      !!el.closest(".leaflet-container,.leaflet-pane,.leaflet-map-pane") ||
      (typeof (el as HTMLElement).className === "string" &&
        /\bleaflet-/.test((el as HTMLElement).className));
    const desc = (el: Element) => {
      const tag = el.tagName.toLowerCase();
      const id = (el as HTMLElement).id ? `#${(el as HTMLElement).id}` : "";
      const cls =
        typeof (el as HTMLElement).className === "string" && (el as HTMLElement).className
          ? "." + (el as HTMLElement).className.trim().split(/\s+/).slice(0, 2).join(".")
          : "";
      const txt = (el.textContent || "").trim().slice(0, 30);
      return `${tag}${id}${cls}${txt ? ` "${txt}"` : ""}`;
    };

    // CHECK 1 — horizontal overflow (body.scrollWidth > viewport). CRITICAL.
    const docW = Math.max(
      document.documentElement.scrollWidth,
      document.body ? document.body.scrollWidth : 0
    );
    if (docW > W + 1) {
      // Find the widest offending elements that push past the viewport.
      const offenders: string[] = [];
      document.querySelectorAll("*").forEach((el) => {
        if (offenders.length >= 3) return;
        const r = el.getBoundingClientRect();
        if (r.right > W + 2 && r.width > 8 && isVisible(el)) {
          offenders.push(`${desc(el)} (right=${Math.round(r.right)})`);
        }
      });
      out.push({
        check: 1,
        checkName: "Horizontal overflow",
        severity: "CRITICAL",
        detail: `scrollWidth ${docW}px > viewport ${W}px (overflow ${docW - W}px). Offenders: ${offenders.join(" | ") || "n/a"}`,
      });
    }

    // CHECK 2 — text ending "..." that is NOT a CSS ellipsis. HIGH.
    // CSS text-overflow:ellipsis is intentional and acceptable; a literal
    // trailing "..."/"…" in content without ellipsis styling is suspect.
    const ellipsisHits: string[] = [];
    document.querySelectorAll("p,span,a,h1,h2,h3,h4,h5,h6,li,button,div,small").forEach((el) => {
      if (ellipsisHits.length >= 5) return;
      if (el.children.length > 0) return; // leaf text only
      const t = (el.textContent || "").trim();
      if (!/(\.\.\.|…)$/.test(t)) return;
      const s = getComputedStyle(el);
      const cssEllipsis = s.textOverflow === "ellipsis" || s.webkitLineClamp !== "none";
      if (!cssEllipsis && isVisible(el)) {
        ellipsisHits.push(`${desc(el)}`);
      }
    });
    if (ellipsisHits.length) {
      out.push({
        check: 2,
        checkName: "Unintentional truncation",
        severity: "HIGH",
        detail: `${ellipsisHits.length} element(s) end with literal "..." without CSS ellipsis: ${ellipsisHits.join(" | ")}`,
      });
    }

    // CHECK 3 — tap target < 44×44px on interactive elements. HIGH.
    const small: string[] = [];
    let smallCount = 0;
    const interactive = document.querySelectorAll(
      'a,button,input,select,textarea,[role="button"],[role="link"],[role="tab"],[onclick]'
    );
    interactive.forEach((el) => {
      if (!isVisible(el)) return;
      if (isScreenReaderOnly(el)) return;
      const r = el.getBoundingClientRect();
      // Ignore hidden inputs / off-screen.
      if (r.width < 44 || r.height < 44) {
        smallCount++;
        if (small.length < 6) small.push(`${desc(el)} (${Math.round(r.width)}×${Math.round(r.height)})`);
      }
    });
    if (smallCount > 0) {
      out.push({
        check: 3,
        checkName: "Tap target < 44px",
        severity: "HIGH",
        detail: `${smallCount} interactive element(s) below 44×44px. Samples: ${small.join(" | ")}`,
      });
    }

    // CHECK 4 — element clipped by overflow:hidden (content cut off). CRITICAL.
    const clipped: string[] = [];
    document.querySelectorAll("*").forEach((el) => {
      if (clipped.length >= 4) return;
      const s = getComputedStyle(el);
      const clipsX = s.overflowX === "hidden" || s.overflow === "hidden";
      if (!clipsX) return;
      if (isLeaflet(el)) return; // intentional map-pane bleed, not a defect
      // content meaningfully wider than the clipping box → horizontally cut.
      if (el.scrollWidth > el.clientWidth + 8 && el.clientWidth > 40 && isVisible(el)) {
        clipped.push(`${desc(el)} (content ${el.scrollWidth}px > box ${el.clientWidth}px)`);
      }
    });
    if (clipped.length) {
      out.push({
        check: 4,
        checkName: "Clipped by overflow:hidden",
        severity: "CRITICAL",
        detail: `${clipped.length} element(s) clip horizontal content: ${clipped.join(" | ")}`,
      });
    }

    // CHECK 5 — open modal/dialog doesn't fit viewport. CRITICAL.
    const dialogs = document.querySelectorAll('[role="dialog"],[aria-modal="true"],dialog[open]');
    dialogs.forEach((el) => {
      if (!isVisible(el)) return;
      const r = el.getBoundingClientRect();
      const overflowsRight = r.right > W + 2 || r.left < -2;
      const overflowsBottom = r.height > H + 2 && r.top < 0 && r.bottom > H;
      if (overflowsRight || r.width > W + 2 || overflowsBottom) {
        out.push({
          check: 5,
          checkName: "Modal exceeds viewport",
          severity: "CRITICAL",
          detail: `${desc(el)} rect ${Math.round(r.width)}×${Math.round(r.height)} at (${Math.round(r.left)},${Math.round(r.top)}) vs viewport ${W}×${H}`,
        });
      }
    });

    // CHECK 6 — fixed/sticky header or footer overlaps body content. HIGH.
    const bars = Array.from(
      document.querySelectorAll('header,footer,[role="banner"],[role="contentinfo"]')
    ).filter((el) => {
      const s = getComputedStyle(el);
      return (s.position === "fixed" || s.position === "sticky") && isVisible(el);
    });
    const main = document.querySelector("main");
    if (main && bars.length) {
      const mr = main.getBoundingClientRect();
      bars.forEach((bar) => {
        const br = bar.getBoundingClientRect();
        // Does the bar's band vertically intersect main's content band, AND
        // is main content actually painted under it (top above bar bottom)?
        const overlap = Math.min(br.bottom, mr.bottom) - Math.max(br.top, mr.top);
        const coversTop = br.top <= mr.top + 1 && br.bottom > mr.top + 4;
        const coversBottom = br.bottom >= mr.bottom - 1 && br.top < mr.bottom - 4;
        if (overlap > 6 && (coversTop || coversBottom)) {
          out.push({
            check: 6,
            checkName: "Header/footer overlaps body",
            severity: "HIGH",
            detail: `${desc(bar)} (band ${Math.round(br.top)}–${Math.round(br.bottom)}) overlaps <main> band ${Math.round(mr.top)}–${Math.round(mr.bottom)} by ${Math.round(overlap)}px`,
          });
        }
      });
    }

    // CHECK 7 — bottom nav / tab bar cut off (extends beyond viewport). CRITICAL.
    const navs = document.querySelectorAll('nav[aria-label]');
    navs.forEach((el) => {
      if (!isVisible(el)) return;
      const s = getComputedStyle(el);
      if (s.position !== "fixed" && s.position !== "sticky") return;
      const r = el.getBoundingClientRect();
      const cutRight = r.right > W + 2;
      const cutLeft = r.left < -2;
      const cutBottom = r.bottom > H + 2;
      // Also check the nav's own horizontal content overflow (items clipped).
      const itemsOverflow = (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth + 4;
      if (cutRight || cutLeft || cutBottom || itemsOverflow) {
        out.push({
          check: 7,
          checkName: "Nav/tab bar cut off",
          severity: "CRITICAL",
          detail: `${desc(el)} rect (${Math.round(r.left)},${Math.round(r.top)})–(${Math.round(r.right)},${Math.round(r.bottom)}) vs viewport ${W}×${H}${itemsOverflow ? " | items overflow horizontally" : ""}`,
        });
      }
    });

    return { docW, W, H, viewport: vp, out };
  }, viewportName);
}

for (const route of ROUTES) {
  test(`audit ${route.path}`, async ({ page }, testInfo) => {
    const viewport = testInfo.project.name;
    await blockExternal(page);

    const resp = await page
      .goto(route.path, { waitUntil: "domcontentloaded" })
      .catch(() => null);
    const status = resp ? resp.status() : 0;

    // Let client components hydrate + layout settle.
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.scrollTo(0, 0));

    const shotName = `${route.slug}__${viewport}.png`;
    await page
      .screenshot({ path: path.join(SHOT_DIR, shotName), fullPage: true })
      .catch(() => {});

    const result = await runChecks(page, viewport);
    for (const f of result.out) {
      findings.push({
        route: route.path,
        viewport,
        check: f.check,
        checkName: f.checkName,
        severity: f.severity as Severity,
        detail: f.detail,
        screenshot: shotName,
      });
    }

    // Record an info row when the route returned non-200 (audit context, not a
    // layout failure — keeps the report honest about which surfaces were real).
    if (status !== 200) {
      findings.push({
        route: route.path,
        viewport,
        check: 0,
        checkName: "Route status",
        severity: "LOW",
        detail: `HTTP ${status}${route.note ? ` (${route.note})` : ""}`,
        screenshot: shotName,
      });
    }

    // AUDIT-ONLY: never fail the test on findings — we always want the run to
    // complete and emit every screenshot. expect is a smoke guard only.
    expect(result.W).toBeGreaterThan(0);
  });
}
