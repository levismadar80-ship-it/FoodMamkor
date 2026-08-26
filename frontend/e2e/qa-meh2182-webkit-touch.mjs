/**
 * MEH-2182 self-QA, WebKit half — the Safari-engine questions the Chromium
 * harness cannot answer. Run with the sandbox webkit build (docs/qa/webkit-local.md).
 *
 * WHAT THIS IS AND IS NOT. It does NOT clear carve-out (e): workflow.md is
 * explicit that Playwright WebKit is not iOS Safari and "the platform-specific
 * subset stays human". It exists to shrink the unknown from "unverified on any
 * Safari engine" to "verified on WebKit at iPhone 13 metrics; a real device is
 * still owed".
 *
 * THE QUESTION THAT MATTERS: does a vertical swipe that starts ON the pin still
 * scroll the page, or does the marker's drag handler swallow it? A 25x41 px
 * scroll trap in the middle of the registration form is the one way this feature
 * can break something that used to work.
 *
 * HOW IT IS MEASURED, AND WHY NOT THE OBVIOUS WAY. Dispatching synthetic touch
 * events and then reading `window.scrollY` would be worthless: browsers scroll
 * on real compositor input, so a synthetic swipe reports "did not scroll" in
 * BOTH worlds — a null that is also the alarming answer, which is the same
 * defect as a null that is also the reassuring one.
 *
 * So it measures the MECHANISM instead, which synthetic events do exercise
 * faithfully because it is the page's own listener that decides:
 *   1. `touch-action` computed on the marker element. `none` means the engine
 *      is told never to scroll from this element.
 *   2. whether a `touchmove` starting on the pin comes back `defaultPrevented`.
 *      A prevented touchmove is exactly how a handler suppresses scrolling.
 * Both are read off the real element in a real WebKit page.
 *
 * CONTROL (runs first, and voids the run): the identical probe is fired at an
 * ordinary paragraph in the same form. If THAT also reports prevented, the probe
 * cannot tell the pin apart from anything else and every number below is void.
 */
import { webkit } from "playwright";
import { existsSync, mkdirSync } from "node:fs";

const OUT = "../qa-artifacts/MEH-2182";
const BASE = "http://localhost:3000";
mkdirSync(OUT, { recursive: true });

const CITY = "זכרון יעקב";

let failures = 0;
// Counted, never stated — a literal goes stale the moment an assertion is
// added. Nothing reads the names, so this is a counter rather than a list.
let ran = 0;
function check(name, ok, detail = "") {
  ran++;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await webkit.launch();
const ctx = await browser.newContext({
  // Real iPhone 13 metrics — the device class the audience carries, and the
  // same profile the CI shadow job uses (e2e.yml webkit-iphone13).
  viewport: { width: 390, height: 664 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: "he-IL",
});
const page = await ctx.newPage();

await ctx.addInitScript(() => {
  try {
    localStorage.setItem("cookieConsent", "all");
  } catch {
    /* banner stays up; the shot will show it */
  }
});

await page.route("**/categories", (r) =>
  r.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify([{ id: 1, name: "חלב וגבינות", slug: "dairy" }]),
  }),
);
await page.route("**/nominatim.openstreetmap.org/**", (r) =>
  r.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify([
      {
        place_id: 1,
        display_name: `הנדיב 12, ${CITY}`,
        lat: "32.5731",
        lon: "34.9512",
        address: { road: "הנדיב", house_number: "12", city: CITY },
      },
    ]),
  }),
);
await page.route("**/places.googleapis.com/**", (r) =>
  r.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      formattedAddress: `הנדיב 12, ${CITY}`,
      location: { latitude: 32.5731, longitude: 34.9512 },
      addressComponents: [{ types: ["locality"], longText: CITY }],
    }),
  }),
);
await page.route("**/tile.openstreetmap.org/**", (r) =>
  r.fulfill({
    status: 200,
    contentType: "image/png",
    body: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    ),
  }),
);

await page.goto(`${BASE}/he/register/producer`, { waitUntil: "domcontentloaded" });
await page.getByTestId("register-preflight-start").click();
await page.getByTestId("register-account-name").fill("טסט בדיקה");
await page.getByTestId("register-account-email").fill(`qa2182wk+${Date.now()}@mehamakor.online`);
await page.getByTestId("register-account-password").fill("Abcdefgh1234");
await page.getByTestId("register-account-next").click();

await page.getByTestId("register-details-name").fill("העסק שלי");
await page.getByTestId("register-details-phone").fill("0501234567");
await page.getByTestId("register-details-city").getByRole("combobox").fill(CITY);
await page.getByTestId("register-details-address").fill("הנדיב 12");
// The suggestion is awaited by its own visibility rather than by a fixed pause.
// The pause conflated two DIFFERENT failures into one `false`: "the provider
// stub never produced a row" and "the confirmation block did not render" are
// separate bugs, and `.catch(() => {})` on the click swallowed the first so it
// surfaced as the second. Each now has its own named assertion, and the happy
// path gets faster rather than slower (the debounce is 450ms; the stub answers
// immediately). Bounded, never a wait on the network going quiet.
const suggestion = page.getByText("הנדיב 12", { exact: false }).last();
const suggested = await suggestion
  .waitFor({ state: "visible", timeout: 5000 })
  .then(() => true)
  .catch(() => false);
check("[webkit] the address suggestion appeared", suggested);
if (suggested) await suggestion.click();

const confirmed = await page
  .getByTestId("register-address-confirm")
  .waitFor({ state: "visible", timeout: 8000 })
  .then(() => true)
  .catch(() => false);
check("[webkit] the confirmation block renders on the Safari engine", confirmed);

const pin = page.locator(".leaflet-marker-icon").first();
const pinVisible = await pin
  .waitFor({ state: "visible", timeout: 8000 })
  .then(() => true)
  .catch(() => false);
check("[webkit] the pin renders", pinVisible);

// THE PROBE, and why it is not a simulated swipe.
//
// Two attempts at dispatching a synthetic touch sequence both failed on this
// engine, and the failures are the finding: WebKit rejects `new Touch(...)`
// with "Illegal constructor", and this build no longer exposes the legacy
// `initTouchEvent` either. There is no way to manufacture a trustworthy
// TouchEvent here — and a simulated swipe would have been weak evidence
// anyway, since browsers scroll on real compositor input rather than on
// dispatched events.
//
// So this measures the property that actually DECIDES whether the engine will
// scroll from a given element: `touch-action`. `none` on the marker (or on an
// ancestor it inherits through) means the engine is instructed never to scroll
// from a gesture starting there — that IS the scroll trap, in the only form
// that is observable without a finger.
//
// STATED LIMIT, because this is the half that matters and it is NOT answered
// here: a non-passive `touchmove` listener calling `preventDefault()` produces
// the same trap with `touch-action` untouched. Reading that requires either a
// real gesture or listener introspection the engine does not expose. That is
// precisely the residue carve-out (e) reserves for a real device, and nothing
// in this file shrinks it.
async function surfaceProbe(selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    const chain = [];
    for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
      chain.push({
        tag: node.tagName.toLowerCase(),
        cls: (node.className && String(node.className).slice(0, 60)) || "",
        touchAction: getComputedStyle(node).touchAction,
      });
      if (chain.length >= 4) break;
    }
    return {
      found: true,
      touchAction: getComputedStyle(el).touchAction,
      draggableClass: el.className.includes("leaflet-marker-draggable"),
      chain,
    };
  }, selector);
}

// CONTROL FIRST — an ordinary paragraph in the same form, read the same way.
// If it reports `none` too, the probe cannot tell the pin from anything else
// and every number below is void.
const control = await surfaceProbe('[data-testid="register-pin-drag-hint"]');
check(
  "[webkit] CONTROL: an ordinary paragraph does not carry touch-action:none",
  control.found === true && control.touchAction !== "none",
  JSON.stringify({ touchAction: control.touchAction }),
);

const onPin = await surfaceProbe(".leaflet-marker-icon");
check("[webkit] the pin element was reachable by the probe", onPin.found === true);

// Leaflet must actually have ARMED dragging on this engine — if it did not,
// the whole feature is dead on Safari and the trap question is moot.
check(
  "[webkit] Leaflet armed marker dragging (leaflet-marker-draggable present)",
  onPin.draggableClass === true,
  JSON.stringify(onPin.chain?.[0] ?? {}),
);

// THE HEADLINE, reported either way — a measurement, not a hope.
// `found` is part of the condition, not an aside. Measured while proving the
// suggestion assertion discriminates: with the provider returning zero rows the
// pin never renders, `onPin.touchAction` is `undefined`, `undefined === "none"`
// is false — and this headline reported PASS ("no scroll trap") off an element
// that does not exist. A green with two causes, in the one assertion the whole
// file exists to produce. It now requires the probe to have actually found the
// pin, so "nothing to measure" reds instead of reassuring.
const trapped = onPin.found !== true || onPin.touchAction === "none";
console.log(
  `\n  >>> touch-action on the pin: ${onPin.touchAction} ` +
    `(control paragraph: ${control.touchAction})\n` +
    `  >>> CSS-level scroll trap: ${trapped ? "PRESENT" : "absent"}\n` +
    `  >>> ancestor chain: ${JSON.stringify(onPin.chain)}\n` +
    `  >>> NOT measured here: a preventDefault() in a touchmove listener, which\n` +
    `      produces the same trap invisibly. That stays owed to a real device.\n`,
);
check(
  "[webkit] no CSS-level scroll trap on the pin",
  !trapped,
  `found=${onPin.found} touch-action=${onPin.touchAction}`,
);

await page.screenshot({ path: `${OUT}/webkit-iphone13-confirm.png`, fullPage: true });
await ctx.close();
await browser.close();

console.log(`\n${ran} assertions, ${failures} failed.`);
if (failures) {
  console.log("!! A control or a headline assertion failed — read the SCROLL TRAP line above.");
  process.exit(1);
}
