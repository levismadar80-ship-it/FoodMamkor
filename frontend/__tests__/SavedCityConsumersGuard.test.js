/**
 * MEH-3857 — the city a visitor saved (localStorage `user_city`) never changes
 * what a page shows after the load.
 *
 * It lives in this browser only, so the server renders every page without it.
 * A component that paints it into a field, a label or a count right after the
 * load changes the screen under the visitor's eyes: /group-buys filled it into
 * the city field and the status chips flipped (staging, iPhone, 25/11). The
 * fix is one rule in one place: the shared CitySearch takes it as a
 * `suggestion`, offered on focus, never filled in (Sapir's choice, 25/11).
 *
 * This guard is a registry, read as text because nothing can run it: every
 * file that calls useUserCity() is listed below with what it does with the
 * city, and where that is held by a test. A new caller fails here until it is
 * added, so the question «does this paint the city after the load?» is asked
 * at review, not found on a phone. The behaviour of each entry is held by the
 * test named in it.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const DIRS = ["app", "components", "lib", "hooks"];

// file → what it does with the saved city, and the test that holds it.
const CONSUMERS = {
  "app/[locale]/group-buys/GroupBuysClient.jsx": {
    use: "offered as the city field's suggestion; never filled in",
    heldBy: "__tests__/GroupBuysSavedCity.test.jsx · e2e/flows/49-saved-city-no-flip.spec.ts",
  },
  "components/DeliveryChecker.jsx": {
    use: "offered as the checker's suggestion; never filled in, no verdict until she picks",
    heldBy: "__tests__/CoverageRequestCta.test.jsx · e2e/flows/49-saved-city-no-flip.spec.ts",
  },
  "components/WhatsAppQuestionChips.jsx": {
    use: "only inside the WhatsApp message, built on tap; labels and row count do not read it",
    heldBy: "__tests__/quickAnswers.test.js",
  },
  "components/ProducersClient.jsx": {
    use: "applied only when she taps a city control; written back on her pick",
    heldBy: "review (MEH-3857 sweep, 25/11)",
  },
  "lib/use-home-page.js": {
    use: "applied only when she taps the delivery CTA (handleDeliveryCta); written back on her pick",
    heldBy: "review (MEH-3857 sweep, 25/11)",
  },
  "app/[locale]/map/MapClient.jsx": {
    use: "map region and filters; the map is client-only, so nothing server-rendered changes",
    heldBy: "review (MEH-3857 sweep, 25/11)",
  },
  "app/[locale]/settings/page.jsx": {
    use: "writes only (setCity); reads nothing",
    heldBy: "review (MEH-3857 sweep, 25/11)",
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

/** Files (relative to frontend/) that call useUserCity() in code, the hook's own file excluded. */
export function savedCityCallers(files) {
  return files
    .filter((f) => !f.endsWith(path.join("lib", "use-user-city.js")))
    .filter((f) => /\buseUserCity\s*\(/.test(code(fs.readFileSync(f, "utf8"))))
    .map((f) => path.relative(ROOT, f).split(path.sep).join("/"))
    .sort();
}

describe("MEH-3857: every reader of the saved city is declared", () => {
  const files = DIRS.flatMap((d) => walk(path.join(ROOT, d)));

  it("the scan reads the real tree and finds a known caller (control)", () => {
    expect(files.length).toBeGreaterThan(200);
    expect(savedCityCallers(files)).toContain("components/DeliveryChecker.jsx");
  });

  it("useUserCity() is called only in files listed with what they do with the city", () => {
    expect(savedCityCallers(files)).toEqual(Object.keys(CONSUMERS).sort());
  });

  // An entry held by a test names a file that exists; "review" entries name none.
  const tested = Object.entries(CONSUMERS).flatMap(([rel, { heldBy }]) =>
    heldBy.startsWith("review") ? [] : heldBy.split(" · ").map((ref) => [rel, ref]),
  );
  it.each(tested)("%s is held by %s, which exists", (_rel, ref) => {
    expect(fs.existsSync(path.join(ROOT, ref))).toBe(true);
  });
});
