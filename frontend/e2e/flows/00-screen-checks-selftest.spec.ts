import { test, expect, type Page } from "./_cloudinary-stub";
import { screenChecks } from "../_screen-checks.mjs";

/**
 * MEH-3816 — self-test for `screenChecks`, the measurement the
 * screenshot-review skill runs on every captured screen. The skill reports
 * "nothing measurable found" on an empty list, so an empty list must mean
 * something: one clean page that has to come back empty, and one broken page
 * per check that has to come back naming that check. Real implementation, on
 * `page.setContent` fixtures — no server, no network.
 */

// 1×1 transparent PNG, so the clean page has an image that really loads.
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function doc(body: string): string {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>בדיקה</title>
<style>body{margin:0;font:16px sans-serif;color:#1c1a17;background:#f5f0e8}
button{min-width:48px;min-height:48px;background:#2e6853;color:#fff;border:0}</style></head>
<body><main><h1>כותרת</h1>${body}</main></body></html>`;
}

async function load(page: Page, html: string) {
  await page.setContent(html, { waitUntil: "load" });
  // Every <img> settled (loaded or failed) before measuring.
  await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete));
}

const CLEAN = `<p>מחיר: ₪45 · איסוף ב-18:00</p><img src="${PNG}" alt="תמונה" width="40" height="40"><button type="button">הזמנה</button>`;

test.describe("screenChecks self-test (MEH-3816)", () => {
  test("a clean page comes back with no problems", async ({ page }) => {
    await load(page, doc(CLEAN));
    const r = await screenChecks(page, "clean");
    expect(r.problems).toEqual([]);
  });

  test("a page wider than the screen is flagged as horizontal overflow", async ({ page }) => {
    await load(page, doc(`${CLEAN}<div style="width:3000px;height:10px;background:#2e6853"></div>`));
    const r = await screenChecks(page, "overflow");
    expect(r.problems.join("\n")).toContain("Horizontal overflow");
  });

  test("a 30px button is flagged as a small tap target", async ({ page }) => {
    await load(page, doc(`${CLEAN}<button type="button" style="min-width:0;min-height:0;width:30px;height:30px">x</button>`));
    const r = await screenChecks(page, "tap");
    expect(r.problems.join("\n")).toContain("Tap target <");
  });

  test("an image that fails to load is flagged as broken", async ({ page }) => {
    await load(page, doc(`${CLEAN}<img src="data:image/png;base64,AAAA" alt="שבורה" width="40" height="40">`));
    const r = await screenChecks(page, "broken");
    expect(r.problems.join("\n")).toContain("Broken image");
  });

  test("an image with no alt is flagged", async ({ page }) => {
    await load(page, doc(`${CLEAN}<img src="${PNG}" width="40" height="40">`));
    const r = await screenChecks(page, "alt");
    expect(r.problems.join("\n")).toContain("Image without alt");
  });

  test("text ending in a literal ... is flagged as truncation", async ({ page }) => {
    await load(page, doc(`${CLEAN}<p>ועוד הרבה דברים...</p>`));
    const r = await screenChecks(page, "ellipsis");
    expect(r.problems.join("\n")).toContain("Unintentional truncation");
  });

  test("content cut by overflow:hidden is flagged as clipped", async ({ page }) => {
    await load(page, doc(`${CLEAN}<div style="width:200px;overflow:hidden"><div style="width:600px;white-space:nowrap">טקסט ארוך שנחתך בקצה הקופסה בלי שום סימן</div></div>`));
    const r = await screenChecks(page, "clip");
    expect(r.problems.join("\n")).toContain("Clipped by overflow:hidden");
  });

  test("a dialog wider than the screen is flagged", async ({ page }) => {
    await load(page, doc(`${CLEAN}<div role="dialog" aria-label="חלון" style="position:fixed;top:0;left:0;width:3000px;height:100px;background:#fff"></div>`));
    const r = await screenChecks(page, "modal");
    expect(r.problems.join("\n")).toContain("Modal exceeds viewport");
  });

  test("a fixed header painted over the top of main is flagged", async ({ page }) => {
    await load(page, doc(`${CLEAN}<header style="position:fixed;top:0;inset-inline:0;height:80px;background:#2e6853"></header>`));
    const r = await screenChecks(page, "header");
    expect(r.problems.join("\n")).toContain("Header/footer overlaps body");
  });

  test("a fixed nav running past the bottom of the screen is flagged", async ({ page }) => {
    await load(page, doc(`${CLEAN}<nav aria-label="ניווט" style="position:fixed;inset-inline:0;bottom:-40px;height:80px;background:#2e6853"></nav>`));
    const r = await screenChecks(page, "nav");
    expect(r.problems.join("\n")).toContain("Nav/tab bar cut off");
  });

  test("a loading message is reported as still loading, not as truncation", async ({ page }) => {
    await load(page, doc(`${CLEAN}<p>טעינת נתונים…</p>`));
    const all = (await screenChecks(page, "loading")).problems.join("\n");
    expect(all).toContain("Still loading");
    expect(all).not.toContain("Unintentional truncation");
  });

  test("a link inside running text is exempt from the tap floor (DESIGN.md)", async ({ page }) => {
    await load(page, doc(`${CLEAN}<p>אפשר לקרוא עוד על כך <a href="#x">כאן</a> ובעמוד העזרה של האתר.</p>`));
    const r = await screenChecks(page, "inline");
    expect(r.problems).toEqual([]);
  });

  test("a hit area widened by ::before counts at its widened size", async ({ page }) => {
    const css = `<style>.hit{position:relative;min-width:0;min-height:0;width:24px;height:24px}.hit::before{content:"";position:absolute;top:-10px;bottom:-10px;left:-10px;right:-10px}</style>`;
    await load(page, doc(`${css}${CLEAN}<button type="button" class="hit">x</button>`));
    const r = await screenChecks(page, "pseudo");
    expect(r.problems).toEqual([]);
  });

  test("the tap floor is 44px on a phone and 32px on a desktop (DESIGN.md)", async ({ page }) => {
    const btn = `<button type="button" style="min-width:0;min-height:0;width:36px;height:36px">x</button>`;
    await page.setViewportSize({ width: 390, height: 844 });
    await load(page, doc(`${CLEAN}${btn}`));
    expect((await screenChecks(page, "phone")).problems.join("\n")).toContain("Tap target < 44px");
    await page.setViewportSize({ width: 1280, height: 800 });
    await load(page, doc(`${CLEAN}${btn}`));
    expect((await screenChecks(page, "desktop")).problems).toEqual([]);
  });

  test("pale text on a light background is flagged by axe color-contrast", async ({ page }) => {
    await load(page, doc(`${CLEAN}<p style="color:#cfcfcf;background:#ffffff">טקסט חיוור</p>`));
    const r = await screenChecks(page, "contrast");
    expect(r.problems.join("\n")).toContain("axe color-contrast");
  });
});
