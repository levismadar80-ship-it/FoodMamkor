/**
 * Module:   qa-meh1893-buildcheck
 * Purpose:  Answer one question about the DEPLOYED bundle — does it contain the
 *           MEH-1871 dismiss-on-scroll handler? Used to rule out "staging is
 *           serving pre-fix code" before attributing a failure to the code.
 * Does NOT: judge whether the handler WORKS. That is qa-meh1893-phase0.mjs.
 *           Presence in a chunk says nothing about whether it ever attaches.
 * Related:  frontend/e2e/qa-meh1893-handler-snippet.mjs (prints the matched
 *           source, which is the stronger evidence — prefer it when the answer
 *           is load-bearing), frontend/components/ui/Popover.jsx:199-207.
 * History:  MEH-1893 — created during Phase 0; hardened with a self-test after
 *           the CI reviewer noted a bare 0 could not distinguish "handler
 *           absent" from "regex missed".
 */
import { chromium } from "@playwright/test";

// The classifier under test. Minified output is not contract, so this is a
// heuristic — which is exactly why it needs the self-test below.
const looksLikeDismissHandler = (txt) =>
  /scrollX\s*!==?\s*[A-Za-z_$]/.test(txt) ||
  /!==\s*[A-Za-z_$]+\s*\|\|\s*[A-Za-z_$.]*scrollY/.test(txt);

// ---------------------------------------------------------------------------
// SELF-TEST FIRST (MEH-1619). If the classifier cannot sort three inputs whose
// answers are already known, nothing it says about the real bundle is worth
// reading. Exercises the REAL function, not a copy.
// ---------------------------------------------------------------------------
const SELF_TEST = [
  // correct: the shape actually emitted for Popover.jsx's handler
  { name: "minified dismiss handler", src: `let e=()=>x(!1),t=window.scrollX,a=window.scrollY,r=()=>{(window.scrollX!==t||window.scrollY!==a)&&x(!1)};`, expect: true },
  // regression-shaped: reads scroll position but never compares it to a capture
  { name: "reposition-only (no comparison)", src: `let t=window.scrollX,a=window.scrollY;L({top:o-a,start:i-t});`, expect: false },
  // neutral: unrelated bundle text
  { name: "unrelated chunk text", src: `function n(e){return e.replace(/\\s+/g," ").trim()}`, expect: false },
];

let selfTestOk = true;
console.log("=== self-test (must pass before the bundle result means anything) ===");
for (const c of SELF_TEST) {
  const got = looksLikeDismissHandler(c.src);
  const ok = got === c.expect;
  if (!ok) selfTestOk = false;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${c.name}: expected ${c.expect}, got ${got}`);
}
if (!selfTestOk) {
  console.error("\nSELF-TEST FAILED — the classifier does not discriminate. Bundle result withheld.");
  process.exit(1);
}

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--ssl-version-max=tls1.2"],
});
const ctx = await browser.newContext({
  extraHTTPHeaders: {
    "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "",
    "x-vercel-set-bypass-cookie": "true",
  },
});
const page = await ctx.newPage();
const chunks = [];
page.on("response", (r) => {
  const u = r.url();
  if (u.includes("/_next/static/chunks/") && u.endsWith(".js")) chunks.push(u);
});
await page.goto("https://staging.mehamakor.online/", { waitUntil: "networkidle", timeout: 60000 });

const hits = { handler: 0, orientationchange: 0, files: 0, sane: 0 };
for (const u of chunks) {
  const txt = await (await ctx.request.get(u)).text();
  hits.files++;
  // Sanity control: a string every React bundle carries. If NO chunk has it,
  // we fetched something that isn't app JS and every other count is meaningless.
  if (txt.includes("addEventListener")) hits.sane++;
  if (looksLikeDismissHandler(txt)) hits.handler++;
  if (txt.includes("orientationchange")) hits.orientationchange++;
}

console.log("\n=== deployed bundle ===");
console.log("chunks fetched                         :", hits.files);
console.log("chunks containing 'addEventListener'   :", hits.sane, "(sanity control)");
console.log("chunks matching the dismiss handler    :", hits.handler);
console.log("chunks containing 'orientationchange'  :", hits.orientationchange);

// A zero is only reportable once the fetch itself is shown to be sound.
if (hits.files === 0 || hits.sane === 0) {
  console.error(`\nINCONCLUSIVE — fetched ${hits.files} chunk(s), ${hits.sane} with the sanity string.`);
  console.error("The bundle was not read successfully, so a 0 above means 'not measured', not 'not present'.");
  process.exitCode = 2;
} else if (hits.handler === 0) {
  console.log("\nRESULT: handler NOT found in a soundly-read bundle — staging may predate the fix.");
  console.log("Confirm with qa-meh1893-handler-snippet.mjs before acting; minified shape is not contract.");
} else {
  console.log("\nRESULT: handler present. This says it SHIPPED, not that it RUNS —");
  console.log("it is gated on overlayActive (Popover.jsx:180), which is false below 1024px.");
}

await browser.close();
