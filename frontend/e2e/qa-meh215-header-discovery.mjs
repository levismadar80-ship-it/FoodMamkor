/**
 * qa-meh215-header-discovery — is /register reachable from the guest Header?
 *
 * MEH-215 journey A checkbox A1 asks for a "הצטרפי / הרשמה" CTA visible in the
 * Header. Reading Header.jsx says there is none. A grep that finds nothing and
 * a surface that genuinely has nothing look identical, so this probe measures
 * the rendered DOM instead.
 *
 * CONTROL (this is the point): it also counts /login links, whose answer is
 * known in advance — the guest Header renders `LoginAccount` on desktop and
 * hides it under `md:` on mobile. If the /login numbers do not come back
 * desktop>0 / mobile=0, the probe is broken and its /register zeros mean
 * nothing. Report the control alongside the finding, never the finding alone.
 *
 * Run:  node e2e/qa-meh215-header-discovery.mjs [--base http://localhost:3000]
 */
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = flag("base", "http://localhost:3000");

const VIEWPORTS = [
  { name: "mobile", width: 393, height: 851, isMobile: true },
  { name: "desktop", width: 1440, height: 900, isMobile: false },
];

// Guest surfaces a visitor could plausibly find registration from.
const ROUTES = ["/", "/producers"];

const browser = await chromium.launch({ args: ["--ssl-version-max=tls1.2"] });
console.log(`base=${BASE}\n`);

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.isMobile,
    hasTouch: vp.isMobile,
    locale: "he-IL",
  });
  const page = await ctx.newPage();

  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    const counts = await page.evaluate(() => {
      const header = document.querySelector("header");
      const inHeader = (sel) => (header ? [...header.querySelectorAll(sel)] : []);
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
      };
      const hrefs = (els) => els.map((a) => a.getAttribute("href"));
      const reg = inHeader('a[href*="/register"]');
      const login = inHeader('a[href*="/login"]');
      const regPage = [...document.querySelectorAll('a[href*="/register"]')];
      return {
        headerPresent: !!header,
        headerRegister: reg.filter(visible).length,
        headerRegisterHrefs: hrefs(reg),
        headerLogin: login.filter(visible).length, // ← the control
        headerLoginHrefs: hrefs(login),
        pageRegisterAnywhere: regPage.filter(visible).length,
        pageRegisterHrefs: hrefs(regPage.filter(visible)),
      };
    });

    console.log(`[${vp.name}] ${route}`);
    console.log(`  header element present ......... ${counts.headerPresent}`);
    console.log(`  CONTROL /login in header ....... ${counts.headerLogin}  ${JSON.stringify(counts.headerLoginHrefs)}`);
    console.log(`  /register in header ............ ${counts.headerRegister}  ${JSON.stringify(counts.headerRegisterHrefs)}`);
    console.log(`  /register anywhere on page ..... ${counts.pageRegisterAnywhere}  ${JSON.stringify(counts.pageRegisterHrefs)}`);
    console.log("");
  }
  await ctx.close();
}

await browser.close();
console.log(
  "Read the CONTROL row first. Expected: desktop>0, mobile=0 (LoginAccount is\n" +
    "`hidden md:inline-flex`). If the control does not match, the /register zeros\n" +
    "are an artifact of the probe and must not be reported as a finding.",
);
