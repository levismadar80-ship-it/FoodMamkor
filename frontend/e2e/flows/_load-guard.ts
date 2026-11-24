/**
 * Module:   _load-guard
 * Purpose:  Fail any e2e/flows/** test whose page, while the test ran, threw an
 *           uncaught error, logged an application console.error, hit a React
 *           hydration mismatch, or shifted its layout by more than CLS 0.1.
 * Touches:  page.exposeBinding + page.addInitScript (a PerformanceObserver for
 *           `layout-shift`) and page.on("console" | "pageerror"). No app code.
 * Wired:    _cloudinary-stub.ts installs it on the shared `page` fixture, so
 *           every spec that imports `test` from there gets it.
 * Opt out:  `test.use({ loadGuard: "off" })` in a spec that provokes errors on
 *           purpose, with a comment saying why. Never to get a spec green.
 * History:  MEH-3809 — the footer flash of MEH-3800 passed the whole suite,
 *           because no check looked at the page while it was loading.
 *
 * ── WHAT EACH CHECK CAN AND CANNOT SEE ─────────────────────────────────────
 * - CLS: Chromium only. WebKit has no `layout-shift` entries, so on WebKit this
 *   check does not run — and says so (the `observer` counter below), instead of
 *   reporting 0. On Chromium, a page that navigated but never reported the
 *   observer as installed fails the test: a dead probe must not read as green.
 * - CLS is the web-vitals definition: the largest session window (shifts < 1 s
 *   apart, window ≤ 5 s), shifts within 500 ms of input excluded by the browser
 *   (`hadRecentInput`). Playwright clicks are real input events, so a panel a
 *   test opens is not counted. Same 0.1 limit as scripts/checks/lighthouserc.cjs.
 * - Hydration mismatches are never allowlisted (HYDRATION below).
 */
import type { Page, TestInfo } from "@playwright/test";

export type LoadGuardMode = "on" | "off";

export const CLS_LIMIT = 0.1;

/** React 18 production hydration errors (#418 text, #419 boundary, #421-#425
 *  mismatches) and their dev-build wording. Checked BEFORE the allowlist. */
const HYDRATION =
  /Minified React error #(418|419|421|422|423|425)\b|Hydration failed|did not match\. Server|Text content does not match server-rendered HTML|while hydrating/i;

/** `kind` defaults to "console". `browser` limits an entry to one engine. */
type Allow = { pattern: RegExp; reason: string; card: string; kind?: "console" | "pageerror"; browser?: string };

/** Console errors that are not application errors. Each entry: why, and the
 *  card that owns it. Widening one until it matches arbitrary text is caught
 *  by the self-test (00-load-guard-selftest.spec.ts, sentinel case). */
export const CONSOLE_ALLOW: readonly Allow[] = [
  {
    pattern: /^Failed to load resource: /,
    reason:
      "The browser's own network log for a non-2xx response. Many specs stub 4xx/5xx on purpose and assert the UI's handling; an error in our handling surfaces as pageerror or as our own console.error.",
    card: "MEH-3809",
  },
  {
    // WebKit: `Refused to execute <url> as script because …nosniff…`.
    // Chromium: `Refused to execute script from '<url>' because its MIME type …`.
    pattern: /^Refused to execute (?:script from ')?\S+\/_vercel\/(?:speed-insights|insights)\/script\.js(?:' because its MIME type| as script\b)/,
    reason:
      "CI runs E2E on a local `next start`, which has no Vercel edge, so /_vercel/speed-insights/script.js is a 404 that both engines refuse to run as script. On Vercel the script exists. Measured: PR #5280 first run — WebKit 49 of 84 guard failures, Chromium 1,395 of 1,632 tests (the same script, Chromium's wording).",
    card: "MEH-3809",
  },
  {
    pattern: /due to access control checks\.$/,
    kind: "pageerror",
    browser: "webkit",
    reason:
      "WebKit reports a fetch it cancelled because the page navigated away as 'Fetch API cannot load <url> due to access control checks'. It is the same text as a real CORS block, but Chromium runs every one of these tests and reports a real CORS block as 'blocked by CORS policy', which is not allowlisted. Measured: PR #5280 first WebKit run, same-origin /api/* reads cancelled by a click away.",
    card: "MEH-3809",
  },
];

type Shift = { doc: number; url: string; t: number; v: number; src: string };
type Ready = { doc: number; supported: boolean };

type LoadGuardState = {
  errors: string[];
  shifts: Shift[];
  ready: Ready[];
};

/** Install the probes on a page. Call before the first navigation. */
export async function installLoadGuard(page: Page): Promise<LoadGuardState> {
  const state: LoadGuardState = { errors: [], shifts: [], ready: [] };
  page.on("pageerror", (e) => state.errors.push(`pageerror: ${e?.message ?? String(e)}`));
  page.on("console", (m) => {
    if (m.type() === "error") state.errors.push(`console.error: ${m.text()}`);
  });
  await page.exposeBinding("__loadGuardShift", (_src, s: Shift) => {
    state.shifts.push(s);
  });
  await page.exposeBinding("__loadGuardReady", (_src, r: Ready) => {
    state.ready.push(r);
  });
  await page.addInitScript(() => {
    const w = window as unknown as {
      __loadGuardShift?: (s: unknown) => void;
      __loadGuardReady?: (r: unknown) => void;
    };
    if (window.top !== window) return; // main frame only
    const doc = performance.timeOrigin;
    const describe = (n: Node | null | undefined): string => {
      if (!n || n.nodeType !== 1) return "";
      const el = n as Element;
      const testid = el.getAttribute("data-testid");
      const cls = (el.getAttribute("class") || "").split(/\s+/).filter(Boolean).slice(0, 3).join(".");
      return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${testid ? `[data-testid=${testid}]` : ""}${cls ? "." + cls : ""}`;
    };
    let supported = false;
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as Array<{
          hadRecentInput: boolean;
          startTime: number;
          value: number;
          sources?: Array<{ node?: Node | null }>;
        }>) {
          if (e.hadRecentInput) continue;
          const src = (e.sources || []).map((s) => describe(s.node)).find(Boolean) || "";
          w.__loadGuardShift?.({ doc, url: location.pathname + location.search, t: e.startTime, v: e.value, src });
        }
      }).observe({ type: "layout-shift", buffered: true });
      supported = true;
    } catch {
      supported = false;
    }
    w.__loadGuardReady?.({ doc, supported });
  });
  return state;
}

/** web-vitals CLS: the largest session window of one document's shifts. */
function maxSessionCls(shifts: readonly Shift[]): { value: number; worst: Shift[] } {
  const sorted = [...shifts].sort((a, b) => a.t - b.t);
  let best = { value: 0, worst: [] as Shift[] };
  let cur: Shift[] = [];
  let sum = 0;
  for (const s of sorted) {
    const first = cur[0];
    const prev = cur[cur.length - 1];
    if (first && (s.t - prev.t > 1000 || s.t - first.t > 5000)) {
      cur = [];
      sum = 0;
    }
    cur.push(s);
    sum += s.v;
    if (sum > best.value) best = { value: sum, worst: [...cur] };
  }
  return best;
}

/** Every reason this test's pages fail the guard. Empty = clean. */
export function loadGuardFailures(
  state: LoadGuardState,
  opts: { browserName: string; navigated: boolean; allow?: readonly Allow[] },
): string[] {
  const allow = opts.allow ?? CONSOLE_ALLOW;
  const out: string[] = [];

  for (const e of state.errors) {
    const text = e.replace(/^(pageerror|console\.error): /, "");
    if (HYDRATION.test(text)) {
      out.push(`hydration mismatch — ${e}`);
      continue;
    }
    const kind = e.startsWith("pageerror: ") ? "pageerror" : "console";
    if (allow.some((a) => (a.kind ?? "console") === kind && (!a.browser || a.browser === opts.browserName) && a.pattern.test(text))) continue;
    out.push(e);
  }

  if (opts.browserName === "chromium" && opts.navigated) {
    if (!state.ready.some((r) => r.supported)) {
      out.push(
        "load guard: the layout-shift observer never reported as installed on Chromium — the CLS check did not run, so it cannot be read as green",
      );
    }
    const byDoc = new Map<number, Shift[]>();
    for (const s of state.shifts) byDoc.set(s.doc, [...(byDoc.get(s.doc) ?? []), s]);
    for (const list of byDoc.values()) {
      const { value, worst } = maxSessionCls(list);
      if (value > CLS_LIMIT) {
        const top = [...worst].sort((a, b) => b.v - a.v)[0];
        out.push(
          `layout shift: CLS ${value.toFixed(3)} > ${CLS_LIMIT} on ${top.url} — largest shift ${top.v.toFixed(3)} at ${Math.round(top.t)} ms, element ${top.src || "(unknown)"}`,
        );
      }
    }
  }
  return out;
}

/** Fixture teardown: fail a passing test whose pages broke the guard. */
export async function enforceLoadGuard(
  page: Page,
  state: LoadGuardState,
  testInfo: TestInfo,
  browserName: string,
): Promise<void> {
  const navigated = state.ready.length > 0 || !/^about:blank$/.test(page.url());
  const failures = loadGuardFailures(state, { browserName, navigated });
  if (failures.length === 0) return;
  await testInfo.attach("load-guard.json", {
    body: JSON.stringify({ failures, errors: state.errors, shifts: state.shifts }, null, 2),
    contentType: "application/json",
  });
  // A test that already failed keeps its own error as the headline.
  if (testInfo.status !== "passed") return;
  throw new Error(
    `Load guard (MEH-3809) — ${failures.length} problem(s) while this test's pages loaded:\n- ` +
      failures.join("\n- ") +
      "\nA real bug gets a card and a fix. Noise that is not an app error goes into CONSOLE_ALLOW in e2e/flows/_load-guard.ts with a reason and a card.",
  );
}
