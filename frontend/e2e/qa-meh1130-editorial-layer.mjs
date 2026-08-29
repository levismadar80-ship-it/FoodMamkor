/**
 * MEH-1130 self-QA capture (375 + 1440).
 *
 * The script READS THE DOM in the run that takes each picture and REFUSES TO
 * WRITE a file whose subject is absent. A screenshot proves pixels, not
 * structure — a harness that logged six successes while photographing an error
 * boundary is a documented failure here (#2786), and "the file exists" is
 * exactly the null that doubles as the reassuring answer.
 *
 * CONTROL FIRST: probe 0 asserts something true of ANY healthy render of this
 * page. If it fails, every later null in the run is void and nothing is written.
 *
 * TWO PASSES, and the reason is a sandbox limit, not a preference. Cloudinary
 * is egress-blocked here — `curl` on the delivered transform returns 000 for
 * ALL FOUR assets — so pass 1 photographs the page as this machine can actually
 * serve it: empty tonal plates where the photographs go. Pass 2 fulfils the
 * /_next/image route with a locally generated tile so the LAYOUT is legible.
 * Pass-2 frames are named `-stubbed-images` and the tile is a flat colour that
 * could not be mistaken for a photograph: they are evidence of GEOMETRY, never
 * of what the pictures look like. The geometric claim is also asserted
 * numerically below, so it does not rest on anyone's reading of a PNG.
 */
import { chromium } from "@playwright/test";

// Repo-root qa-artifacts/, not frontend/qa-artifacts/ — that is where the
// "qa-artifacts size cap" CI job looks, and resolving it from this file's own
// location means the harness lands in the same place from either cwd.
const OUT = new URL("../../qa-artifacts/MEH-1130/", import.meta.url).pathname;
const PAGE_URL = "http://localhost:3000/about";
const failures = [];
const ran = [];

function check(name, cond, detail = "") {
  ran.push(name);
  if (!cond) failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`${cond ? "  ok  " : " FAIL "} ${name}${detail ? ` :: ${detail}` : ""}`);
  return cond;
}

// 2x2 olive PNG, scaled by the browser. Flat colour on purpose.
const TILE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAF0lEQVR4nGN0" +
  "9Nn5n4GBgYGJAQmgcQADAA5PAf9k1sYwAAAAAElFTkSuQmCC",
  "base64",
);

async function shoot(page, file, locator) {
  if (!locator) {
    await page.screenshot({ path: `${OUT}${file}`, fullPage: true });
  } else {
    const n = await locator.count();
    if (!check(`writable:${file}`, n === 1, `subject count=${n}`)) return;
    await locator.screenshot({ path: `${OUT}${file}` });
  }
  console.log(`       wrote qa-artifacts/MEH-1130/${file}`);
}

const browser = await chromium.launch({
  // The sandbox ships Chromium build 1194 while this repo pins a
  // @playwright/test whose bundled build is 1234, so the default path is absent.
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--ssl-version-max=tls1.2"],
});

for (const stub of [false, true]) {
  for (const [label, width, height] of [["375", 375, 812], ["1440", 1440, 900]]) {
    const tag = stub ? `${label}-stubbed-images` : label;
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    if (stub) {
      await page.route("**/_next/image**", (route) =>
        route.fulfill({ status: 200, contentType: "image/png", body: TILE }));
    }
    await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("h1", { timeout: 15000 });
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 500));
    });

    // ---- probe 0: THE CONTROL ---------------------------------------------
    if (!check(`${tag}/CONTROL story heading renders`,
      (await page.getByText("למה הקמתי את מהמקור", { exact: true }).count()) > 0)) {
      console.error(`\n!! CONTROL FAILED at ${tag}. Every null in this run is void. Nothing written.`);
      process.exit(1);
    }

    // ---- structure ---------------------------------------------------------
    // MEH-2211 repointed these. The side-bleed figure became the LEDE figure
    // above the story, and the bread band was removed outright — so the band
    // assertion inverts from "is present" to "is gone" rather than being
    // deleted: an assertion that stops existing cannot notice the band coming
    // back, and its absence is now the thing worth guarding.
    const fig = page.getByTestId("about-lede-figure");
    const box = page.getByTestId("about-lede-image-box");
    const duo = page.getByTestId("about-band-duo");
    const sig = page.getByTestId("about-signature");
    check(`${tag}/lede figure`, (await fig.count()) === 1);
    check(`${tag}/bread band REMOVED (MEH-2211)`,
      (await page.getByTestId("about-band-bread").count()) === 0);
    check(`${tag}/duo band`, (await duo.count()) === 1);
    check(`${tag}/signature block`, (await sig.count()) === 1);
    check(`${tag}/founder portrait ABSENT`,
      (await page.getByRole("img", { name: "ספיר, מייסדת מהמקור" }).count()) === 0);
    check(`${tag}/no img answers to the old portrait alt anywhere`,
      (await page.locator('img[alt="ספיר, מייסדת מהמקור"]').count()) === 0);
    for (const num of ["01", "02", "03", "04", "05"]) {
      const c = await page.getByText(`${num} · `, { exact: false }).count();
      check(`${tag}/chapter ${num}`, c === 1, `count=${c}`);
    }
    // the pictures themselves only resolve when they can load
    if (stub) {
      check(`${tag}/story <img> renders when the asset loads`,
        (await page.locator('img[alt="תוצרת צבעונית בסלים בשוק איכרים"]').count()) === 1);
      check(`${tag}/no bread <img> anywhere (MEH-2211)`,
        (await page.locator('img[alt="לחם מחמצת כפרי פרוס על קרש עץ"]').count()) === 0);
      check(`${tag}/duo rear <img>`,
        (await page.locator('img[alt="בקבוק שמן זית זכוכית עם זיתים"]').count()) === 1);
      check(`${tag}/duo front is decorative (empty alt)`,
        (await duo.locator('img[alt=""]').count()) === 1);
    }

    // ---- the LEDE, MEASURED. MEH-2211 cancelled the side bleed, so the old
    // "bleeds to the inline-end edge" assertion is inverted: on desktop the
    // lede must now stay INSIDE the container, and only mobile is full-width.
    const r = await box.evaluate((el) => {
      const b = el.getBoundingClientRect();
      return { left: b.left, right: b.right, w: b.width };
    });
    if (label === "375") {
      check(`${tag}/375 lede is a full-width band`, r.left <= 2 && r.right >= width - 2,
        `left=${r.left.toFixed(1)} right=${r.right.toFixed(1)} vw=${width}`);
    } else {
      check(`${tag}/desktop lede stays INSIDE the container (no bleed)`, r.left > 40,
        `left=${r.left.toFixed(1)} right=${r.right.toFixed(1)} w=${r.w.toFixed(1)} vw=${width}`);
      const pr = await page.getByText("למה הקמתי את מהמקור", { exact: true })
        .evaluate((el) => el.getBoundingClientRect().left);
      check(`${tag}/prose column stays inside the container`, pr > 40, `prose.left=${pr.toFixed(1)}`);
    }

    // ---- captures ----------------------------------------------------------
    await shoot(page, `about-${tag}-full.png`, null);
    await shoot(page, `about-${tag}-lede.png`, fig);
    await shoot(page, `about-${tag}-signature.png`, sig);
    await shoot(page, `about-${tag}-band-duo.png`, duo);
    await page.close();
  }
}

await browser.close();
console.log(`\n${ran.length} assertions ran · ${failures.length} failed`);
if (failures.length) { failures.forEach((f) => console.error("  FAIL " + f)); process.exit(1); }
console.log("qa-meh1130: PASS");
