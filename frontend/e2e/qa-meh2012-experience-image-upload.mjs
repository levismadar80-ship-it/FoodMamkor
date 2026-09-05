/**
 * MEH-2012 self-QA — the experience image field is an upload, not a URL box.
 *
 * Drives the REAL /he/experiences/new page in Chromium against a local
 * `next start`, with `/api/**` fulfilled from fixtures (the CC sandbox has no
 * backend and cannot reach Railway — CLAUDE.md "Known Bug Patterns"). The page
 * is auth-gated (`NewExperienceClient.jsx:24` redirects to /login without a
 * user), so a token is seeded and `GET /auth/me` is stubbed — the same pattern
 * as `e2e/qa-meh1638-settings-skeleton.mjs`.
 *
 * `POST /upload/image` is route-mocked in three shapes, because the three are
 * what the real endpoint can actually answer with and each drives a different
 * branch:
 *   - a Cloudinary `secure_url`            → the normal path
 *   - a RELATIVE `/placeholder-image.png?…` → upload.py:115, the dev/no-Cloudinary
 *     fallback. This one is the whole reason the client-side `new URL()` check
 *     had to go with the field: it THROWS on a relative path, so the old guard
 *     would have rejected the server's own success.
 *   - a 403 with a Hebrew `detail`          → upload.py:105, the free-plan cap
 *
 * Chromium emulation is LAYOUT evidence, not engine evidence. Nothing here
 * claims "נבדק בנייד" — what is covered is RTL layout, horizontal overflow
 * (measured, not eyeballed), and DOM/handler wiring.
 *
 * States captured per viewport: empty · uploading · uploaded · upload-error.
 *
 * Run manually:  node e2e/qa-meh2012-experience-image-upload.mjs
 * REUSES: e2e/qa-meh2014-map-manual-origin.mjs (harness shape).
 */
import { chromium, devices } from "@playwright/test";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-2012";
const BASE = "http://localhost:3100";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const CLOUD_URL = "https://res.cloudinary.com/demo/image/upload/v1/mehamakor/qa.jpg";
const RELATIVE_URL = "/placeholder-image.png?name=qa12345";
const CAP_DETAIL = "אפשר להעלות עד 3 תמונות לבית עסק. כדי להוסיף תמונה חדשה, הסירו קודם תמונה קיימת.";

const OWNER = {
  id: 43,
  name: "דמו בעלת עסק",
  email: "owner@example.com",
  role: "producer",
  is_verified: true,
  email_verified: true,
};

const PIXEL5 = devices["Pixel 5"].viewport;
const VIEWPORTS = [
  { tag: "390", width: 390, height: 844 },
  { tag: "pixel5", width: PIXEL5.width, height: PIXEL5.height },
  { tag: "1440", width: 1440, height: 900 },
];

let failures = 0;
const ran = [];
function check(ok, label, detail) {
  ran.push(label);
  console.log(`    ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` -> ${detail}` : ""}`);
  if (!ok) failures += 1;
}

/**
 * `upload` decides what POST /upload/image answers with:
 *   "cloud" | "relative" | "cap" | "hang"
 */
async function newContext(browser, vp, { upload = "cloud" } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    reducedMotion: "reduce",
  });
  await ctx.addInitScript(() => {
    localStorage.setItem("token", "qa-owner-token");
    localStorage.setItem("cookieConsent", "all");
  });

  await ctx.route("**/*", async (route) => {
    const url = route.request().url();
    if (!url.includes("/api/")) return route.continue();
    const path = new URL(url).pathname.replace(/^\/api/, "");

    if (path === "/upload/image") {
      if (upload === "hang") return new Promise(() => {}); // never settles
      if (upload === "cap") {
        return route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({ detail: CAP_DETAIL }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: upload === "relative" ? RELATIVE_URL : CLOUD_URL }),
      });
    }
    if (path === "/auth/me") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(OWNER),
      });
    }
    // The live moderation check must not verdict-REJECT and disable submit.
    if (path.startsWith("/experiences/validate")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "APPROVED" }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: path.startsWith("/cities") ? "[]" : "{}",
    });
  });
  return ctx;
}

async function openForm(ctx) {
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto(`${BASE}/he/experiences/new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  return { page, pageErrors };
}

const FILE_INPUT = "#experience-image";
const PREVIEW = 'img[src*="cloudinary"], img[src*="placeholder-image"]';
// Scoped to the page's own form: the FOOTER newsletter signup is also a
// `button[type="submit"]`, so the bare selector resolved to 2 and Playwright's
// strict mode (correctly) refused to guess which one the assertion meant.
const SUBMIT = '#main-content button[type="submit"]';

async function shoot(page, vpTag, name) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/${name}-${vpTag}.png`, fullPage: false });
}

/**
 * Horizontal overflow, MEASURED. An eyeballed screenshot cannot make this
 * claim — an overflowing child can sit off-screen and look fine in a
 * viewport-clipped shot.
 */
async function checkNoHorizontalScroll(page, label) {
  const m = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  check(m.scrollWidth <= m.clientWidth, `no horizontal scroll — ${label}`,
    `scrollWidth=${m.scrollWidth} clientWidth=${m.clientWidth}`);
}

/** A real file, handed to the real <input type="file">. */
async function attach(page) {
  await page.setInputFiles(FILE_INPUT, {
    name: "photo.jpg",
    mimeType: "image/jpeg",
    // 1x1 JPEG — enough for the browser; the endpoint is mocked anyway.
    buffer: Buffer.from(
      "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////" +
      "////////////////////////////////////////////////////wgALCAABAAEBAREA/8QA" +
      "FBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
      "base64",
    ),
  });
}

async function run(browser, vp) {
  console.log(`\n== /he/experiences/new @ ${vp.width}×${vp.height} (${vp.tag}) ==`);

  // ---- 1: empty + the field's shape --------------------------------------
  const ctx = await newContext(browser, vp, { upload: "cloud" });
  const { page, pageErrors } = await openForm(ctx);

  const dir = await page.evaluate(() => document.documentElement.getAttribute("dir"));
  check(dir === "rtl", "document direction is RTL", `dir=${dir}`);
  await checkNoHorizontalScroll(page, "empty form");

  const type = await page.locator(FILE_INPUT).getAttribute("type");
  check(type === "file", "the image field is a file input", `type=${type}`);

  // 🔴 The keyboard-reachability evidence the jsdom suite explicitly defers to
  // this harness, because jsdom loads no Tailwind and computes `hidden` and
  // `sr-only` identically. Here a stylesheet exists, so this measures the
  // rendered behaviour rather than the class string.
  //
  // `hidden` is display:none, which removes the input from the tab order — and
  // the wrapping <label> is not natively focusable, so the upload control was
  // unreachable without a mouse. `.focus()` is the discriminating probe: a
  // display:none element cannot become activeElement, so this goes red against
  // the pre-fix markup for the exact reason the fix exists.
  const display = await page
    .locator(FILE_INPUT)
    .evaluate((el) => getComputedStyle(el).display);
  check(display !== "none", "the file input is not display:none", `display=${display}`);
  const focusable = await page.locator(FILE_INPUT).evaluate((el) => {
    el.focus();
    return document.activeElement === el;
  });
  check(focusable, "the file input can take keyboard focus (WCAG 2.1.1)");

  const body = await page.locator("body").innerText();
  check(!/cloudinary/i.test(body), "the word 'Cloudinary' appears nowhere on the page");
  check(!/res\.cloudinary\.com/.test(body), "no CDN URL placeholder is shown to the owner");
  await shoot(page, vp.tag, "1-empty");

  // ---- 3: uploaded (Cloudinary URL) --------------------------------------
  await attach(page);
  await page.waitForTimeout(900);
  const previewCount = await page.locator(PREVIEW).count();
  check(previewCount === 1, "exactly one preview thumbnail after upload", `count=${previewCount}`);
  const src = await page.locator(PREVIEW).first().getAttribute("src");
  check(src === CLOUD_URL, "the preview shows the URL the endpoint returned", src);

  // The field-name label used to keep htmlFor="experience-image" in this state,
  // where that id no longer exists — a labelled control that is not on the page.
  // Asserted over every label in the document, so a future field cannot
  // reintroduce the same shape silently.
  const dangling = await page.evaluate(() =>
    [...document.querySelectorAll("label[for]")]
      .map((el) => el.getAttribute("for"))
      .filter((id) => document.getElementById(id) === null),
  );
  check(dangling.length === 0,
    "no label points at a missing id while the preview is showing", dangling.join(","));

  await shoot(page, vp.tag, "3-uploaded");
  await checkNoHorizontalScroll(page, "uploaded");

  // Remove returns the uploader.
  await page.locator('[data-testid="experience-image-remove"]').first().click();
  await page.waitForTimeout(400);
  check((await page.locator(PREVIEW).count()) === 0, "remove clears the preview");
  check((await page.locator(FILE_INPUT).count()) === 1, "remove restores the file input");
  check(pageErrors.length === 0, "0 page errors (upload context)", JSON.stringify(pageErrors));
  await ctx.close();

  // ---- 2: uploading (in flight) ------------------------------------------
  const hangCtx = await newContext(browser, vp, { upload: "hang" });
  const hang = await openForm(hangCtx);
  await attach(hang.page);
  await hang.page.waitForTimeout(600);
  const submitDisabled = await hang.page.locator(SUBMIT).isDisabled();
  check(submitDisabled, "submit is disabled while an upload is in flight");
  const submitText = (await hang.page.locator(SUBMIT).innerText()).trim();
  check(submitText.includes("מעלה"), "…and the button SAYS why, rather than greying silently", submitText);
  await shoot(hang.page, vp.tag, "2-uploading");
  await checkNoHorizontalScroll(hang.page, "uploading");
  check(hang.pageErrors.length === 0, "0 page errors (uploading context)", JSON.stringify(hang.pageErrors));
  await hangCtx.close();

  // ---- 4: upload error, with the endpoint's own Hebrew detail ------------
  const capCtx = await newContext(browser, vp, { upload: "cap" });
  const cap = await openForm(capCtx);
  await attach(cap.page);
  await cap.page.waitForTimeout(900);
  const capBody = await cap.page.locator("body").innerText();
  check(capBody.includes("אפשר להעלות עד 3 תמונות"), "the endpoint's own Hebrew detail is shown, not a generic string");
  check((await cap.page.locator(PREVIEW).count()) === 0, "no preview after a failed upload");
  check(!(await cap.page.locator(SUBMIT).isDisabled()), "the form is usable again after a failure");
  await shoot(cap.page, vp.tag, "4-upload-error");
  await checkNoHorizontalScroll(cap.page, "upload error");
  check(cap.pageErrors.length === 0, "0 page errors (error context)", JSON.stringify(cap.pageErrors));
  await capCtx.close();

  // ---- 5: the RELATIVE fallback the old URL check would have rejected ----
  // This is the regression the removed `new URL()` guard would have caused, so
  // it is asserted against the real page rather than argued in the PR body.
  const relCtx = await newContext(browser, vp, { upload: "relative" });
  const rel = await openForm(relCtx);
  await attach(rel.page);
  await rel.page.waitForTimeout(900);
  const relSrc = await rel.page.locator(PREVIEW).first().getAttribute("src");
  check(relSrc === RELATIVE_URL, "a RELATIVE placeholder URL is accepted and previewed", relSrc);
  check(!(await rel.page.locator(SUBMIT).isDisabled()),
    "…and submit is NOT blocked by it (the old new URL() check would have)");
  check(rel.pageErrors.length === 0, "0 page errors (relative-url context)", JSON.stringify(rel.pageErrors));
  await relCtx.close();
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  for (const vp of VIEWPORTS) await run(browser, vp);
  await browser.close();
  console.log(`\nScreenshots in ${OUT}`);
  console.log(`${ran.length} checks ran, ${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
