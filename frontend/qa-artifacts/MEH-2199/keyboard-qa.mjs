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
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

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

/**
 * Bounded CONDITION wait — true the moment `fn()` is truthy, false when the
 * bound expires. There are no fixed pauses left in this file.
 *
 * A fixed pause is wrong in both directions: too short and it reports a real
 * event as absent under CPU throttle, too long and every run pays for it. This
 * costs nothing on a healthy run and only caps the pathological one.
 *
 * To prove something did NOT happen, await the UNWANTED event and require it to
 * time out — deterministic in both worlds, and the bound is paid only when the
 * answer is genuinely "it did not happen", which is the case being asserted
 * (.claude/rules/testing.md — the inverted bounded wait).
 *
 * Raised by the CI reviewer on #3143 against the DELETE assertion; fixed at all
 * three sites rather than the one named — a finding is a sample, not an
 * inventory.
 */
const until = async (fn, timeout = 5_000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return Boolean(fn());
};

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

/**
 * /settings needs a signed-in user or the page redirects to /login. The token is
 * seeded into localStorage before any script runs and GET /auth/me is stubbed —
 * the sandbox has no backend to authenticate against, and driving the real login
 * form would be testing the login form rather than this tablist.
 */
async function settingsTabs(page) {
  log("\n=== /he/settings — profile|security tablist ===");
  await page.addInitScript(() => {
    try { localStorage.setItem("token", "qa-token"); } catch { /* private mode */ }
  });
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      id: "u1", name: "\u05e1\u05de\u05d3\u05e8", email: "s@example.com", city: "\u05d7\u05d9\u05e4\u05d4", phone: "", role: "user",
    }) }));
  await page.goto(`${BASE}/he/settings`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[role="tablist"] [role="tab"]');

  const LIST = '[role="tablist"]:has([data-tab-value="profile"])';
  let s = await snapshot(page, LIST, '[role="tab"]');
  control("settings tablist is present with 2 tabs", [s.found, s.count], [true, 2]);
  check("exactly one tab stop", singleTabStop(s), 1);
  check("the tab stop is the selected tab", [s.tabindex, s.selected], [["0", "-1"], ["true", "false"]]);

  await page.locator(`${LIST} [data-tab-value="profile"]`).focus();
  await page.keyboard.press("ArrowLeft");
  s = await snapshot(page, LIST, '[role="tab"]');
  check("ArrowLeft focuses the NEXT tab by name (RTL contract)", s.focusedValue, "security");
  check("ArrowLeft activates it — aria-selected follows focus", s.selected, ["false", "true"]);
  check("still exactly one tab stop after the move", singleTabStop(s), 1);
  // aria-selected is a CLAIM; the rendered panel is the outcome. The password
  // form exists only on the security side, so this separates "the ARIA flipped"
  // from "the page actually switched".
  check("the security PANEL rendered, not just the ARIA state",
    await page.locator("#sec-current").count(), 1);
  // The URL mirror lives inside selectTab — proof the real activator ran, and
  // not a lookalike that only repainted the tabs.
  check("the URL mirror followed the keyboard switch",
    new URL(page.url()).searchParams.get("tab"), "security");

  await page.keyboard.press("ArrowRight");
  s = await snapshot(page, LIST, '[role="tab"]');
  check("ArrowRight returns to the PREVIOUS tab by name", s.focusedValue, "profile");
  await page.keyboard.press("End");
  s = await snapshot(page, LIST, '[role="tab"]');
  check("End selects the last tab", [s.focusedValue, s.selected], ["security", ["false", "true"]]);
  await page.keyboard.press("Home");
  s = await snapshot(page, LIST, '[role="tab"]');
  check("Home selects the first tab", [s.focusedValue, s.selected], ["profile", ["true", "false"]]);

  const before = await snapshot(page, LIST, '[role="tab"]');
  await page.keyboard.press("a");
  const after = await snapshot(page, LIST, '[role="tab"]');
  control("an unhandled key moves nothing (negative control)",
    [after.focusedValue, after.selected], [before.focusedValue, before.selected]);
}

/**
 * The producer dashboard needs a signed-in producer AND a dashboard payload.
 * Both are stubbed: the sandbox has no backend, and the subject here is the
 * radio group's keyboard behaviour, not the fetch.
 */
async function dashboardRadios(page) {
  log("\n=== /he/producer/dashboard — availability radiogroup ===");
  await page.addInitScript(() => {
    try { localStorage.setItem("token", "qa-token"); } catch { /* private mode */ }
  });

  const posted = [];
  // ORDER MATTERS, AND IT IS THE REVERSE OF THE OBVIOUS ONE. Playwright checks
  // page.route handlers in the REVERSE order they were registered, so the LAST
  // one added wins. Registering the catch-all last therefore swallows /auth/me
  // and the dashboard payload, the page redirects to /login, and the harness
  // reports "radiogroup never appeared" — a dead probe wearing the costume of a
  // finding. Measured: that is exactly what happened on the first run here.
  // Catch-all FIRST, specific routes after.
  await page.route("**/api/**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "null" }));
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      id: 1, name: "\u05d3\u05e0\u05d4", email: "d@example.com", role: "producer", producer_id: "p1",
    }) }));
  await page.route("**/api/producers/me/dashboard", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      producer: { id: 1, name: "\u05e2\u05e1\u05e7", status: "approved", availability_state: "accepting_orders" },
    }) }));
  await page.route("**/api/producers/me/availability-state", async (r) => {
    posted.push(r.request().postDataJSON());
    await r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.goto(`${BASE}/he/producer/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[role="radiogroup"] [role="radio"]');

  const GROUP = '[role="radiogroup"]';
  let s = await snapshot(page, GROUP, '[role="radio"]');
  control("radiogroup is present with 4 radios", [s.found, s.count], [true, 4]);
  check("exactly one tab stop", singleTabStop(s), 1);
  check("the tab stop is the checked radio",
    [s.tabindex, s.selected], [["0", "-1", "-1", "-1"], ["true", "false", "false", "false"]]);

  await page.locator(`${GROUP} [data-radio-value="accepting_orders"]`).focus();
  await page.keyboard.press("ArrowLeft");
  s = await snapshot(page, GROUP, '[role="radio"]');
  check("ArrowLeft focuses the NEXT radio by name (RTL contract)", s.focusedValue, "available_today");
  check("and SELECTS it — aria-checked follows focus", s.selected, ["false", "true", "false", "false"]);
  check("still exactly one tab stop after the move", singleTabStop(s), 1);
  await until(() => posted.length > 0);
  // The POST is what separates "really selected" from "only repainted".
  check("the availability POST fired once, carrying that state",
    posted.map((b) => b?.state), ["available_today"]);

  await page.keyboard.press("ArrowRight");
  s = await snapshot(page, GROUP, '[role="radio"]');
  check("ArrowRight returns to the PREVIOUS radio by name", s.focusedValue, "accepting_orders");
  await page.keyboard.press("ArrowDown");
  s = await snapshot(page, GROUP, '[role="radio"]');
  check("ArrowDown is next (vertical axis unmirrored)", s.focusedValue, "available_today");
  await page.keyboard.press("ArrowUp");
  s = await snapshot(page, GROUP, '[role="radio"]');
  check("ArrowUp is previous", s.focusedValue, "accepting_orders");

  // The behaviour most at risk of being broken by an a11y change: arrowing onto
  // vacation must REVEAL the date field and post NOTHING, exactly as a click
  // does (MEH-999 reveal-then-confirm).
  const postsBefore = posted.length;
  await page.keyboard.press("ArrowRight"); // wraps backwards onto on_vacation
  s = await snapshot(page, GROUP, '[role="radio"]');
  check("wrapping backwards lands on vacation", s.focusedValue, "on_vacation");
  // Bounded wait, not a bare count(): the reveal is a React state update, and a
  // single immediate poll measures the harness's timing rather than the page.
  // The bound is far above a healthy render, so it changes nothing on a good run
  // and only caps the pathological one (.claude/rules/testing.md — the
  // sanctioned form of a wait).
  const revealed = await page
    .waitForSelector("#vacation-until", { timeout: 5_000 })
    .then(() => 1)
    .catch(() => 0);
  check("vacation REVEALED the return-date field", revealed, 1);
  // Inverted bounded wait: await the POST that must NOT happen and require
  // it to time out. With the bug it resolves instantly; without it, false
  // after the bound — and no fixed pause on any healthy path.
  const strayPost = await until(() => posted.length > postsBefore, 1_500);
  check("and posted NOTHING — reveal-then-confirm survives the keyboard path",
    strayPost, false);

  const before = await snapshot(page, GROUP, '[role="radio"]');
  await page.keyboard.press("a");
  const after = await snapshot(page, GROUP, '[role="radio"]');
  control("an unhandled key moves nothing (negative control)",
    [after.focusedValue, after.selected], [before.focusedValue, before.selected]);
}

/**
 * The cancel-commitment dialog is auth-gated AND commit-gated: the CTA only
 * renders for a signed-in user who has already committed to an open group buy.
 * Both are stubbed — the subject is the dialog's keyboard behaviour, not the
 * fetch.
 *
 * The CTA is located by its REAL rendered Hebrew string, read from
 * messages/he.json rather than hardcoded here, so a copy change renames the
 * locator instead of silently breaking it. Adding a data-testid would have been
 * the other option and was rejected: it is markup this ticket has no business
 * adding, and the zero-visual-delta claim is easier to defend without it.
 */
async function groupBuyModal(page) {
  log("\n=== /he/group-buys/gb-1 — cancel-commitment dialog ===");
  const he = JSON.parse(readFileSync(new URL("../../messages/he.json", import.meta.url), "utf8"));
  const CTA = he.group_buys.detail.cancel_cta;
  const DISMISS = he.group_buys.detail.cancel_dismiss;

  await page.addInitScript(() => {
    try { localStorage.setItem("token", "qa-token"); } catch { /* private mode */ }
  });

  const deletes = [];
  // Catch-all FIRST — Playwright matches route handlers in REVERSE registration
  // order, so the LAST one registered wins. Getting this backwards on the
  // dashboard surface produced a dead probe that read like a real finding.
  await page.route("**/api/**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "null" }));
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      id: 1, name: "\u05d3\u05e0\u05d4", email: "d@example.com", role: "user", phone: "0500000000",
    }) }));
  await page.route("**/api/group-buys/gb-1", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      id: "gb-1", title: "\u05e7\u05d1\u05d5\u05e6\u05ea \u05e8\u05db\u05e9", status: "open",
      deadline: "2099-01-01T00:00:00Z", min_participants: 2, max_participants: 10,
      commits_count: 1, price_per_unit_regular: 100, price_per_unit_group: 80,
      user_committed: true, user_commit: { quantity: 1 },
    }) }));
  await page.route("**/api/group-buys/gb-1/commit", async (r) => {
    if (r.request().method() === "DELETE") deletes.push(1);
    await r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.goto(`${BASE}/he/group-buys/gb-1`, { waitUntil: "domcontentloaded" });

  const DIALOG = '[role="dialog"][aria-modal="true"]';
  // The page CTA. Resolved with the dialog CLOSED, when it is the only button
  // carrying this label — the dialog's confirm button shares it. A
  // `button:not(<dialog> button)` compound was tried first and matched nothing;
  // the CTA was on the page the whole time, so that read as "the auth/commit
  // gates failed" when it was purely a bad selector.
  const cta = page.getByRole("button", { name: CTA }).first();

  // CONTROLS. Without the CTA and the dialog, "focus did not move" below would
  // be indistinguishable from a real finding, and the run would print a column
  // of reassuring nulls.
  //
  // The wait is not optional and is not belt-and-braces: the group buy arrives
  // by fetch, so a bare count() here polls ONCE, before the CTA exists, and
  // reports 0 — which reads as "the auth/commit gates failed". That is the same
  // mistake the dashboard surface's vacation assertion made, in the one place
  // where it would have voided the entire run.
  const ctaAppeared = await cta
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => 1)
    .catch(() => 0);
  control("the cancel CTA rendered (auth + commit gates satisfied)", ctaAppeared, 1);
  await cta.focus();
  control("the trigger holds focus before the dialog opens",
    await page.evaluate((label) => document.activeElement?.textContent?.trim() === label, CTA), true);

  await page.keyboard.press("Enter");
  await page.waitForSelector(DIALOG);
  control("the dialog opened", await page.locator(DIALOG).count(), 1);

  const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const focusState = (label) =>
    page.evaluate(([sel, foc, lbl]) => {
      const d = document.querySelector(sel);
      const els = [...(d?.querySelectorAll(foc) ?? [])];
      return {
        insideDialog: Boolean(d && d.contains(document.activeElement)),
        indexInDialog: els.indexOf(document.activeElement),
        count: els.length,
        onTrigger: document.activeElement?.textContent?.trim() === lbl,
      };
    }, [DIALOG, FOCUSABLE, label]);

  let f = await focusState(CTA);
  check("focus moved INTO the dialog, onto its first control",
    [f.insideDialog, f.indexInDialog], [true, 0]);

  // Tab off the LAST control must wrap to the first rather than escape into the
  // page the aria-modal claims is inert.
  await page.evaluate(([sel, foc]) => {
    const els = [...document.querySelector(sel).querySelectorAll(foc)];
    els.at(-1).focus();
  }, [DIALOG, FOCUSABLE]);
  await page.keyboard.press("Tab");
  f = await focusState(CTA);
  check("Tab off the last control wraps to the first — it does not escape",
    [f.insideDialog, f.indexInDialog], [true, 0]);

  await page.keyboard.press("Shift+Tab");
  f = await focusState(CTA);
  check("Shift+Tab off the first wraps to the last",
    [f.insideDialog, f.indexInDialog], [true, f.count - 1]);

  await page.keyboard.press("Escape");
  await page.waitForSelector(DIALOG, { state: "detached" });
  check("Escape closed the dialog", await page.locator(DIALOG).count(), 0);
  f = await focusState(CTA);
  check("focus came home to the trigger that opened it", f.onTrigger, true);
  // The reason MEH-1250 built this dialog at all: closing is never confirming.
  check("Escape deleted NOTHING", deletes.length, 0);

  // Dismiss is a second close path and must return focus too — three paths
  // close this dialog and only one of them is Escape.
  await page.keyboard.press("Enter");
  await page.waitForSelector(DIALOG);
  await page.locator(`${DIALOG} button`, { hasText: DISMISS }).first().click();
  await page.waitForSelector(DIALOG, { state: "detached" });
  f = await focusState(CTA);
  check("the dismiss button returns focus to the trigger as well", f.onTrigger, true);
  check("dismiss deleted NOTHING", deletes.length, 0);

  // And the destructive path still works — an a11y layer that quietly broke it
  // would pass every assertion above.
  await page.keyboard.press("Enter");
  await page.waitForSelector(DIALOG);
  await page.locator(`${DIALOG} button`, { hasText: CTA }).first().click();
  await until(() => deletes.length > 0);
  check("confirming still DELETEs — the destructive path is untouched", deletes.length, 1);
}

const SURFACES = {
  "events-tabs-keyboard": eventsTabs,
  "settings-tabs-keyboard": settingsTabs,
  "dashboard-radiogroup-arrows": dashboardRadios,
  "groupbuy-modal-a11y": groupBuyModal,
};

// The sandbox ships chromium-1194 while the repo pins a playwright that wants
// 1234; `npx playwright install` is not the move here (the environment provides
// the binary). Point at it explicitly.
//
// Deliberately NOT read from an env var. The first draft accepted a
// CHROMIUM_PATH override and the `Env drift (.env.example)` gate reddened the
// PR for it — correctly: `check_env_drift.sh` scans all code, a QA script
// included, and every var it finds must be documented. Documenting one would
// mean adding an app-config entry for a convenience nobody asked for
// (regression rule 8). A literal with a comment is the cheaper honest answer.
const CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: CHROMIUM });
let exitCode = 0;
try {
  for (const [name, run] of Object.entries(SURFACES)) {
    if (only && only !== name) continue;
    // A fresh context per surface. Routes, localStorage and the URL from one
    // surface must not leak into the next and quietly satisfy its controls.
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    lines.length = 0;
    failures = 0;
    await run(page);
    await context.close();
    const dir = `${OUT}${name}`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/assertions.log`, `${lines.join("\n")}\n\n${failures} failed of ${lines.filter((l) => /^(PASS|FAIL)/.test(l)).length} assertions\n`, "utf8");
    log(`\nwrote ${dir}/assertions.log`);
  }
  // Derived, never stated: adding an assertion moves this number on its own.
  if (failures) exitCode = 1;
} catch (err) {
  console.error(String(err));
  exitCode = 2;
} finally {
  await browser.close();
}
process.exit(exitCode);
