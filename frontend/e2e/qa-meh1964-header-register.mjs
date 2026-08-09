import { chromium, devices } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const OUT = fileURLToPath(new URL("../../qa-artifacts/MEH-1964/", import.meta.url));
mkdirSync(OUT, { recursive: true });
let fail = 0;
const rep = (l, ok, d) => { console.log(`${ok ? "PASS" : "FAIL"}  ${l} — ${d}`); if (!ok) fail++; };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const [name, opts, tag] of [
  ["390x844", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, "390x844"],
  ["Pixel 5", devices["Pixel 5"], "pixel5"],
  ["desktop-1440", { viewport: { width: 1440, height: 900 } }, "desktop1440"],
]) {
  const ctx = await b.newContext({ ...opts, locale: "he-IL" });
  const p = await ctx.newPage();
  await p.goto("http://localhost:3000/he", { waitUntil: "networkidle" });
  const rtl = await p.evaluate(() => document.documentElement.getAttribute("dir") === "rtl");
  rep(`${name}: RTL`, rtl, `dir=${rtl ? "rtl" : "NOT rtl"}`);
  const st = await p.evaluate(() => {
    const el = document.querySelector('[data-testid="header-register-link"]');
    const vis = el && el.getBoundingClientRect().width > 0;
    return {
      present: !!el, visible: !!vis, href: el?.getAttribute("href") || null,
      text: el?.textContent?.trim() || null,
      hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  const isDesktop = name === "desktop-1440";
  rep(`${name}: register link ${isDesktop ? "VISIBLE" : "hidden (md:)"}`,
    isDesktop ? (st.visible && st.href === "/register") : !st.visible,
    `present=${st.present} visible=${st.visible} href=${st.href} text=${st.text}`);
  rep(`${name}: no horizontal scroll`, !st.hScroll, `hScroll=${st.hScroll}`);
  await p.screenshot({ path: `${OUT}home-${tag}.png`, fullPage: false });
  // gated pages
  for (const [path, label] of [["/he/register", "register"], ["/he/register/producer", "wizard"]]) {
    await p.goto(`http://localhost:3000${path}`, { waitUntil: "networkidle" });
    const gone = await p.evaluate(() => !document.querySelector('[data-testid="header-register-link"]'));
    rep(`${name}: link absent on ${label}`, gone, gone ? "absent" : "STILL RENDERED");
  }
  await ctx.close();
}
await b.close();
console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILURE(S)`);
process.exit(fail === 0 ? 0 : 1);
