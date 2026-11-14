/**
 * MEH-3072 — an in-place form / page message is <InlineMessage>
 * (components/ui/InlineMessage.jsx): one red (text-error), role from tone.
 *
 * Ratchet: a file may keep hand-written role="alert" nodes only up to its
 * count in ALLOWED (field errors wired by id + aria-describedby — the form
 * field primitives' job, MEH-3060 — full-page error states, and nodes whose
 * className is an expression). A file not listed may have none. A count that
 * drops must be lowered here in the same PR (the "stale" test).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const OWNER = "components/ui/InlineMessage.jsx";

// file → hand-written role="alert" still allowed (13/11/2026).
const ALLOWED = {
  "app/[locale]/admin/producers/AdminDraftClaimActions.jsx": 1,
  "app/[locale]/events/EventsClient.jsx": 1,
  "app/[locale]/favorites/FavoritesClient.jsx": 2,
  "app/[locale]/producer/dashboard/RejectedBanner.jsx": 1,
  "app/[locale]/producer/dashboard/edit/LocationsEditor.jsx": 1,
  "app/[locale]/producer/dashboard/group-buys/page.js": 1,
  "app/[locale]/producer/dashboard/insights/page.js": 1,
  "app/[locale]/producer/dashboard/page.js": 4,
  "app/[locale]/producer/dashboard/tools/page.js": 2,
  "app/[locale]/recommend/RecommendClient.jsx": 1,
  "app/[locale]/register/producer/RegisterProducerClient.jsx": 1,
  "app/[locale]/registration/[token]/CancelRegistrationClient.jsx": 1,
  "app/[locale]/reset-password/ResetPasswordClient.jsx": 1,
  "components/ExperienceForm.jsx": 1,
  "components/ProductsSection.jsx": 1,
  "components/ReviewCardCanvas.jsx": 1,
  "components/UnverifiedEmailNotice.jsx": 1,
  "components/admin/AdminLoadError.jsx": 1,
  "components/dashboard/RescueTab.jsx": 1,
  "components/producer/RequestReviewCard.jsx": 1,
};

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "__tests__") continue;
      walk(p, out);
    } else if (/\.(jsx?|tsx?)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}
const files = ["app", "components"].flatMap((d) => walk(path.join(ROOT, d))).map((p) => ({
  rel: path.relative(ROOT, p).split(path.sep).join("/"),
  src: fs.readFileSync(p, "utf8"),
}));

// role="alert" as an attribute inside a JSX opening tag (not prose in a comment):
// "alert", 'alert', {"alert"} or an expression that can yield "alert".
const ALERT_ATTR = /<[a-zA-Z][^<>]*\srole=(?:"alert"|'alert'|\{[^{}]*["'`]alert["'`][^{}]*\})/g;
const countAlerts = (src) => (src.match(ALERT_ATTR) || []).length;

describe("InlineMessageGuard (MEH-3072)", () => {
  it("self-test: counts an attribute, not a comment", () => {
    expect(countAlerts('<p className="text-sm text-error" role="alert">x</p>')).toBe(1);
    expect(countAlerts("<p role='alert'>x</p>")).toBe(1);
    expect(countAlerts('<p role={"alert"}>x</p>')).toBe(1);
    expect(countAlerts('<p role={err ? "alert" : "status"}>x</p>')).toBe(1);
    expect(countAlerts('<p role="status">x</p>')).toBe(0);
    expect(countAlerts('{/* MEH-1165: role="alert" so it is announced */}')).toBe(0);
    // anchored to a real file: the tone-driven notice in RescueTab
    expect(countAlerts(files.find((f) => f.rel === "components/dashboard/RescueTab.jsx").src)).toBe(1);
    expect(countAlerts(files.find((f) => f.rel === OWNER).src)).toBe(0);
  });

  it("no new hand-written role=\"alert\" (ratchet)", () => {
    const over = files
      .filter((f) => f.rel !== OWNER)
      .map((f) => [f.rel, countAlerts(f.src), ALLOWED[f.rel] || 0])
      .filter(([, n, allowed]) => n > allowed)
      .map(([rel, n, allowed]) => `${rel}: ${n} > ${allowed}`);
    expect(over).toEqual([]);
  });

  it("ALLOWED is not stale (lower a count when it drops)", () => {
    const stale = Object.entries(ALLOWED)
      .map(([rel, allowed]) => [rel, countAlerts(files.find((f) => f.rel === rel)?.src || ""), allowed])
      .filter(([, n, allowed]) => n < allowed)
      .map(([rel, n, allowed]) => `${rel}: ${n} < ${allowed}`);
    expect(stale).toEqual([]);
  });

  it("the one red: no text-danger-* on an InlineMessage", () => {
    const bad = files.filter((f) => /<InlineMessage[^>]*text-danger-\d/.test(f.src)).map((f) => f.rel);
    expect(bad).toEqual([]);
  });
});
