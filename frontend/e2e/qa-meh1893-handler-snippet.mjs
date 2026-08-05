import { chromium } from "@playwright/test";
const browser = await chromium.launch({ executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--ssl-version-max=tls1.2"] });
const ctx = await browser.newContext({ extraHTTPHeaders:{ "x-vercel-protection-bypass":process.env.VERCEL_AUTOMATION_BYPASS_SECRET||"", "x-vercel-set-bypass-cookie":"true" }});
const page = await ctx.newPage();
const chunks=[]; page.on("response", r=>{const u=r.url(); if(u.includes("/_next/static/chunks/")&&u.endsWith(".js")) chunks.push(u);});
await page.goto("https://staging.mehamakor.online/",{waitUntil:"networkidle",timeout:60000});
for (const u of chunks) {
  const txt = await (await ctx.request.get(u)).text();
  const i = txt.search(/scrollX\s*!==/);
  if (i !== -1) {
    console.log("CHUNK:", u.split("/").pop());
    console.log(txt.slice(Math.max(0,i-260), i+260).replace(/\s+/g," "));
    break;
  }
}
await browser.close();
