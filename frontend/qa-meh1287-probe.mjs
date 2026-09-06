/**
 * MEH-1287 chunk B — the SETTLED-state probe.
 *
 * Written to answer one question the capture harness could not: when
 * `getByTestId("home-seasonal-now")` resolved to two hidden elements, was the
 * module double-mounting, or was Playwright reading during a transition frame?
 *
 * It waits 2.5s and then reports the count, each node's box, and every
 * ancestor's computed `display` / `visibility` — because "two elements, both
 * hidden" has two very different explanations and the ancestor chain is what
 * separates them. Measured at 1440: ONE node, `display: block`, 1280x536, no
 * `display: none` anywhere above it.
 *
 * Its sibling `qa-meh1287-dup-probe.mjs` answers the other half — whether the
 * duplication happens at all during the first seconds — by sampling the count
 * every 40ms behind a live-document control. This file is the snapshot, that
 * one is the time series; the conclusion recorded in the PR needs both, since
 * a settled snapshot cannot rule out a transient and a sampler cannot prove
 * what the settled DOM looks like.
 *
 * Run against a local `next start` (see qa-meh1287-capture.mjs for the stub
 * origin). The browser is resolved by qa-chrome-path.mjs — no env var.
 */
import { chromium } from "playwright";
import { resolveChromium } from "./qa-chrome-path.mjs";
const b = await chromium.launch({ executablePath: resolveChromium() });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: "he-IL" });
const p = await ctx.newPage();
await p.goto("http://127.0.0.1:3111/", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(2500);
const info = await p.evaluate(() => {
  const nodes = [...document.querySelectorAll('[data-testid="home-seasonal-now"]')];
  return nodes.map((n) => {
    const r = n.getBoundingClientRect();
    const chain = [];
    for (let e = n.parentElement; e && chain.length < 6; e = e.parentElement) {
      const cs = getComputedStyle(e);
      chain.push(`${e.tagName}.${(e.className || "").toString().slice(0, 40)} display=${cs.display} vis=${cs.visibility}`);
    }
    return { rect: [r.width, r.height], own: getComputedStyle(n).display, chain };
  });
});
console.log("count:", info.length);
console.log(JSON.stringify(info, null, 1).slice(0, 2000));
await b.close();
