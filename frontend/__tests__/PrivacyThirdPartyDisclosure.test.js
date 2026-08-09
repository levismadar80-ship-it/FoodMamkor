import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// MEH-1981 — privacy-policy third-party disclosure guard.
//
// Pattern source: NoEmojiInMessages.test.js — a vitest test that reads the real
// files off disk and runs inside the existing suite (Frontend unit tests → the
// required "CI gate"). A vitest test rather than a workflow step because
// .github/workflows/** is CC-deny (MEH-671).
//
// WHAT IT GUARDS. `privacy/page.js` renders an ENUMERATION of the third parties
// that receive personal data. An enumeration is a stronger claim than a general
// statement: it presents itself as complete. So a processor that is wired in
// code but missing from the list is not a small omission — it makes the page
// assert something false.
//
// The Amendment-13 audit found exactly that: PostHog was loaded in
// `lib/analytics.js` and named nowhere in the policy, while the list carried
// eight other processors.
//
// WHAT IT CANNOT SEE, stated so nobody reads more into a green than is there:
// this asserts DISCLOSURE, not DATA FLOW. Whether a processor actually receives
// anything at runtime depends on env vars (`NEXT_PUBLIC_POSTHOG_KEY`) that live
// in Vercel/Railway and are not readable from the repo. A processor referenced
// in code but disabled by a missing key still belongs in the list — disclosing a
// processor you may use is harmless, omitting one you do use is the risk — so
// erring toward disclosure is the intended behaviour, not a false positive.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.join(HERE, "..");
const PRIVACY_PAGE = path.join(FRONTEND, "app", "[locale]", "privacy", "page.js");
const ANALYTICS = path.join(FRONTEND, "lib", "analytics.js");
const MESSAGES = ["he", "en"].map((l) => ({
  locale: l,
  file: path.join(FRONTEND, "messages", `${l}.json`),
}));

/** The processors whose presence in code obliges a disclosure entry.
 *  Keyed by the id used in THIRD_PARTY_ITEMS; the probe is a source file plus a
 *  case-insensitive token that appears in it when the integration is wired.
 *
 *  KNOWN LIMIT — this probe degrades SILENTLY, and that is worth naming rather
 *  than discovering. It matches a literal token in one file. If the import moves
 *  to another module, becomes a computed string, or the package is aliased,
 *  `wired` goes false, the check is skipped, and the test passes — which reads
 *  identically to "correctly disclosed". That is the two-causes-for-one-green
 *  shape .claude/rules/testing.md warns about.
 *
 *  It is left this way deliberately: the failure mode drops the guarantee back
 *  to where it was before this guard existed (a manual grep), never below it, and
 *  the alternative — resolving the import graph — is far more machinery than one
 *  processor justifies. When adding a processor here, prefer a token that cannot
 *  be refactored away silently, such as the package name in `package.json`. */
const CODE_WIRED_PROCESSORS = [
  { id: "posthog", source: ANALYTICS, token: "posthog-js" },
];

function readThirdPartyItems() {
  const src = readFileSync(PRIVACY_PAGE, "utf8");
  const m = src.match(/const\s+THIRD_PARTY_ITEMS\s*=\s*\[([^\]]*)\]/);
  if (!m) throw new Error("THIRD_PARTY_ITEMS not found in privacy/page.js");
  return m[1]
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function readDisclosureStrings(file) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  const items = data?.privacy?.sections?.third_parties?.items;
  // THROW rather than default to {}. The earlier `?? {}` made the orphan test
  // vacuously green whenever this JSON path moved: an empty object yields an
  // empty loop, `orphans` stays `[]`, and the assertion passes while the thing
  // it guards has silently stopped existing. That is the two-causes-for-one-
  // green shape, and a guard exhibiting it is worse than no guard, because it
  // reports coverage it no longer has.
  //
  // The "renders a disclosure string" test would still have caught a moved
  // path (every id lands in `missing`), so the suite was never silently green
  // overall — but the orphan assertion on its own was decoration. Failing loud
  // costs nothing here: the path either exists or the file is broken.
  if (!items || typeof items !== "object") {
    throw new Error(
      `${file}: privacy.sections.third_parties.items is missing or not an object — ` +
        `the message-file structure moved and this guard can no longer see it.`,
    );
  }
  return items;
}

describe("privacy policy — third-party disclosure", () => {
  it("parses a non-trivial THIRD_PARTY_ITEMS list", () => {
    // Self-check: a regex that silently matched nothing would make every
    // assertion below vacuously true — the "green with a second cause" shape.
    const items = readThirdPartyItems();
    expect(items.length).toBeGreaterThan(5);
    expect(items).toContain("cloudinary");
  });

  it("renders a disclosure string for every listed processor, in both locales", () => {
    const items = readThirdPartyItems();
    const missing = [];
    for (const { locale, file } of MESSAGES) {
      const strings = readDisclosureStrings(file);
      for (const id of items) {
        if (!strings[id] || !String(strings[id]).trim()) {
          missing.push(`${locale}.json → privacy.sections.third_parties.items.${id}`);
        }
      }
    }
    expect(missing, `listed but not translated:\n${missing.join("\n")}`).toEqual([]);
  });

  it("has no orphan disclosure string that the page never renders", () => {
    // The inverse drift: a string added to he.json but not to the array is
    // written, translated, reviewed — and never shown to anyone.
    const items = new Set(readThirdPartyItems());
    const orphans = [];
    for (const { locale, file } of MESSAGES) {
      for (const id of Object.keys(readDisclosureStrings(file))) {
        if (!items.has(id)) orphans.push(`${locale}.json → ${id}`);
      }
    }
    expect(orphans, `translated but never rendered:\n${orphans.join("\n")}`).toEqual([]);
  });

  it("discloses every processor that is wired in code", () => {
    const items = readThirdPartyItems();
    const undisclosed = [];
    for (const { id, source, token } of CODE_WIRED_PROCESSORS) {
      const wired = readFileSync(source, "utf8").toLowerCase().includes(token.toLowerCase());
      if (wired && !items.includes(id)) {
        undisclosed.push(
          `${id}: referenced in ${path.relative(FRONTEND, source)} but absent from THIRD_PARTY_ITEMS`,
        );
      }
    }
    expect(undisclosed, undisclosed.join("\n")).toEqual([]);
  });
});
