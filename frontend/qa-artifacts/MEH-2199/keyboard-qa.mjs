/**
 * Module:   keyboard-qa
 * Purpose:  MEH-2199 self-QA — drive each chunk's surface with real key presses
 *           in a real browser and record what the focus/selection actually did.
 *           Replaces the mobile-preview pass by approved deviation: a keyboard
 *           contract has no touch surface to photograph.
 * Touches:  a local `next start` on :3000. Network is stubbed per-route, never
 *           reached — the sandbox cannot talk to Railway (CLAUDE.md, MEH-2090).
 * Does NOT: assert pixels. Zero visual delta is the vitest suite's job and the
 *           diff's; this file only asserts semantics.
 * History:  MEH-2199.
 *
 * WHY THE CONTROLS COME FIRST, AND WHY THE LOG IS WITHHELD WITHOUT THEM
 * ---------------------------------------------------------------------
 * "focus did not move" is what this harness prints both when the keyboard layer
 * is missing (the finding) and when the harness never found the widget (a dead
 * probe). Those are indistinguishable in the output, and one of them is the
 * answer a tired reader wants. So every surface declares a CONTROL that must
 * produce output, and a NEGATIVE control — a key the implementation does not
 * handle, which must leave focus and selection exactly where they were. If the
 * control fails the run aborts and writes nothing: a missing log is honest, a
 * log full of confident nulls is not. (.claude/rules/testing.md — "A probe whose
 * null output is also its reassuring output is not evidence".)
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "http://127.0.0.1:3000";
const OUT = new URL("./", import.meta.url).pathname;
const only = process.argv[2] || null;

const lines = [];
let failures = 0;
const log = (s) => { lines.push(s); console.log(s); };
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  log(`${ok ? "PASS" : "FAIL"}  ${name}\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`);
  return ok;
};
const control = (name, actual, expected) => {
  if (!check(`CONTROL ${name}`, actual, expected)) {
    log("");
    log("!! CONTROL FAILED — the harness could not see the widget it is aimed at.");
    log("!! Every assertion in this run is VOID, including any that read PASS.");
    throw new Error(`control failed: ${name}`);
  }
};

/** What the page believes about focus + tab/radio state, read from the live DOM. */
const snapshot = (page, listSel, itemSel) =>
  page.evaluate(([listSel, itemSel]) => {
    const list = document.querySelector(listSel);
    if (!list) return { found: false };
    const items = [...list.querySelectorAll(itemSel)];
    const active = document.activeElement;
    return {
      found: true,
      count: items.length,
      focused: items.indexOf(active),
      focusedValue: active?.dataset?.tabValue ?? active?.dataset?.radioValue ?? null,
      selected: items.map((el) => el.getAttribute("aria-selected") ?? el.getAttribute("aria-checked")),
      tabindex: items.map((el) => el.getAttribute("tabindex")),
    };
  }, [listSel, itemSel]);

const singleTabStop = (snap) => snap.tabindex.filter((v) => v === "0").length;

async function eventsTabs(page) {
  log("\n=== /he/events — events|experiences tablist + list|calendar view toggle ===");
  // One stubbed row: the view toggle is withheld on an empty dataset
  // (EventsClient.jsx MEH-1865), and the sandbox has no backend to ask.
  await page.route("**/api/events*", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
      { id: "e1", title: "אירוע בדיקה", date: "2026-09-01T10:00:00", city: "חיפה", category: "market" },
    ]) }));
  await page.route("**/api/experiences*", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto(`${BASE}/he/events`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[role="tablist"] [role="tab"]');

  const MAIN = '[role="tablist"]:has([data-tab-value="events"])';
  const VIEW = '[role="tablist"]:has([data-tab-value="list"])';

  let s = await snapshot(page, MAIN, '[role="tab"]');
  control("main tablist is present with 2 tabs", [s.found, s.count], [true, 2]);
  check("main tablist — exactly one tab stop", singleTabStop(s), 1);
  check("main tablist — the tab stop is the selected tab", [s.tabindex, s.selected], [["0", "-1"], ["true", "false"]]);

  await page.locator(`${MAIN} [data-tab-value="events"]`).focus();
  await page.keyboard.press("ArrowLeft");
  s = await snapshot(page, MAIN, '[role="tab"]');
  check("ArrowLeft focuses the NEXT tab by name (RTL contract)", s.focusedValue, "experiences");
  check("ArrowLeft activates it — aria-selected follows focus", s.selected, ["false", "true"]);
  check("still exactly one tab stop after the move", singleTabStop(s), 1);

  await page.keyboard.press("ArrowRight");
  s = await snapshot(page, MAIN, '[role="tab"]');
  check("ArrowRight returns to the PREVIOUS tab by name", s.focusedValue, "events");

  await page.keyboard.press("End");
  s = await snapshot(page, MAIN, '[role="tab"]');
  check("End selects the last tab", [s.focusedValue, s.selected], ["experiences", ["false", "true"]]);
  await page.keyboard.press("Home");
  s = await snapshot(page, MAIN, '[role="tab"]');
  check("Home selects the first tab", [s.focusedValue, s.selected], ["events", ["true", "false"]]);

  const before = await snapshot(page, MAIN, '[role="tab"]');
  await page.keyboard.press("a");
  const after = await snapshot(page, MAIN, '[role="tab"]');
  control("an unhandled key moves nothing (negative control)",
    [after.focusedValue, after.selected], [before.focusedValue, before.selected]);

  await page.waitForSelector(VIEW);
  s = await snapshot(page, VIEW, '[role="tab"]');
  control("view toggle is present with 2 tabs", [s.found, s.count], [true, 2]);
  check("view toggle — exactly one tab stop", singleTabStop(s), 1);
  await page.locator(`${VIEW} [data-tab-value="list"]`).focus();
  await page.keyboard.press("ArrowLeft");
  s = await snapshot(page, VIEW, '[role="tab"]');
  check("view toggle — ArrowLeft moves to calendar and activates it",
    [s.focusedValue, s.selected], ["calendar", ["false", "true"]]);
  await page.keyboard.press("Home");
  s = await snapshot(page, VIEW, '[role="tab"]');
  check("view toggle — Home returns to list", [s.focusedValue, s.selected], ["list", ["true", "false"]]);
}

const SURFACES = { "events-tabs-keyboard": eventsTabs };

// The sandbox ships chromium-1194 while the repo pins a playwright that wants
// 1234; `npx playwright install` is not the move here (the environment provides
// the binary). Point at it explicitly, and let CHROMIUM_PATH override.
const EXECUTABLE = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: EXECUTABLE });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let exitCode = 0;
try {
  for (const [name, run] of Object.entries(SURFACES)) {
    if (only && only !== name) continue;
    await run(page);
    const dir = `${OUT}${name}`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/assertions.log`, `${lines.join("\n")}\n\n${failures} failed of ${lines.filter((l) => /^(PASS|FAIL)/.test(l)).length} assertions\n`, "utf8");
    log(`\nwrote ${dir}/assertions.log`);
  }
  // Derived, never stated: adding an assertion moves this number on its own.
  log(`\n${failures} failed of ${lines.filter((l) => /^(PASS|FAIL)/.test(l)).length} assertions`);
  if (failures) exitCode = 1;
} catch (err) {
  console.error(String(err));
  exitCode = 2;
} finally {
  await browser.close();
}
process.exit(exitCode);
