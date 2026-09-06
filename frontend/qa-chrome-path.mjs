/**
 * Module:   qa-chrome-path
 * Purpose:  Resolve the sandbox Chromium for the one-off QA harnesses, reading
 *           no environment variable at all.
 * Touches:  The filesystem under the sandbox browser root (read-only).
 * Does NOT: configure Playwright for the E2E suite — `playwright.config.ts`
 *           owns that and needs none of this.
 * Related:  qa-meh1287-capture.mjs · qa-meh1287-probe.mjs ·
 *           qa-meh1287-dup-probe.mjs.
 * History:  MEH-1287 chunk B.
 *
 * The harnesses first took the browser path from an environment variable, which
 * reddened the required `Env drift (.env.example)` check: that guard blocks any
 * variable read in code and absent from an `.env.example`, and documenting this
 * one would have been the wrong fix — nothing deployed reads it, so the entry
 * would be a false positive in a file whose value is that every line in it is
 * real (and regression rule 8 asks for confirmation before any new env var).
 *
 * Reading the browsers-root variable instead just moved the drift to a second
 * name; the guard caught that too, correctly. A script that can find the
 * browser on its own needs neither name.
 *
 * `undefined` is a meaningful return, not a failure: Playwright then falls back
 * to its own resolution, which is what a normal checkout uses.
 */
import fs from "node:fs";
import path from "node:path";

// The sandbox's browser root. Hardcoded rather than read from the environment,
// for the reason in the header; on any machine without it the loop finds
// nothing and Playwright's own default takes over.
const SANDBOX_ROOT = "/opt/pw-browsers";

export function resolveChromium() {
  let entries;
  try {
    entries = fs.readdirSync(SANDBOX_ROOT);
  } catch {
    return undefined;
  }
  // Newest first, so a pinned older build does not win over the current one.
  const dirs = entries
    .filter((e) => e.startsWith("chromium"))
    .sort()
    .reverse();
  for (const dir of dirs) {
    for (const rel of ["chrome-linux/chrome", "chrome"]) {
      const candidate = path.join(SANDBOX_ROOT, dir, rel);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}
