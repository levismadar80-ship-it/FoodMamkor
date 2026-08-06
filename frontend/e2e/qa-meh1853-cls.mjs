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
const SAMPLER = `
  window.__cls = { value: 0, entries: 0, installed: false, error: null };
  try {
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (!e.hadRecentInput) { window.__cls.value += e.value; window.__cls.entries++; }
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
  };
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

async function main() {
  if (flag("self-test")) {
    console.log("=== deploy-gate self-test (does it discriminate?) ===");
    const ok = await selfTest();
    console.log(ok ? "\nSELF-TEST PASS" : "\nSELF-TEST FAILED");
    process.exit(ok ? 0 : 1);
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
  const payload = { base: BASE, path: TARGET_PATH, deploy, control: ctrl, controlOk, samples, worst };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log(`\nworst: ${worst.viewport} cls=${worst.cls}`);
  console.log(`wrote ${OUT}`);

  // Any sample whose observer never installed invalidates that sample.
  const dead = samples.filter((s) => !s.installed);
  if (dead.length) {
    console.error(`FAILED — ${dead.length} sample(s) had no observer installed.`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
