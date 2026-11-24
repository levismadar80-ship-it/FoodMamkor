/**
 * Module:   _verify-finding
 * Purpose:  The one way a probe against staging or a preview turns a
 *           measurement into a reported bug. `verifyFinding` refuses to call
 *           anything «מאומת» unless both controls answered right, three runs
 *           agree, and each run left a screenshot. `waitForStable` and
 *           `clickInView` are the two gates a measurement needs on the way.
 * Does NOT: drive a page by itself or assert in a spec. A spec keeps using
 *           `expect`; this is for the scratch probes of rule 42 and the
 *           findings a thread reports to Sapir.
 * History:  MEH-3814 (creation).
 *
 * WHY (24/11/2026). A one-off sweep reported that going back to /group-buys
 * and /experiences lost the scroll position (388 px and 250 px instead of
 * 1,200). There was no bug. The sweep clicked a card that was below the
 * viewport, Playwright scrolled to it before the click, and 388/250 was the
 * card's position (MEH-3810, re-measured 190→190 and 950→950). The sweep ran
 * once, read the position after a fixed wait, had no known-answer control,
 * never measured the state right before its own click, and took no
 * screenshot. Each of those alone could have caught it.
 *
 * What the industry does, and which part of this file holds it:
 *   - Wait for a condition, not a time (Playwright's web-first assertions;
 *     Checkly, "never use page.waitForTimeout") → `waitForStable`, counted in
 *     animation frames, never in ms (testing.md, MEH-2972).
 *   - Re-run before believing a failure (Google TAP; a flaky test counts as
 *     failing only after 3 failures in a row) → `runs` ≥ 3, all must agree.
 *   - Check the instrument on a known answer first (testing.md «A green that
 *     has two possible causes») → `controls.bug` and `controls.clean`, both
 *     required, run before the scenario.
 *   - Measure the precondition instead of assuming it → `clickInView` throws
 *     when the click would scroll the page.
 */

export const VERIFIED_LABEL = "מאומת";
export const UNVERIFIED_LABEL = "חשד, לא מאומת";

const MIN_RUNS = 3;

/**
 * Run both controls, then the scenario `runs` times, and return a verdict.
 *
 * Verdicts:
 *   instrument-failed  a control answered wrong, or any run threw; no scenario
 *                      result in this call means anything
 *   not-reproduced     no run showed the bug
 *   inconsistent       some runs did, some did not
 *   no-evidence        every run showed the bug, but a run left no screenshot
 *   confirmed          every run showed the bug, each with a screenshot
 *
 * Only `confirmed` carries VERIFIED_LABEL; every other verdict carries
 * UNVERIFIED_LABEL, and that is the label a report must use.
 *
 * @template M
 * @param {{
 *   name: string,
 *   runs?: number,
 *   controls: { bug: () => Promise<M>, clean: () => Promise<M> },
 *   scenario: (run: number) => Promise<M>,
 *   isBug: (measured: M) => boolean,
 *   screenshotOf?: (measured: M) => string | undefined,
 * }} spec
 */
export async function verifyFinding(spec) {
  const { name, runs = MIN_RUNS, controls, scenario, isBug } = spec;
  const screenshotOf = spec.screenshotOf ?? ((m) => m?.screenshot);
  if (!Number.isInteger(runs) || runs < MIN_RUNS) {
    throw new Error(`verifyFinding: runs must be an integer ≥ ${MIN_RUNS}, got ${runs}`);
  }
  if (typeof controls?.bug !== "function" || typeof controls?.clean !== "function") {
    throw new Error("verifyFinding: controls.bug and controls.clean are both required — a check is trusted only after it has answered a known red and a known green");
  }

  const control = {};
  for (const [kind, expectBug] of [["bug", true], ["clean", false]]) {
    let measured;
    try {
      measured = await controls[kind]();
    } catch (error) {
      control[kind] = { ok: false, error: String(error?.message ?? error) };
      return finish(name, "instrument-failed", control, [], `control.${kind} threw`);
    }
    const sawBug = Boolean(isBug(measured));
    control[kind] = { ok: sawBug === expectBug, sawBug, measured };
    if (sawBug !== expectBug) {
      return finish(name, "instrument-failed", control, [], `control.${kind} answered ${sawBug ? "bug" : "clean"}, expected ${expectBug ? "bug" : "clean"}`);
    }
  }

  const results = [];
  for (let run = 0; run < runs; run++) {
    try {
      const measured = await scenario(run);
      results.push({ run, measured, bug: Boolean(isBug(measured)), screenshot: screenshotOf(measured) });
    } catch (error) {
      results.push({ run, error: String(error?.message ?? error) });
      return finish(name, "instrument-failed", control, results, `run ${run} threw: ${results.at(-1).error}`);
    }
  }

  const bugs = results.filter((r) => r.bug).length;
  if (bugs === 0) return finish(name, "not-reproduced", control, results, `0 of ${runs} runs showed the bug`);
  if (bugs < runs) return finish(name, "inconsistent", control, results, `${bugs} of ${runs} runs showed the bug`);
  if (results.some((r) => !r.screenshot)) {
    return finish(name, "no-evidence", control, results, `${runs} of ${runs} runs showed the bug, but a run left no screenshot`);
  }
  return finish(name, "confirmed", control, results, `${runs} of ${runs} runs showed the bug, each with a screenshot`);
}

function finish(name, verdict, control, runs, reason) {
  const label = verdict === "confirmed" ? VERIFIED_LABEL : UNVERIFIED_LABEL;
  return { name, verdict, label, reason, control, runs, summary: `${name}: ${verdict} — ${reason} [${label}]` };
}

/**
 * Read `fn(arg)` in the page once per animation frame until it returns the
 * same value (JSON-equal) for `frames` reads in a row; return that value.
 * Throws when it has not settled after `maxFrames` reads, naming the last two
 * values, so a value that never settles is reported, not measured.
 *
 * Frames, not milliseconds: a fixed wait is too short on a slow runner and
 * says nothing on a fast one (MEH-2972, MEH-3814).
 *
 * @template A, V
 * @param {{ evaluate: Function }} page  a Playwright Page
 * @param {(arg: A) => V} fn  runs in the page; must be serialisable
 * @param {A} [arg]
 * @param {{ frames?: number, maxFrames?: number }} [opts]
 * @returns {Promise<V>}
 */
export async function waitForStable(page, fn, arg, { frames = 10, maxFrames = 600 } = {}) {
  let last;
  let lastKey;
  let same = 0;
  for (let read = 0; read < maxFrames; read++) {
    const value = await page.evaluate(fn, arg);
    const key = JSON.stringify(value);
    same = key === lastKey ? same + 1 : 0;
    if (same >= frames - 1) return value;
    const previous = lastKey;
    last = value;
    lastKey = key;
    if (read === maxFrames - 1) {
      throw new Error(`waitForStable: not stable after ${maxFrames} frames (last ${previous} → ${JSON.stringify(last)})`);
    }
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
  }
  throw new Error(`waitForStable: maxFrames must be ≥ 1, got ${maxFrames}`);
}

/**
 * Click `locator` only if it is fully inside the viewport, so the click does
 * not scroll the page first. Returns the scroll position at the moment of the
 * click, which is the "before" a measurement compares against.
 *
 * Playwright scrolls an element into view before clicking it. A probe that
 * recorded the scroll position earlier and then clicked an off-screen card
 * compares against a position the page no longer had (MEH-3814, the 24/11
 * false report).
 *
 * @param {{ viewportSize: () => ({ width: number, height: number } | null), evaluate: Function }} page
 * @param {{ boundingBox: () => Promise<{ x: number, y: number, width: number, height: number } | null>, click: Function }} locator
 * @returns {Promise<{ scrollYAtClick: number }>}
 */
export async function clickInView(page, locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("clickInView: the element has no box (not rendered or hidden)");
  const vp = page.viewportSize();
  if (!vp) throw new Error("clickInView: the page has no fixed viewport");
  const inside = box.y >= 0 && box.x >= 0 && box.y + box.height <= vp.height && box.x + box.width <= vp.width;
  if (!inside) {
    throw new Error(
      `clickInView: the element is not fully in the viewport (box y=${Math.round(box.y)} h=${Math.round(box.height)}, viewport ${vp.width}×${vp.height}). ` +
        "Playwright would scroll before clicking, which moves the state you measured. Pick an element in view, or scroll first and measure again.",
    );
  }
  const scrollYAtClick = await page.evaluate(() => window.scrollY);
  await locator.click();
  return { scrollYAtClick };
}
