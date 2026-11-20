/**
 * MEH-3463 — a page never changes ROUTE behind the router's back.
 *
 * 20/11 on a phone: the «אירועים» / «חוויות» screen showed the tab row and the
 * list of one tab and the heading, add link and chips of the other. The cause
 * was MEH-2980's in-place switch: history.pushState wrote /events while the
 * /experiences page tree stayed mounted, so Next held one URL with another
 * page's tree, and two sync paths (usePathname, popstate) tried to square it.
 * The fix moved both routes under one layout (app/[locale]/(whats-on)/) and
 * made the switch a real router.push.
 *
 * This guard keeps the class from coming back: `history.pushState` is allowed
 * only where a page pushes a new QUERY on its OWN path (the pattern Next
 * documents for search params) and the file is listed below with that reason.
 * A route change goes through the router (useRouter / <Link>), always.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const DIRS = ["app", "components", "lib", "hooks"];

// file → why its pushState is a same-path query push, and the line that proves it.
const QUERY_ONLY_PUSH = {
  "components/ProducersClient.jsx": {
    reason: "MEH-1084: a category pick is a history entry on /producers itself, so Back cancels it",
    samePath: "const path = window.location.pathname;",
  },
};

function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".") || entry.name === "generated") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(jsx?|tsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Files (relative to frontend/) that call history.pushState in code. */
export function pushStateCallers(files) {
  return files
    .filter((f) => /\bhistory\s*\.\s*pushState\s*\(/.test(code(fs.readFileSync(f, "utf8"))))
    .map((f) => path.relative(ROOT, f).split(path.sep).join("/"))
    .sort();
}

describe("MEH-3463: no hand-written route change", () => {
  const files = DIRS.flatMap((d) => walk(path.join(ROOT, d)));

  it("the scan reads the real tree and finds the one known caller (control)", () => {
    // If this is empty, the scan is broken and the next assertion means nothing.
    expect(files.length).toBeGreaterThan(200);
    expect(pushStateCallers(files)).toContain("components/ProducersClient.jsx");
  });

  it("history.pushState appears only in files listed as same-path query pushes", () => {
    expect(pushStateCallers(files)).toEqual(Object.keys(QUERY_ONLY_PUSH).sort());
  });

  it.each(Object.entries(QUERY_ONLY_PUSH))("%s pushes on its own path (%s)", (rel, { samePath }) => {
    expect(fs.readFileSync(path.join(ROOT, rel), "utf8")).toContain(samePath);
  });

  it("the hub tabs switch through the router", () => {
    const src = code(fs.readFileSync(path.join(ROOT, "app/[locale]/events/EventsClient.jsx"), "utf8"));
    expect(src).toMatch(/router\.push\(/);
    expect(src).not.toMatch(/addEventListener\(\s*["']popstate["']/);
  });
});
