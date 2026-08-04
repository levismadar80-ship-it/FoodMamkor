import { chromium } from "@playwright/test";
const browser = await chromium.launch({ executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--ssl-version-max=tls1.2"] });
const ctx = await browser.newContext({ extraHTTPHeaders:{ "x-vercel-protection-bypass":process.env.VERCEL_AUTOMATION_BYPASS_SECRET||"", "x-vercel-set-bypass-cookie":"true" }});
const page = await ctx.newPage();
const chunks = [];
page.on("response", r => { const u=r.url(); if (u.includes("/_next/static/chunks/") && u.endsWith(".js")) chunks.push(u); });
await page.goto("https://staging.mehamakor.online/",{waitUntil:"networkidle",timeout:60000});
const buildId = await page.evaluate(()=> window.__NEXT_DATA__?.buildId || document.querySelector('script#__NEXT_DATA__')?.textContent?.slice(0,80) || "n/a");
console.log("buildId:", buildId);
console.log("chunks loaded:", chunks.length);
// Look for the MEH-1871 signature: a scroll handler comparing scrollX/scrollY captured at open.
let hits = { scrollXCompare:0, orientationchange:0, files:0 };
for (const u of chunks) {
  const txt = await (await ctx.request.get(u)).text();
  hits.files++;
  if (/scrollX\s*!==?\s*[A-Za-z_$]/.test(txt) || /!==\s*[A-Za-z_$]+\s*\|\|\s*[A-Za-z_$.]*scrollY/.test(txt)) hits.scrollXCompare++;
  if (txt.includes("orientationchange")) hits.orientationchange++;
}
console.log("chunks containing a scrollX!==<var> comparison :", hits.scrollXCompare, "/", hits.files);
console.log("chunks containing 'orientationchange'          :", hits.orientationchange, "/", hits.files);
await browser.close();
