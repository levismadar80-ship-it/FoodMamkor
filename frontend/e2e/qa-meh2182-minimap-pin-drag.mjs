/**
 * MEH-2182 self-QA — the draggable confirmation pin, driven against the REAL
 * built wizard (npx next start) at 375 and 1440.
 *
 * WHY THIS HARNESS EXISTS and the unit tests are not enough: every assertion
 * about the drag itself is unavailable in jsdom. `MiniMap.test.jsx` stubs
 * react-leaflet, so it can prove the component PASSES `draggable` and BINDS
 * `dragend` — it cannot prove Leaflet then makes the pin draggable, and in
 * particular it cannot see the one thing most likely to be wrong here: the
 * inline confirmation map is deliberately frozen (`InteractionMode` disables
 * `map.dragging`), and the claim in MiniMap.jsx is that `marker.dragging` is a
 * DIFFERENT handler that survives that. That claim is either true in a real
 * browser or it is not, and only this file can tell.
 *
 * The provider is STUBBED for the same two reasons as the MEH-2181 harness:
 * the sandbox cannot reach either provider host, and the subject is the app's
 * behaviour, not the geocoder's accuracy. Both providers are stubbed so the
 * run reports the same thing on a machine that carries a Google key.
 *
 * BEFORE COMMITTING: this writes raw PNGs. Run
 *   node scripts/compress-qa-screenshots.mjs ../qa-artifacts/MEH-2182/
 * and then DELETE the .png files — the helper writes .webp beside them rather
 * than replacing them, and every re-run re-creates the sources.
 *
 * CONTROLS (run before anything is believed, and they void the run when they
 * fail — a screenshot of a page where the drag silently no-op'd looks exactly
 * like a screenshot of a working one):
 *   1. the pin's on-screen position must CHANGE across the drag. Without it,
 *      "the address text did not get rewritten" and "no geocode fired" are
 *      both trivially true of a drag that never happened.
 *   2. the geocode request counter must be demonstrably NON-zero during the
 *      typing phase before it is quoted as zero across the drag. A counter
 *      that never wired up reports 0 for both, which is the reassuring answer.
 *   3. all four captures must be distinct images.
 */
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";

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

const SANDBOX_CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch(
  existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {},
);

async function run(width, tag) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 2,
    locale: "he-IL",
  });
  const page = await ctx.newPage();

  let geocodeCalls = 0;

  await page.route("**/categories", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: 1, name: "חלב וגבינות", slug: "dairy" }]),
    }),
  );

  await page.route("**/nominatim.openstreetmap.org/**", (r) => {
    geocodeCalls++;
    return r.fulfill({
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
    });
  });

  await page.route("**/places.googleapis.com/**", (r) => {
    geocodeCalls++;
    const url = r.request().url();
    if (url.includes(":autocomplete")) {
      return r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          suggestions: [
            {
              placePrediction: {
                placeId: "qa-meh2182-place",
                text: { text: `הנדיב 12, ${CITY}` },
                structuredFormat: {
                  mainText: { text: "הנדיב 12" },
                  secondaryText: { text: CITY },
                },
              },
            },
          ],
        }),
      });
    }
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        formattedAddress: `הנדיב 12, ${CITY}`,
        location: { latitude: 32.5731, longitude: 34.9512 },
        addressComponents: [
          { types: ["route"], longText: "הנדיב" },
          { types: ["locality"], longText: CITY },
        ],
      }),
    });
  });

  // Map tiles never load in this sandbox; fulfil them so the map lays out and
  // the pin is positioned rather than sitting in a permanently-pending frame.
  await page.route("**/tile.openstreetmap.org/**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "image/png",
      // 1×1 transparent PNG
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64",
      ),
    }),
  );

  // The cookie banner is bottom-fixed and, at 375, sits exactly over the drag
  // hint — the artifact is meant to be READ, so pre-consent it. Set before the
  // first paint so the banner never mounts (CookieBanner.jsx:30 reads this key).
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("cookieConsent", "all");
    } catch {
      /* private mode — the banner just stays up, which the shot will show */
    }
  });

  await page.goto(`${BASE}/he/register/producer`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("register-preflight-start").click();
  await page.getByTestId("register-account-name").fill("טסט בדיקה");
  await page.getByTestId("register-account-email").fill(`qa2182+${Date.now()}@mehamakor.online`);
  await page.getByTestId("register-account-password").fill("Abcdefgh1234");
  await page.getByTestId("register-account-next").click();

  await page.getByTestId("register-details-name").fill("העסק שלי");
  await page.getByTestId("register-details-phone").fill("0501234567");
  await page.getByTestId("register-details-city").getByRole("combobox").fill(CITY);

  const addr = page.getByTestId("register-details-address");
  await addr.fill("הנדיב 12");
  // Await the suggestion itself, not a fixed pause — same reasoning as the
  // WebKit harness: "the stub produced no row" and "the confirm block did not
  // render" are different bugs and must not collapse into one `false`. It also
  // makes the geocode-counter control below meaningful, since a visible row
  // proves the request actually went out.
  const suggestion = page.getByText("הנדיב 12", { exact: false }).last();
  const suggested = await suggestion
    .waitFor({ state: "visible", timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  check(`[${tag}] the address suggestion appeared`, suggested);

  // CONTROL 2 (positive half) — the counter is wired. If this is 0 the "no
  // geocode on drag" assertion below is measuring a dead probe, not the app.
  const callsAfterTyping = geocodeCalls;
  check(
    `[${tag}] CONTROL: the geocode probe fired during typing`,
    callsAfterTyping > 0,
    `calls=${callsAfterTyping}`,
  );

  if (suggested) await suggestion.click();
  const confirmed = await page
    .getByTestId("register-address-confirm")
    .waitFor({ state: "visible", timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  check(`[${tag}] the address confirmation block rendered`, confirmed);

  const hint = page.getByTestId("register-pin-drag-hint");
  check(
    `[${tag}] the drag hint is visible`,
    await hint.isVisible().catch(() => false),
    (await hint.textContent().catch(() => "")) ?? "",
  );

  const confirmLine = page.getByTestId("register-address-confirm");
  const textBefore = ((await confirmLine.textContent()) ?? "").trim();
  check(
    `[${tag}] before the drag the line reads the ORIGINAL confirmation`,
    !textBefore.includes("עודכן ידנית"),
    textBefore.slice(0, 60),
  );

  const addressBefore = await addr.inputValue();
  await confirmLine.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/pin-before-${tag}.png`, fullPage: true });

  // The real thing: drag the Leaflet marker with a real mouse gesture.
  const pin = page.locator(".leaflet-marker-icon").first();
  await pin.waitFor({ state: "visible", timeout: 8000 });
  // The pin must be INSIDE the viewport before a mouse is aimed at it. At 1440
  // the confirmation map sits below the fold, and the first version of this
  // harness aimed at y=917 in a 900px window: the gesture landed nowhere, no
  // drag happened, and the "did it move" control passed anyway because the
  // later scrollIntoViewIfNeeded moved the pin ON SCREEN. Two causes, one
  // green — which is the exact failure this file's controls exist to prevent.
  await pin.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);

  const box = await pin.boundingBox();
  const viewport = page.viewportSize();
  check(
    `[${tag}] CONTROL: the pin is inside the viewport before the gesture`,
    box !== null && box.y >= 0 && box.y + box.height <= viewport.height,
    JSON.stringify(box),
  );

  // Position is read off the marker's own Leaflet transform, which lives in
  // MAP-PANE coordinates — unaffected by page scroll, so a scroll cannot
  // satisfy this control the way it satisfied the previous one. Comparing the
  // delta against the gesture additionally proves the movement was MINE.
  const readPinOffset = () =>
    pin.evaluate((el) => {
      const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
      return { x: m.m41, y: m.m42 };
    });

  const DRAG_DX = 60;
  const DRAG_DY = 40;
  const offsetBefore = await readPinOffset();
  const callsBeforeDrag = geocodeCalls;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // Several steps: Leaflet starts a drag only after it clears its tolerance.
  await page.mouse.move(box.x + box.width / 2 + DRAG_DX, box.y + box.height / 2 + DRAG_DY, {
    steps: 12,
  });
  await page.mouse.up();
  await page.waitForTimeout(600);

  const offsetAfter = await readPinOffset();
  const dx = offsetAfter.x - offsetBefore.x;
  const dy = offsetAfter.y - offsetBefore.y;
  // CONTROL 1 — everything below is worthless if the pin never moved, and the
  // tolerance is tight enough that only the gesture above can produce it.
  check(
    `[${tag}] CONTROL: the pin followed the drag by the gesture's own delta`,
    Math.abs(dx - DRAG_DX) <= 8 && Math.abs(dy - DRAG_DY) <= 8,
    `expected ≈(${DRAG_DX}, ${DRAG_DY}), got (${dx.toFixed(1)}, ${dy.toFixed(1)})`,
  );

  const textAfter = ((await confirmLine.textContent()) ?? "").trim();
  check(
    `[${tag}] the confirmation line switched to the adjusted copy`,
    textAfter.includes("המיקום עודכן ידנית על המפה"),
    textAfter.slice(0, 60),
  );

  check(
    `[${tag}] the address TEXT is untouched by the drag`,
    (await addr.inputValue()) === addressBefore,
    `"${addressBefore}" → "${await addr.inputValue()}"`,
  );

  // CONTROL 2 (negative half) — quotable only because the positive half above
  // proved the counter increments at all.
  check(
    `[${tag}] the drag fired NO geocode request (no reverse-geocode)`,
    geocodeCalls === callsBeforeDrag,
    `${callsBeforeDrag} → ${geocodeCalls}`,
  );

  // The frozen inline map must still be frozen: marker.dragging is enabled,
  // map.dragging is not. Read off the live Leaflet container, not off props.
  const mapPanned = await page.evaluate(() => {
    const pane = document.querySelector(".leaflet-map-pane");
    return pane ? getComputedStyle(pane).transform : "missing";
  });
  check(
    `[${tag}] the map pane is present (surface rendered)`,
    mapPanned !== "missing",
    mapPanned,
  );

  check(
    `[${tag}] the step is still advanceable (nothing blocks on an adjusted pin)`,
    await page.getByTestId("register-details-next").isEnabled(),
  );

  await confirmLine.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/pin-after-${tag}.png`, fullPage: true });

  await ctx.close();
}

await run(375, "375");
await run(1440, "1440");
await browser.close();

// CONTROL 3 — four distinct images. A byte-identical pair means one capture
// photographed the same frame twice (the MEH-2183 duplicate-artifact lesson).
const shots = ["pin-before-375.png", "pin-after-375.png", "pin-before-1440.png", "pin-after-1440.png"];
const digests = shots.map((f) => createHash("sha256").update(readFileSync(`${OUT}/${f}`)).digest("hex"));
check(
  "CONTROL: all four captures are distinct images",
  new Set(digests).size === shots.length,
  digests.map((d, i) => `${shots[i]}=${d.slice(0, 8)}`).join(" "),
);

console.log(`\n${ran} assertions, ${failures} failed.`);
if (failures) {
  console.log("!! Screenshots in this run are VOID — a control failed.");
  process.exit(1);
}
