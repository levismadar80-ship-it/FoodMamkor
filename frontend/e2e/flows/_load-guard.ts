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
 *           purpose; `"errors"` keeps the error checks and drops CLS, for a spec
 *           that moves the layout itself (resizes text, synthetic clicks). Both
 *           with a comment saying why. Never to get a spec green.
 * Known:    KNOWN_CLS lists pages that already shift, one card each. It only
 *           shrinks: a fix removes its row. A listed page still fails above its
 *           ceiling, and every page not listed fails at 0.1.
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
 * - Blind spot on the `mobile` project: Chromium's phone emulation (isMobile)
 *   marks every shift in roughly the first 0.5–0.7 s after a navigation as
 *   `hadRecentInput`, with no input sent (measured 25/11: a block at 300 or
 *   500 ms → flagged, at 700 ms or later → counted; desktop counts all three).
 *   So a shift that early is seen on desktop only. The self-test's late block
 *   lands at 1 s for that reason.
 * - Hydration mismatches are never allowlisted (HYDRATION below).
 */
import type { Page, TestInfo } from "@playwright/test";

export type LoadGuardMode = "on" | "errors" | "off";

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
    pattern: /^\[GSI_LOGGER\]: The given origin is not allowed for the given client ID\.$/,
    reason:
      "CI builds with the real Google client id but serves the app from http://localhost:3000, which is not an authorised JavaScript origin of that client, so Google's own script logs this on every page with a sign-in button. On the real origins it does not appear. Measured: PR #5280 second run, 82 guard failures.",
    card: "MEH-3809",
  },
  {
    pattern: /^Access to XMLHttpRequest at 'https:\/\/(?:accounts\.google\.com\/gsi\/|ssl\.gstatic\.com\/_\/gsi\/)\S*' from origin 'http:\/\/localhost:\d+' has been blocked by CORS policy/,
    reason:
      "The same unauthorised localhost origin, seen from Google's sign-in script's own requests to its servers. Limited to Google's GSI paths and to a localhost origin, so a CORS block on our API or on a real origin still fails. Measured: PR #5280 second run, 5 guard failures.",
    card: "MEH-3809",
  },
  {
    pattern: /^Loading the image 'https:\/\/bread\.jpg\/' violates the following Content Security Policy directive/,
    reason:
      "A fixture, not a bug: admin-producers-queue.spec.ts gives a business the image URL https://bread.jpg on purpose to show the «תמונה שבורה» marker, and CSP refuses it. Only that one fake host is allowed; a CSP refusal of any other image still fails.",
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

type KnownCls = { path: RegExp; ceiling: number; reason: string; card: string };

/** Pages that already shift above CLS_LIMIT, measured on PR #5280's E2E runs
 *  and the first staging runs after it (Chromium, desktop + mobile). `path` is matched against the pathname with
 *  no locale prefix and no query. `ceiling` is 1.5 × the largest value seen,
 *  so a page that gets worse still fails. Remove a row when its card is fixed;
 *  never add one to get a new shift green — a new shift gets a fix. */
export const KNOWN_CLS: readonly KnownCls[] = [
  {
    // MEH-3817: #5292 fixed the dashboard home; the edit groups are still open
    // on the card. The other rows (MEH-3818 admin #5302, MEH-3819 business
    // page #5294, MEH-3820 map #5301, MEH-3821 home with a city #5298) were
    // removed when their fixes merged.
    path: /^\/producer\/dashboard\/edit$/,
    ceiling: 1.5,
    reason: "Owner dashboard edit groups: late cards push the page down (largest 0.981, mobile, measured before #5292).",
    card: "MEH-3817",
  },
  {
    // MEH-3870: measured on #5280's run at 6f45c4c (mobile, both tries); not
    // reproduced on the preview with a real admin login, so not yet fixed.
    path: /^\/admin\/outreach$/,
    ceiling: 0.16,
    reason: "Admin outreach, mobile: the admin tab strip moves once at ~0.7 s (largest 0.107, mobile, PR #5280 head 6f45c4c).",
    card: "MEH-3870",
  },
  {
    // MEH-3875: staging f08f421 (run 45701938236), desktop, hard fail on both tries.
    path: /^\/admin\/users$/,
    ceiling: 0.18,
    reason: "Admin users: the dashboard footer moves at ~1.8 s (largest 0.122, desktop, staging f08f421).",
    card: "MEH-3875",
  },
  {
    // MEH-3872: PR #5280 head a7e7572, mobile, flaky.
    path: /^\/admin\/producers\/[^/]+\/edit$/,
    ceiling: 0.23,
    reason: "Admin business edit: the form moves once at ~0.6 s (largest 0.151, mobile, PR #5280).",
    card: "MEH-3872",
  },
  {
    // MEH-3871: a late block above the delivery / reviews section. Only the
    // pages measured are listed; any other business page still fails at 0.1.
    path: /^\/ruach-hasadeh$/,
    ceiling: 0.86,
    reason: "Business page: a late block pushes the delivery or reviews section down (largest 0.571, mobile, PR #5280 2e5e78a).",
    card: "MEH-3871",
  },
  {
    // MEH-3871: same family, section#section-bio (staging f08f421, mobile).
    path: /^\/(beit-habad-sivan|sdot-zahav)$/,
    ceiling: 0.16,
    reason: "Business page: a late block pushes the bio section down (largest 0.101, mobile, staging f08f421).",
    card: "MEH-3871",
  },
  {
    // MEH-3871: the business page by id (the owner's preview link). Same late
    // block above the reviews section (staging 2b777a0, mobile, flaky).
    path: /^\/producer\/(?!dashboard$|new$)[^/]+$/,
    ceiling: 0.88,
    reason: "Business page by id (?preview=1): a late block pushes the reviews section down (largest 0.581, mobile, staging 2b777a0).",
    card: "MEH-3871",
  },
  {
    // MEH-3863: the register form moves during the load on CI (also behind the
    // MEH-3833 / MEH-3862 flakes). Staging 2b777a0, mobile, hard fail both tries.
    path: /^\/register$/,
    ceiling: 0.2,
    reason: "Register: the page grows at ~2 s and pushes the footer (largest 0.130, mobile, staging 2b777a0).",
    card: "MEH-3863",
  },
];

/** "/en/producer/dashboard/edit?group=x" → "/producer/dashboard/edit". */
function barePath(url: string): string {
  return url.replace(/[?#].*$/, "").replace(/^\/en(?=\/|$)/, "") || "/";
}

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
  opts: { browserName: string; navigated: boolean; allow?: readonly Allow[]; known?: readonly KnownCls[]; cls?: boolean },
): string[] {
  const allow = opts.allow ?? CONSOLE_ALLOW;
  const known = opts.known ?? KNOWN_CLS;
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

  if (opts.cls !== false && opts.browserName === "chromium" && opts.navigated) {
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
        const k = known.find((x) => x.path.test(barePath(top.url)));
        if (k && value <= k.ceiling) continue;
        if (k) {
          out.push(
            `layout shift got worse: CLS ${value.toFixed(3)} > the ${k.ceiling} ceiling of known page ${top.url} (${k.card}) — element ${top.src || "(unknown)"}`,
          );
          continue;
        }
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
  opts: { browserName: string; mode: LoadGuardMode },
): Promise<void> {
  const { browserName } = opts;
  const navigated = state.ready.length > 0 || !/^about:blank$/.test(page.url());
  const failures = loadGuardFailures(state, { browserName, navigated, cls: opts.mode === "on" });
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
      "\nA real bug gets a card and a fix. Noise that is not an app error goes into CONSOLE_ALLOW in e2e/flows/_load-guard.ts with a reason and a card. KNOWN_CLS only shrinks.",
  );
}
