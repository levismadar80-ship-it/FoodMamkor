import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import he from "../messages/he.json";
import en from "../messages/en.json";

/**
 * MEH-2795 — a raw i18n key reached the screen.
 *
 * On /register/producer step 3, `auth.register.producer.fields.license_what_is_it`
 * rendered as the literal key under the licence-number field, because the
 * caller (RegisterProducerClient.jsx:1422, added by MEH-951) read a key that
 * neither locale defined. next-intl returns the KEY PATH for a missing
 * message rather than throwing or returning undefined, so nothing anywhere
 * failed — the string simply appeared to a business owner mid-signup.
 *
 * This walks the component for the keys it actually reads and asserts each
 * one exists, which is the general form of the bug rather than a patch for
 * this one key.
 *
 * DISCRIMINATION: delete `license_what_is_it` from he.json → red, naming it.
 * The pre-fix tree reds here and nowhere else in the suite.
 */
const ROOT = path.resolve(__dirname, "..");
const SOURCE = "app/[locale]/register/producer/RegisterProducerClient.jsx";

/** Every `t("…")` literal the component reads, deduped. */
function keysReadBy(relPath) {
  const src = readFileSync(path.join(ROOT, relPath), "utf8");
  return [...new Set([...src.matchAll(/\bt\(\s*"([a-zA-Z0-9_.]+)"/g)].map((m) => m[1]))];
}

const lookup = (messages, dotted) =>
  dotted.split(".").reduce((node, part) => (node == null ? undefined : node[part]), messages);

describe("MEH-2795 — the signup form never renders a raw key", () => {
  const keys = keysReadBy(SOURCE);

  it("control: the scan actually found keys to check", () => {
    // Without this, "0 missing" would also be the answer if the regex broke.
    expect(keys.length).toBeGreaterThan(20);
    expect(keys).toContain("auth.register.producer.fields.license_what_is_it");
  });

  it.each([
    ["he", he],
    ["en", en],
  ])("%s defines every key the form reads", (_locale, messages) => {
    const missing = keys.filter((k) => typeof lookup(messages, k) !== "string");
    expect(missing, "next-intl renders the key path itself for these").toEqual([]);
  });

  it("the licence hint is its own line, not a duplicate of the required hint", () => {
    const fields = he.auth.register.producer.fields;
    expect(fields.license_what_is_it).not.toBe(fields.license_required_hint);
    expect(fields.license_what_is_it).not.toBe(fields.license_pending_optin_hint);
  });

  it("does not leak into the admin form namespace", () => {
    // admin.producers.form.fields carries its own copy of the licence labels
    // and is a different surface; the signup form re-provides it (MEH-2233).
    expect(he.admin.producers.form.fields.license_what_is_it).toBeUndefined();
    expect(en.admin.producers.form.fields.license_what_is_it).toBeUndefined();
  });
});
