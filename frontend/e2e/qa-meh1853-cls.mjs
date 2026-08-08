/**
 * MEH-1853 — CLS measurement harness for the producer-detail page.
 *
 * WHY THIS EXISTS AS A SCRIPT AND NOT A LOCAL RUN
 * -----------------------------------------------
 * The ticket's DoD needs 12 CLS numbers taken against **staging**, and that is
 * not performable from the CC sandbox. Measured 03/08, all four combinations:
 * `--ssl-version-max=tls1.2` breaks the sandbox proxy's own CONNECT tunnel
 * (github fails too), and without the cap the Vercel edge resets this
 * Chromium's TLS-1.3 handshake — the exact condition the cap exists for. The
 * two requirements cannot both be satisfied through that proxy, so a browser in
 * the sandbox cannot reach staging at all. `curl` can (302), but CLS needs a
 * browser.
 *
 * A GitHub Actions runner talks to the Vercel edge directly — no proxy, no cap
 * needed, contradiction gone. So the measurement moves to CI. Sapir's ruling
 * 03/08, and it also rejected the two alternatives for reasons worth keeping:
 * running it on her machine works but makes the number unrepeatable (the point
 * is that "did MiniMap regress?" is answerable in two months without her), and
 * a local build measures the wrong thing — fonts, Cloudinary images and edge
 * latency are all different, so twelve numbers off a local build are worse than
 * none because they look like evidence.
 *
 * THE CONTROL IS NOT DECORATION — IT RUNS FIRST
 * ---------------------------------------------
 * Mobile CLS on this page is reported as 0.0000. That is a green with two
 * possible causes: "no shift happened" and "the sampler never installed". They
 * are indistinguishable from the number alone. So before any real measurement
 * this harness forces a KNOWN layout shift and asserts the observer recorded
 * it. If the control fails, every number in the run is unreadable and the
 * harness says so and exits non-zero rather than emitting a reassuring 0.
 *
 * `installed` is reported per sample for the same reason — a PerformanceObserver
 * that threw at construction would otherwise report exactly like a calm page.
 *
 * THE DEPLOY-FRESHNESS GATE — WHY IT RUNS BEFORE EVEN THE CONTROL
 * ---------------------------------------------------------------
 * A control proves the sampler works. It says nothing about WHICH BUILD it is
 * sampling. On 2026-08-05 that gap cost a full false conclusion: a CLS fix was
 * merged to `staging`, this harness was re-run, and it returned numbers
 * IDENTICAL to the pre-fix baseline in every digit — 1.3735 and 0.8744, same
 * entry counts, same control delta. It read exactly like "the fix does not
 * work". It was not: Vercel had hit `api-deployments-free-per-day`, the
 * frontend was never rebuilt, and the run measured the old bundle. Railway
 * (backend) deployed fine, so nothing else looked wrong.
 *
 * That is the same defect class as a `grep` that counts alembic heads: a tool
 * that can confidently answer a question it did not actually ask. The number
 * had two possible causes and nothing in the output separated them; the thing
 * that separated them was a commit-status lookup done by hand, afterwards.
 * Doing it by hand afterwards is not a guard — so it lives here now, and it
 * runs FIRST, because a stale target makes every later step meaningless.
 *
 * The check is deliberately cheap and needs no token: this repo is public, so
 * `GET /repos/{repo}/commits/{sha}/status` is readable unauthenticated, and
 * `GITHUB_SHA` / `GITHUB_REPOSITORY` are already in every Actions environment.
 * No workflow change was required to add it.
 *
 * What it can and cannot tell you, stated so nobody over-reads it: a `success`
 * Vercel status means a deployment was CREATED for this commit. It does not
 * prove edge propagation finished. It is a necessary condition, not a
 * sufficient one — but the failure it catches (no deployment at all) is the
 * one that silently rewrites your conclusion.
 *
 * Usage:
 *   node e2e/qa-meh1853-cls.mjs --url https://staging.mehamakor.online \
 *     --path /producer/<id> --runs 3 --out cls-results.json
 *
 * Env: VERCEL_AUTOMATION_BYPASS_SECRET (or VERCEL_BYPASS_SECRET) — staging sits
 * behind Vercel Deployment Protection; without the header a request 302s to
 * the SSO wall and never reaches the app. Read from env only, never logged.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};

const flag = (name) => argv.includes(`--${name}`);

const BASE = (arg("url", "https://staging.mehamakor.online") || "").replace(/\/$/, "");
const TARGET_PATH = arg("path", "");
const RUNS = Number(arg("runs", "3"));
const OUT = arg("out", "cls-results.json");
// Escape hatch for the deploy gate. It does NOT silence the finding — every
// artifact produced with it carries `deploy.enforced: false` and the reason, so
// a skipped check can never be mistaken later for a passed one.
const SKIP_DEPLOY_CHECK = flag("skip-deploy-check");
const BYPASS =
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET || process.env.VERCEL_BYPASS_SECRET || "";

const VIEWPORTS = [
  { label: "mobile-375", width: 375, height: 812 },
  { label: "desktop-1440", width: 1440, height: 900 },
];

// Installed via addInitScript so it is live before first paint. It deliberately
// touches NOTHING on document.documentElement: inside addInitScript that is
// still null, and an observer that throws there dies silently and reports a
// clean zero — the failure mode this file is built to rule out.
// MEH-1853: each entry additionally records WHICH elements moved and by how
// much (`LayoutShift.sources[]`). The fix that was reverted on 06/08 aimed at
// the MiniMap because a code read said so, matched its box to the pixel
// (`delta=0px`), and made desktop CLS 25% WORSE — because "reserving the box
// removes the shift" was argued from geometry and never measured. Attribution
// is the missing measurement: it names the moving elements instead of
// inferring them.
//
// Two invariants, both load-bearing:
//   1. `value`/`entries` are accumulated FIRST and in their own statement, so
//      the headline numbers stay byte-identical to every run before this and
//      remain comparable with the 05-06/08 baselines.
//   2. All attribution sits inside its own try/catch that can only ever write
//      to `attributionError`. A throw in here must never kill the observer —
//      that would resurrect the silent-zero this whole file exists to rule out
//      (a dead sampler and a clean page both report 0.0000).
const SAMPLER = `
  window.__cls = {
    value: 0, entries: 0, installed: false, error: null,
    shifts: [], attributionError: null,
  };
  try {
    const MAX_SHIFTS = 40;
    const describe = (node) => {
      if (!node) return "(no node)";
      if (node.nodeType !== 1) return "(" + node.nodeName + ")";
      const testid = node.getAttribute("data-testid");
      const cls = (node.getAttribute("class") || "").trim().split(/\\s+/).filter(Boolean).slice(0, 4).join(".");
      return node.tagName
        + (node.id ? "#" + node.id : "")
        + (testid ? "[data-testid=" + testid + "]" : "")
        + (cls ? "." + cls : "");
    };
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue;
        window.__cls.value += e.value;
        window.__cls.entries++;
        try {
          if (window.__cls.shifts.length < MAX_SHIFTS) {
            window.__cls.shifts.push({
              value: Number(e.value.toFixed(4)),
              time: Math.round(e.startTime),
              sources: Array.from(e.sources || []).slice(0, 4).map((s) => ({
                node: describe(s.node),
                fromY: s.previousRect ? Math.round(s.previousRect.y) : null,
                toY: s.currentRect ? Math.round(s.currentRect.y) : null,
                dy: (s.previousRect && s.currentRect)
                  ? Math.round(s.currentRect.y - s.previousRect.y) : null,
                h: s.currentRect ? Math.round(s.currentRect.height) : null,
                // MEH-1853 §5: the y-delta says an element MOVED; only the
                // height delta says an element GREW. The footer is last on the
                // page, so it moves whenever anything above it expands — it is
                // the surface of the shift, never its cause. Separating the two
                // is the whole point of this pass.
                fromH: s.previousRect ? Math.round(s.previousRect.height) : null,
                dh: (s.previousRect && s.currentRect)
                  ? Math.round(s.currentRect.height - s.previousRect.height) : null,
              })),
            });
          }
        } catch (attrErr) {
          window.__cls.attributionError =
            String(attrErr && attrErr.message ? attrErr.message : attrErr);
        }
      }
    });
    po.observe({ type: "layout-shift", buffered: true });
    window.__cls.installed = true;
  } catch (err) {
    window.__cls.error = String(err && err.message ? err.message : err);
  }
`;

async function newPage(browser, vp) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    ...(BYPASS ? { extraHTTPHeaders: { "x-vercel-protection-bypass": BYPASS } } : {}),
  });
  const page = await ctx.newPage();
  await page.addInitScript(SAMPLER);
  return { ctx, page };
}

const readCls = (page) => page.evaluate(() => ({ ...window.__cls }));

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  // CLS accrues after networkidle too (late images, client-gated sections).
  await page.waitForTimeout(2500);
}

/**
 * CONTROL — prove the sampler counts a real shift before trusting any zero.
 * Injects a tall block at the top of <body>, which displaces everything below
 * it. Returns the delta the observer attributed to that injection.
 */
async function control(browser) {
  const { ctx, page } = await newPage(browser, VIEWPORTS[0]);
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const before = await readCls(page);
  await page.evaluate(() => {
    const d = document.createElement("div");
    d.style.cssText = "height:420px;background:#ccc";
    document.body.insertBefore(d, document.body.firstChild);
  });
  await page.waitForTimeout(1200);
  const after = await readCls(page);
  await ctx.close();
  const delta = after.value - before.value;
  return { installed: after.installed, error: after.error, before: before.value, after: after.value, delta };
}

async function measure(browser, vp, path, run) {
  const { ctx, page } = await newPage(browser, vp);
  const url = `${BASE}${path}`;
  const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await settle(page);
  const cls = await readCls(page);
  await ctx.close();
  return {
    viewport: vp.label, path, run, url,
    status: res ? res.status() : null,
    cls: Number(cls.value.toFixed(4)),
    entries: cls.entries,
    installed: cls.installed,
    observerError: cls.error,
    // MEH-1853: per-entry attribution — which elements moved, and by how much.
    shifts: cls.shifts || [],
    attributionError: cls.attributionError || null,
  };
}

/**
 * Rank the shift sources across a set of samples by total CLS contributed.
 *
 * The point is to answer "what actually moves on this page" with a number
 * next to each answer, so the next fix is aimed at a measured culprit rather
 * than at a plausible one. Keyed on the element descriptor, summing the
 * OWNING ENTRY's value — a shift entry carries one value for all its sources,
 * so an entry with several sources contributes its value to each of them.
 * That over-counts by design: it answers "which elements participate in the
 * expensive shifts", not "how do we apportion blame between co-movers", and
 * the latter is not a question the API can answer.
 */
function rankSources(samples) {
  const totals = new Map();
  for (const s of samples) {
    for (const shift of s.shifts || []) {
      for (const src of shift.sources || []) {
        const prev = totals.get(src.node)
          || {
            node: src.node, cls: 0, hits: 0, maxDy: 0,
            maxDh: 0, grew: false, growFromH: null, growToH: null,
          };
        prev.cls += shift.value;
        prev.hits += 1;
        if (src.dy != null) prev.maxDy = Math.max(prev.maxDy, Math.abs(src.dy));
        // Growth is signed on purpose: only an element that got TALLER can push
        // what follows it. A shrink moves later content up and is a different
        // (and here, unobserved) story, so it must not be folded in by Math.abs.
        if (src.dh != null && src.dh > 0) {
          if (src.dh > prev.maxDh) {
            prev.maxDh = src.dh;
            // Keep the before/after box of the LARGEST growth, not just its
            // size. A source with no prior box reports previousRect as
            // all-zeros rather than null, so `dh` equals its full height and a
            // node appearing for the first time ranks like a large expansion.
            // `0 -> 400` and `292 -> 412` are different events with different
            // fixes; only fromH/toH tells them apart.
            prev.growFromH = src.fromH ?? null;
            prev.growToH = src.h ?? null;
          }
          prev.grew = true;
        }
        totals.set(src.node, prev);
      }
    }
  }
  return [...totals.values()]
    .map((t) => ({ ...t, cls: Number(t.cls.toFixed(4)) }))
    .sort((a, b) => b.cls - a.cls);
}

/**
 * Which elements GREW — the candidate pushers (MEH-1853 §5).
 *
 * `rankSources` answers "what moved", and on this page that ranking is
 * dominated by the footer, which is the last element on the page and therefore
 * moves whenever anything above it expands. Ranking by CLS keeps nominating the
 * victim. This function asks the other question: whose own box got taller?
 *
 * Ordered by the largest observed growth, NOT by CLS — a 200px expansion high
 * up the document is the cause even when the element it displaces scores far
 * more. Ordering these by CLS would reproduce exactly the mistake that cost
 * PRs #2626 → #2632, where a fix was aimed at the top of the CLS ranking.
 *
 * An element with no `dh` recorded (older artifacts, or a source the browser
 * gave no `previousRect` for) is absent rather than assumed static — a missing
 * measurement is not evidence of no growth.
 */
function rankGrowers(ranked) {
  return ranked
    .filter((r) => r.grew === true && r.maxDh > 0)
    .sort((a, b) => b.maxDh - a.maxDh);
}

/**
 * Is the commit this run was launched from actually DEPLOYED to the target?
 *
 * Returns a record, never throws — the caller decides what to do with it, so
 * "the check could not run" and "the check failed" stay distinguishable in the
 * output rather than collapsing into one boolean.
 *
 * `ok: null` means "could not determine" (no env, network failure). That is
 * NOT treated as a pass by the caller — see main().
 */
async function checkDeployFreshness() {
  const sha = process.env.GITHUB_SHA || "";
  const repo = process.env.GITHUB_REPOSITORY || "";
  if (!sha || !repo) {
    return {
      ok: null,
      sha: sha || null,
      repo: repo || null,
      reason:
        "GITHUB_SHA / GITHUB_REPOSITORY are unset — this is not an Actions run, " +
        "so the deployed commit cannot be identified.",
    };
  }
  const api = `https://api.github.com/repos/${repo}/commits/${sha}/status`;
  let body;
  try {
    const res = await fetch(api, { headers: { accept: "application/vnd.github+json" } });
    if (!res.ok) {
      return { ok: null, sha, repo, reason: `commit-status API returned HTTP ${res.status}` };
    }
    body = await res.json();
  } catch (e) {
    return { ok: null, sha, repo, reason: `commit-status API unreachable: ${e.message}` };
  }

  const statuses = Array.isArray(body.statuses) ? body.statuses : [];
  // Match the Vercel context by name. An ABSENT Vercel status is a FAILURE
  // condition, not a missing datum: when the deployment is skipped, ignored or
  // rate-limited, that is precisely what the target not being rebuilt looks
  // like. Treating "no status" as "probably fine" would reinstate the exact
  // hole this function exists to close.
  const vercel = statuses.find((s) => /vercel/i.test(s.context || ""));
  if (!vercel) {
    return {
      ok: false,
      sha,
      repo,
      contexts: statuses.map((s) => s.context),
      reason:
        "no Vercel status on this commit — no frontend deployment was created " +
        "for it (skipped, ignored, or never triggered).",
    };
  }
  return {
    ok: vercel.state === "success",
    sha,
    repo,
    state: vercel.state,
    description: vercel.description || null,
    reason:
      vercel.state === "success"
        ? "Vercel reported a successful deployment for this commit."
        : `Vercel status is "${vercel.state}" — ${vercel.description || "no description"}.`,
  };
}

/**
 * Self-test for the deploy gate — MEH-1619: a guard nobody has watched fail is
 * a green light of unknown wiring.
 *
 * It drives the REAL `checkDeployFreshness()` (never a copy — a second copy is
 * free to drift from the one that runs) by stubbing `globalThis.fetch` and the
 * two env vars, then asserts how it sorts four commit-status shapes.
 *
 * CASE 3 IS THE ONE THAT EARNS ITS KEEP. An implementation that finds the
 * Vercel status and checks `state === "success"` — the obvious one — passes
 * cases 1, 2 and 4 and silently passes case 3 too, because `find()` returns
 * undefined and a careless `?.state !== "success"` reads as "nothing to
 * object to". Case 3 is `Ignored`/rate-limited-before-status: no Vercel
 * context on the commit at all. That is exactly "the frontend was not
 * rebuilt", and it must be a REFUSAL.
 *
 * Case 2 is the literal 2026-08-05 payload that caused the false conclusion.
 */
async function selfTest() {
  const realFetch = globalThis.fetch;
  const realSha = process.env.GITHUB_SHA;
  const realRepo = process.env.GITHUB_REPOSITORY;

  const cases = [
    {
      name: "Vercel success → measure",
      env: true,
      statuses: [{ context: "Vercel", state: "success", description: "Deployment has completed" }],
      expect: true,
    },
    {
      name: "Vercel rate-limited (the 05/08 payload) → REFUSE",
      env: true,
      statuses: [
        { context: "Vercel", state: "failure", description: "Deployment rate limited — retry in 24 hours." },
        { context: "believable-tenderness - FoodMamkor", state: "success", description: "Success" },
      ],
      expect: false,
    },
    {
      name: "no Vercel context at all (ignored / never triggered) → REFUSE",
      env: true,
      // Railway alone. A naive `find(...)?.state !== "success"` check would
      // treat this as unobjectionable and measure the old build.
      statuses: [{ context: "believable-tenderness - FoodMamkor", state: "success", description: "Success" }],
      expect: false,
    },
    {
      name: "no Actions env → UNDETERMINED (null, and null is not a pass)",
      env: false,
      statuses: [],
      expect: null,
    },
  ];

  let ok = true;
  for (const c of cases) {
    if (c.env) {
      process.env.GITHUB_SHA = "0".repeat(40);
      process.env.GITHUB_REPOSITORY = "owner/repo";
    } else {
      delete process.env.GITHUB_SHA;
      delete process.env.GITHUB_REPOSITORY;
    }
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ statuses: c.statuses }) });
    const got = await checkDeployFreshness();
    const pass = got.ok === c.expect;
    if (!pass) ok = false;
    console.log(`  ${pass ? "PASS" : "FAIL"} ${c.name} → ok=${got.ok} (${got.reason})`);
  }

  // The gate's DECISION, not just the classifier: `null` must not be treated
  // as permission to proceed. Asserted explicitly because that is a separate
  // line of code from the classifier and could regress on its own.
  const nullBlocks = !(null === true);
  console.log(`  ${nullBlocks ? "PASS" : "FAIL"} undetermined (null) does not satisfy \`ok !== true\` → refuses`);

  globalThis.fetch = realFetch;
  if (realSha === undefined) delete process.env.GITHUB_SHA;
  else process.env.GITHUB_SHA = realSha;
  if (realRepo === undefined) delete process.env.GITHUB_REPOSITORY;
  else process.env.GITHUB_REPOSITORY = realRepo;

  return ok && nullBlocks;
}

/**
 * SELF-TEST for the attribution ranking (MEH-1853).
 *
 * `rankSources` is a classifier: it decides which element is "the" culprit,
 * and a fix will be aimed at whatever it puts on top. Per
 * `.claude/rules/testing.md`, a classifier ships with a self-test that feeds
 * the REAL implementation inputs whose ordering is already known — not a
 * reimplementation, which is free to drift from the one that matters.
 *
 * The discriminating case is case B. A ranking keyed on HIT COUNT rather than
 * on summed CLS gets A and B backwards: the frequent-but-cheap element wins on
 * count while the rare-but-expensive one is what actually costs the score.
 * That is the mistake worth catching, because "it moved the most times" is the
 * intuitive read of a shift log and it is the wrong one.
 */
function attributionSelfTest() {
  let ok = true;
  const check = (name, cond, detail) => {
    if (!cond) ok = false;
    console.log(`  ${cond ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  };

  // A: cheap but frequent (4 shifts x 0.01 = 0.04).
  // B: expensive but rare  (1 shift  x 0.90 = 0.90).  ← must rank first
  const samples = [{
    viewport: "desktop-1440",
    cls: 0.94,
    shifts: [
      ...Array.from({ length: 4 }, () => ({
        value: 0.01, time: 100, sources: [{ node: "DIV.frequent", dy: 3, h: 10 }],
      })),
      { value: 0.9, time: 900, sources: [{ node: "FOOTER.expensive", dy: 356, h: 400 }] },
    ],
  }];

  const ranked = rankSources(samples);
  check("ranks by summed CLS, not by hit count",
    ranked[0]?.node === "FOOTER.expensive",
    `top=${ranked[0]?.node} cls=${ranked[0]?.cls}`);
  check("the frequent-but-cheap element still appears, ranked below",
    ranked[1]?.node === "DIV.frequent" && ranked[1]?.cls === 0.04,
    `second=${ranked[1]?.node} cls=${ranked[1]?.cls}`);
  check("records the largest observed displacement",
    ranked[0]?.maxDy === 356, `maxDy=${ranked[0]?.maxDy}`);
  check("counts occurrences independently of cost",
    ranked[1]?.hits === 4, `hits=${ranked[1]?.hits}`);

  // A shift entry with no sources must not invent one, and must not throw.
  const empty = rankSources([{ viewport: "x", shifts: [{ value: 0.5, sources: [] }] }]);
  check("an entry carrying no sources yields no attribution", empty.length === 0,
    `got ${empty.length}`);

  // Samples predating this change have no `shifts` key at all.
  const legacy = rankSources([{ viewport: "x", cls: 0.87 }]);
  check("a sample with no `shifts` key is tolerated, not a crash", legacy.length === 0);

  // ── MEH-1853 §5: grower vs mover ──────────────────────────────────────────
  //
  // THE DISCRIMINATING CASE, and the reason this pass exists. Case C is built
  // from the REAL 07/08 desktop-1440 measurement recorded on the ticket (run
  // 31164974787): the element descriptors, the hit counts and the y-deltas are
  // verbatim. Anchoring to the shape the page actually produces is what a
  // purely synthetic fixture cannot do (.claude/rules/testing.md, MEH-1909).
  //
  // Two values are NOT verbatim, and saying so precisely matters more than the
  // fixture looking authoritative:
  //   - the PER-SHIFT values are reconstructed to sum to the recorded totals
  //     (9 x 0.2888 = 2.5992 against a recorded 2.5989 — the run published the
  //     sums, never the individual entries; the 0.0003 is that rounding).
  //   - `dh` is SYNTHETIC, and half of it is now known to be counterfactual.
  //     It was written as the hypothesis under test — footer displaced without
  //     resizing, zero-displacement DIV resizing — with the note that the real
  //     run would settle it. **Run 31221768874 settled it, and the footer half
  //     was wrong**: the footer's own box grows on both viewports (desktop
  //     42->576, mobile 0->546, where it is the ONLY grower). The DIV half held
  //     — `ProducerDetail.jsx:107` grew 120->818 with dy=0, the largest on
  //     desktop.
  //
  //     The `dh: 0` on the footer below is KEPT, deliberately, and its meaning
  //     has changed: it is no longer a claim about the page, only a synthetic
  //     non-grower proving `rankGrowers` excludes something that scores high on
  //     CLS. That is still the assertion worth having. Do not read this fixture
  //     as a description of producer-detail — the measurement is on the ticket.
  //
  // What it discriminates against: ranking growers by CLS, or passing the
  // ranking straight through. Both put FOOTER first — it outscores the DIV
  // 2.5989 to 1.8018 — which is the identical error that aimed PR #2626 at the
  // wrong element and made CLS 25% worse.
  const measured = [{
    viewport: "desktop-1440",
    cls: 0.8744,
    shifts: [
      ...Array.from({ length: 9 }, () => ({
        value: 0.2888, time: 800,
        sources: [{
          node: "FOOTER.mt-16.bg-primary-dark.text-green-50",
          dy: 534, h: 620, fromH: 620, dh: 0,
        }],
      })),
      ...Array.from({ length: 3 }, () => ({
        value: 0.6006, time: 600,
        sources: [{
          node: "DIV.max-w-6xl.mx-auto.px-4.py-6",
          dy: 0, h: 412, fromH: 292, dh: 120,
        }],
      })),
    ],
  }];

  const measuredRanked = rankSources(measured);
  const growers = rankGrowers(measuredRanked);

  check("the CLS ranking still names the footer first (the victim)",
    measuredRanked[0]?.node === "FOOTER.mt-16.bg-primary-dark.text-green-50",
    `top=${measuredRanked[0]?.node}`);
  check("the GROWER ranking excludes the footer entirely",
    growers.every((g) => !g.node.startsWith("FOOTER")),
    `growers=[${growers.map((g) => g.node).join(", ")}]`);
  check("the grower is the zero-displacement DIV, despite scoring less CLS",
    growers.length === 1 && growers[0]?.node === "DIV.max-w-6xl.mx-auto.px-4.py-6",
    `n=${growers.length} top=${growers[0]?.node}`);
  check("growth magnitude is recorded",
    growers[0]?.maxDh === 120, `maxDh=${growers[0]?.maxDh}`);
  check("an element observed only moving is not marked as having grown",
    measuredRanked.find((r) => r.node.startsWith("FOOTER"))?.grew === false);

  // A source whose dh was never recorded (null) is not a grower. Absent
  // measurement must not read as "measured, and it did not grow".
  const unmeasured = rankGrowers(rankSources([{
    viewport: "x",
    shifts: [{ value: 0.4, sources: [{ node: "DIV.legacy", dy: 40, h: 100 }] }],
  }]));
  check("a source carrying no dh is not classified as a grower",
    unmeasured.length === 0, `got ${unmeasured.length}`);

  // A node appearing for the first time reports previousRect as all-zeros, not
  // null, so its `dh` equals its full height and it outranks a genuine resize.
  // Both push what follows; they are different bugs with different fixes, so
  // the before/after box of the largest growth is retained to tell them apart.
  // Asserting on the DATA, not on the log line that renders it.
  const mixed = rankGrowers(rankSources([{
    viewport: "x",
    shifts: [
      { value: 0.5, sources: [{ node: "DIV.appeared", dy: 0, h: 400, fromH: 0, dh: 400 }] },
      { value: 0.5, sources: [{ node: "DIV.expanded", dy: 0, h: 412, fromH: 292, dh: 120 }] },
    ],
  }]));
  check("a first-render insertion is distinguishable from a resize",
    mixed.find((g) => g.node === "DIV.appeared")?.growFromH === 0
    && mixed.find((g) => g.node === "DIV.expanded")?.growFromH === 292,
    `appeared=${mixed.find((g) => g.node === "DIV.appeared")?.growFromH} ` +
    `expanded=${mixed.find((g) => g.node === "DIV.expanded")?.growFromH}`);
  check("the before/after box belongs to the LARGEST growth, not the last seen",
    rankGrowers(rankSources([{
      viewport: "x",
      shifts: [
        { value: 0.1, sources: [{ node: "DIV.x", dy: 0, h: 500, fromH: 100, dh: 400 }] },
        { value: 0.1, sources: [{ node: "DIV.x", dy: 0, h: 60, fromH: 50, dh: 10 }] },
      ],
    }]))[0]?.growFromH === 100);

  // A shrink is not a push. Only positive growth can displace what follows.
  const shrank = rankGrowers(rankSources([{
    viewport: "x",
    shifts: [{ value: 0.4, sources: [{ node: "DIV.collapsed", dy: -80, h: 20, fromH: 100, dh: -80 }] }],
  }]));
  check("a source that shrank is not classified as a grower",
    shrank.length === 0, `got ${shrank.length}`);

  return ok;
}

async function main() {
  if (flag("self-test")) {
    console.log("=== deploy-gate self-test (does it discriminate?) ===");
    const ok = await selfTest();
    console.log("\n=== attribution self-test (does the ranking discriminate?) ===");
    const attrOk = attributionSelfTest();
    const all = ok && attrOk;
    console.log(all ? "\nSELF-TEST PASS" : "\nSELF-TEST FAILED");
    process.exit(all ? 0 : 1);
  }
  if (!TARGET_PATH) {
    console.error("ERROR: --path is required (e.g. --path /producer/<id>)");
    process.exit(2);
  }
  if (!BYPASS) {
    // Loud, not a silent skip: without the header staging 302s to the SSO wall
    // and every sample would measure the redirect target, not the page.
    console.error(
      "ERROR: VERCEL_AUTOMATION_BYPASS_SECRET is unset. Staging is behind Vercel\n" +
      "Deployment Protection; without the bypass header this would measure the SSO\n" +
      "redirect and report numbers that look real. Refusing to run."
    );
    process.exit(2);
  }

  // ---- deploy freshness FIRST — before the browser even starts ----
  // Ordered ahead of the control on purpose: a control proves the sampler
  // works, which is worthless if the sampler is pointed at last week's build.
  const deploy = await checkDeployFreshness();
  deploy.enforced = !SKIP_DEPLOY_CHECK;
  console.log(
    `DEPLOY ok=${deploy.ok} enforced=${deploy.enforced} sha=${deploy.sha || "-"} — ${deploy.reason}`
  );
  if (!SKIP_DEPLOY_CHECK && deploy.ok !== true) {
    console.error(
      "\nDEPLOY GATE FAILED — refusing to measure.\n" +
      `  ${deploy.reason}\n` +
      "\nThe target may still be serving an older build, in which case every\n" +
      "number below would describe code that is not the code under test — and\n" +
      "would be indistinguishable from a real result. This exact situation\n" +
      "produced a false 'the fix does not work' on 2026-08-05.\n" +
      "\nFix the deployment, or pass --skip-deploy-check if you deliberately\n" +
      "intend to measure whatever is currently live (the artifact will record\n" +
      "that the gate was skipped)."
    );
    fs.writeFileSync(
      OUT,
      JSON.stringify({ base: BASE, path: TARGET_PATH, deploy, samples: [] }, null, 2)
    );
    process.exit(1);
  }
  if (SKIP_DEPLOY_CHECK) {
    console.warn(
      "WARNING: --skip-deploy-check — the numbers below describe whatever is " +
      "currently deployed, which may not be this commit."
    );
  }

  const browser = await chromium.launch();
  console.log(`base=${BASE} path=${TARGET_PATH} runs=${RUNS}`);

  // ---- control first ----
  const ctrl = await control(browser);
  console.log(`CONTROL installed=${ctrl.installed} delta=${ctrl.delta.toFixed(4)} (${ctrl.before} -> ${ctrl.after})`);
  const controlOk = ctrl.installed && ctrl.delta > 0.01;
  if (!controlOk) {
    console.error(
      "CONTROL FAILED — the sampler did not record a forced layout shift.\n" +
      "Every number this run would produce is unreadable; a 0.0000 here would be\n" +
      "indistinguishable from a dead observer. Not emitting measurements."
    );
    fs.writeFileSync(OUT, JSON.stringify({ base: BASE, path: TARGET_PATH, deploy, control: ctrl, controlOk, samples: [] }, null, 2));
    await browser.close();
    process.exit(1);
  }

  // ---- 3 loads x 2 viewports ----
  const samples = [];
  for (const vp of VIEWPORTS) {
    for (let run = 1; run <= RUNS; run++) {
      const s = await measure(browser, vp, TARGET_PATH, run);
      samples.push(s);
      console.log(
        `${s.viewport} run${s.run}: cls=${s.cls} entries=${s.entries} installed=${s.installed} status=${s.status}`
      );
    }
  }
  await browser.close();

  const worst = samples.reduce((a, b) => (b.cls > a.cls ? b : a), samples[0]);

  // MEH-1853: attribution, per viewport. Printed to the log as well as written
  // to the artifact — the log is what gets read first, and a ranking nobody
  // opens the JSON to see is a ranking nobody uses.
  const attribution = {};
  const growersByVp = {};
  for (const vp of VIEWPORTS) {
    const forVp = samples.filter((s) => s.viewport === vp.label);
    const ranked = rankSources(forVp);
    attribution[vp.label] = ranked;
    console.log(`\n── shift sources · ${vp.label} (${forVp.length} loads) ──`);
    if (!ranked.length) {
      const why = forVp.find((s) => s.attributionError)?.attributionError;
      console.log(
        why
          ? `  no sources recorded — attribution threw: ${why}`
          : "  no sources recorded (either no shifts, or the entries carried none)"
      );
    }
    for (const r of ranked.slice(0, 8)) {
      const grow = r.grew ? `  grew=+${r.maxDh}px` : "";
      console.log(`  cls=${r.cls}  moved=${r.maxDy}px${grow}  x${r.hits}  ${r.node}`);
    }

    // MEH-1853 §5: the ranking above says who MOVED. This one says who GREW,
    // and only a grower can be the cause. Printed second and separately so the
    // two questions cannot be conflated at a glance — conflating them is the
    // documented failure of this ticket's previous cycle.
    const growers = rankGrowers(ranked);
    growersByVp[vp.label] = growers;
    console.log(`  ── grew after render (candidate pushers) ──`);
    if (!growers.length) {
      console.log(
        "    none — no source recorded a height increase. Either nothing grew, " +
        "or no source carried a previousRect. NOT a finding on its own."
      );
    }
    for (const g of growers.slice(0, 8)) {
      // `0 -> 400` is a node appearing; `292 -> 412` is a block expanding.
      // Both push what follows, but they are different bugs with different
      // fixes, so the box is printed rather than only its delta.
      const box = g.growFromH == null ? "?" : `${g.growFromH}→${g.growToH}px`;
      const kind = g.growFromH === 0 ? " [first render]" : "";
      console.log(
        `    grew=+${g.maxDh}px (${box})${kind}  cls=${g.cls}  moved=${g.maxDy}px  x${g.hits}  ${g.node}`
      );
    }
  }

  const payload = {
    base: BASE, path: TARGET_PATH, deploy, control: ctrl, controlOk,
    samples, worst, attribution, growers: growersByVp,
  };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log(`\nworst: ${worst.viewport} cls=${worst.cls}`);
  console.log(`wrote ${OUT}`);

  // Attribution is diagnostic, not a gate: it must never fail a run whose
  // measurements are sound. But a silent absence is how a broken probe reads
  // as a clean answer, so say so loudly.
  const noAttr = samples.filter((s) => s.cls > 0 && !(s.shifts || []).length);
  if (noAttr.length) {
    console.warn(
      `WARNING — ${noAttr.length} sample(s) recorded CLS > 0 but no shift sources. ` +
      "The numbers stand; the attribution for those samples does not."
    );
  }

  // Any sample whose observer never installed invalidates that sample.
  const dead = samples.filter((s) => !s.installed);
  if (dead.length) {
    console.error(`FAILED — ${dead.length} sample(s) had no observer installed.`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
