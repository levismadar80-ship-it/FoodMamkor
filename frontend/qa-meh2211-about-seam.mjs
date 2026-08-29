/**
 * MEH-2211 self-QA — the /about hero→chapter-02 seam.
 *
 * PHASE=a asserts PR-A's shape, PHASE=b asserts PR-B's. Both run the same
 * CONTROL first.
 *
 * The CONTROL is not decoration. Every absence assertion below ("the choose
 * block is gone", "no element says איך אנחנו בוחרות") is satisfied by a page
 * that never rendered at all — the error boundary, a stale server, a 500 —
 * and that is also the reassuring answer. So probe 0 asserts a string this
 * page MUST contain, and on failure exits 1 having written NOTHING, printing
 * that every null in the run is void. A screenshot is only taken after it
 * passes.
 *
 * Cloudinary is egress-blocked from the CC sandbox (MEH-2090 class), so the
 * photographs do not appear in the frames. Every geometric claim here is read
 * from getBoundingClientRect() in the same run that takes the picture, not
 * from looking at a PNG.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

// Configured by CLI FLAGS, deliberately not by environment variables.
// `scripts/check_env_drift.sh` (the required "Env drift" job) scans the tree
// for process.env reads and blocks any name absent from a .env.example — so a
// harness knob read from the environment reds a required check, and the only
// way to satisfy it would be to document four test-only names as though they
// were application configuration. Flags keep them out of that namespace.
//
//   node qa-meh2211-about-seam.mjs --phase=b --base=http://localhost:3000
const ARGV = new Map(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.join("=") || "true"];
  }),
);
const PHASE = ARGV.get("phase") === "b" ? "b" : "a";
const BASE = ARGV.get("base") || "http://localhost:3000";
const OUT = `../qa-artifacts/MEH-2211/pr-${PHASE}`;
mkdirSync(OUT, { recursive: true });

const QUOTE = "אוכל טוב — לא שומרים לעצמנו";
const LEAD = "מה שמשתנה בדרך";
// The control string is overridable so the DISCRIMINATION run (MEH-1619) can
// be pointed at the heading the pre-change page legitimately carries. The
// control still runs there — it is aimed at a string that build really has,
// which is what lets the absence assertions below be observed going red
// instead of the run aborting at probe 0.
const HEADING = ARGV.get("control") || "למה הקמתי את מהמקור";
const GONE = "איך אנחנו בוחרות";

let failures = 0;
const ran = [];
function check(name, cond, detail = "") {
  ran.push(name);
  const ok = Boolean(cond);
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

// The sandbox ships Chromium build 1194 at a fixed path while this repo's
// @playwright/test pins 1234, so the default resolution misses. Point at the
// preinstalled binary rather than downloading one (env policy).
const EXE = ARGV.get("chromium") || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: EXE });
for (const [tag, width, height] of [["375", 375, 812], ["1440", 1440, 900]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`${BASE}/about`, { waitUntil: "domcontentloaded" });
  await page.locator("h1").first().waitFor({ state: "visible", timeout: 20_000 });
  // reveal-on-scroll: walk the page so FadeInSection sections are not opacity:0
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 600));
  });

  // ---- probe 0: THE CONTROL ------------------------------------------------
  if (!check(`${tag}/CONTROL story heading renders`,
    (await page.getByText(HEADING, { exact: true }).count()) > 0)) {
    console.error(`\n!! CONTROL FAILED at ${tag}. Every null in this run is void. Nothing written.`);
    await browser.close();
    process.exit(1);
  }
  check(`${tag}/CONTROL signature still present`,
    (await page.getByTestId("about-signature").count()) === 1);

  // ---- absence: the choose block ------------------------------------------
  check(`${tag}/choose eyebrow text absent`,
    (await page.getByText(GONE, { exact: false }).count()) === 0);
  check(`${tag}/choose process link absent`,
    (await page.getByTestId("how-we-choose-process-link").count()) === 0);
  check(`${tag}/choose counter absent`,
    (await page.getByTestId("how-we-choose-count").count()) === 0);

  // ---- the business line ---------------------------------------------------
  const biz = page.getByTestId("about-biz-strip");
  check(`${tag}/business link present`, (await biz.count()) === 1);
  check(`${tag}/business link text === "כך זה עובד אצלנו"`,
    (await biz.innerText()).trim().startsWith("כך זה עובד אצלנו"));
  check(`${tag}/business lead "בעלת עסק?" present`,
    (await page.getByText("בעלת עסק?", { exact: true }).count()) === 1);
  check(`${tag}/business href unchanged`,
    (await biz.getAttribute("href"))?.includes("/about/for-businesses"));
  // not a tonal band: the link's nearest <section> must not carry background-alt
  const bandTone = await biz.evaluate((el) => {
    const sec = el.closest("section");
    return sec ? getComputedStyle(sec).backgroundColor : "none";
  });
  const altTone = await page.evaluate(() => {
    const d = document.createElement("div");
    d.className = "bg-background-alt";
    document.body.append(d);
    const c = getComputedStyle(d).backgroundColor;
    d.remove();
    return c;
  });
  check(`${tag}/business line is NOT a tonal band`, bandTone !== altTone,
    `section=${bandTone} vs bg-background-alt=${altTone}`);

  // ---- the business link's ACCESSIBLE NAME, not just its visible text -------
  // Splitting the copy into a sibling <p> for the visual design cut the link's
  // accessible name down to «כך זה עובד אצלנו» alone, which says nothing about
  // who the link is for. aria-labelledby rebuilds the pre-split name. Asserted
  // by role+name because that IS the computed accessible name — a textContent
  // assertion passes on the broken markup and so proves nothing.
  check(`${tag}/business link accessible name is the FULL string`,
    (await page.getByRole("link", { name: "בעלת עסק? כך זה עובד אצלנו", exact: true }).count()) === 1);
  check(`${tag}/business link is NOT named by the bare CTA alone`,
    (await page.getByRole("link", { name: "כך זה עובד אצלנו", exact: true }).count()) === 0);

  // ---- exactly 2 links between the signature and the chapter-02 heading -----
  const linkCount = await page.evaluate((quote) => {
    const sig = document.querySelector('[data-testid="about-signature"]');
    const heads = [...document.querySelectorAll("h1,h2,p,blockquote")];
    const ch2 = heads.find((el) => el.textContent.trim() === quote);
    if (!sig || !ch2) return -1;
    return [...document.querySelectorAll("a[href]")].filter((a) => {
      const afterSig = sig.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING;
      const beforeCh2 = ch2.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_PRECEDING;
      return afterSig && beforeCh2;
    }).length;
  }, QUOTE);
  check(`${tag}/exactly 2 links between signature and chapter-02 heading`,
    linkCount === 2, `found ${linkCount}`);

  // ---- no horizontal overflow ---------------------------------------------
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${tag}/no horizontal overflow`, overflow <= 0, `${overflow}px`);

  // ---- PHASE B only --------------------------------------------------------
  if (PHASE === "b") {
    const geo = await page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const lede = q('[data-testid="about-lede-figure"]');
      const upd = q('[data-testid="about-updated-at"]');
      const ch1 = q('[data-testid="about-chapter-1"]');
      const r = (el) => (el ? el.getBoundingClientRect() : null);
      return {
        lede: r(lede) && { top: r(lede).top + scrollY, left: r(lede).left, w: r(lede).width },
        upd: r(upd) && { bottom: r(upd).bottom + scrollY },
        ch1: r(ch1) && { top: r(ch1).top + scrollY },
      };
    });
    check(`${tag}/lede figure exists`, geo.lede !== null);
    check(`${tag}/lede sits BELOW the updated line`,
      geo.lede && geo.upd && geo.lede.top >= geo.upd.bottom,
      `lede.top=${geo.lede?.top} upd.bottom=${geo.upd?.bottom}`);
    check(`${tag}/lede sits ABOVE chapter 01`,
      geo.lede && geo.ch1 && geo.lede.top < geo.ch1.top,
      `lede.top=${geo.lede?.top} ch1.top=${geo.ch1?.top}`);
    check(`${tag}/bread band gone`,
      (await page.getByTestId("about-band-bread").count()) === 0);
    check(`${tag}/duo band after Benefits still present (AC5 untouched)`,
      (await page.getByTestId("about-band-duo").count()) === 1);

    // chapter 02: the quote IS the h2, and shares chapter 01's h2 classes
    const h2s = await page.evaluate((quote) => {
      const all = [...document.querySelectorAll("h2")];
      const ch2 = all.find((el) => el.textContent.trim() === quote);
      const ch1 = document.querySelector('[data-testid="about-story-h2"]');
      return {
        quoteIsH2: Boolean(ch2),
        sameClasses: ch1 && ch2 ? ch1.className === ch2.className : false,
        ch1Class: ch1?.className ?? null,
        ch2Class: ch2?.className ?? null,
      };
    }, QUOTE);
    check(`${tag}/chapter 02 h2 text === the pull-quote string`, h2s.quoteIsH2);
    check(`${tag}/chapter 01 h2 and chapter 02 h2 share classes`, h2s.sameClasses,
      `ch1="${h2s.ch1Class}" ch2="${h2s.ch2Class}"`);
    const leadEl = page.getByText(LEAD, { exact: true });
    check(`${tag}/"${LEAD}" is a <p>, not a heading`,
      (await leadEl.count()) === 1 &&
      (await leadEl.first().evaluate((el) => el.tagName)) === "P");
    // one h2 per chapter section
    const perSection = await page.evaluate(() =>
      [...document.querySelectorAll("section")].map((s) => s.querySelectorAll("h2").length));
    check(`${tag}/no section carries more than one h2`,
      perSection.every((n) => n <= 1), `counts=${perSection.join(",")}`);
  }

  await page.screenshot({ path: `${OUT}/about-${tag}.png`, fullPage: true });
  console.log(`  ..  wrote ${OUT}/about-${tag}.png`);
  await page.close();
}
await browser.close();
console.log(`\n${ran.length} assertions ran · ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
