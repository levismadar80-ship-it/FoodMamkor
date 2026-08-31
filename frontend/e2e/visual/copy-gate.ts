/**
 * Module:   copy-gate
 * Purpose:  Resolve the Hebrew string a VRT-covered surface is supposed to be
 *           rendering, so parity.spec.ts can assert the TEXT as well as the
 *           pixels.
 * Does NOT: touch the page, and does NOT change any threshold.
 *           `playwright.config.ts` is untouched — `maxDiffPixelRatio` stays
 *           0.02 per the 09/08 ruling. This layer is COMPLEMENTARY: pixels keep
 *           guarding geometry, these assertions guard the words.
 * Related:  frontend/e2e/visual/parity.spec.ts (the caller),
 *           frontend/__tests__/CopyGate.test.js (self-test),
 *           frontend/e2e/visual/font-gate.ts (same shape, same reason)
 * History:  MEH-1765 (creation)
 *
 * WHY THIS EXISTS — the measurement, not a hunch (MEH-1765 §2):
 *   `maxDiffPixelRatio: 0.02` is a 25,920 px budget on desktop (1440x900) and
 *   6,688 px on mobile (Pixel 5). Hebrew hero copy is ~2,800 px of ink and a
 *   rewritten tab row ~3,100 px. So a COMPLETE copy change fits inside the
 *   budget and the shot stays green. Two measured escapes:
 *     · home mobile     «מחפשות עכשיו:» -> «פופולרי עכשיו:»   VRT green (MEH-1758)
 *     · producer detail  tab row 4 -> 2 entries               VRT green (MEH-1390)
 *
 *   The second-order effect is what makes it dangerous: `--update-snapshots`
 *   rewrites only a FAILING snapshot, so a passing comparison produces no new
 *   PNG — there is nothing for an eye pass to review and the change leaves no
 *   trace in the diff at all.
 *
 * THE EXPECTED VALUE IS READ FROM he.json AT RUNTIME, NEVER HARDCODED.
 *   That is the whole design, and it is what makes the assertion useful rather
 *   than annoying:
 *     · an APPROVED copy change edits he.json, the assertion follows it, green.
 *     · a CODE change that renders a different key — or nothing — does not move
 *       he.json, so the assertion goes red. That is the escape being caught.
 *   A hardcoded string would invert this: red on every legitimate copy edit,
 *   which is how a guard gets deleted.
 */

/** A messages tree as parsed from `frontend/messages/he.json`. */
export type Messages = { [key: string]: unknown };

export type CopyLookup =
  | { ok: true; value: string }
  | { ok: false; reason: string };

/**
 * Resolve a dotted key against a messages tree.
 *
 * Returns a structured miss rather than throwing, and the three miss reasons
 * are kept distinct on purpose: "absent", "not a string" and "empty" are three
 * different bugs, and collapsing them into one `null` is what makes a resolver
 * impossible to self-test. `parity.spec.ts` surfaces `reason` verbatim, so a
 * red run names which one happened.
 */
export function resolveCopy(messages: Messages, key: string): CopyLookup {
  if (!key) return { ok: false, reason: "empty key requested" };

  let node: unknown = messages;
  const walked: string[] = [];
  for (const segment of key.split(".")) {
    walked.push(segment);
    if (typeof node !== "object" || node === null || Array.isArray(node)) {
      return {
        ok: false,
        reason: `he.json: "${walked.join(".")}" — parent is not an object`,
      };
    }
    node = (node as Record<string, unknown>)[segment];
    if (node === undefined) {
      return { ok: false, reason: `he.json: "${walked.join(".")}" is absent` };
    }
  }

  if (typeof node !== "string") {
    return {
      ok: false,
      reason: `he.json: "${key}" is ${Array.isArray(node) ? "an array" : typeof node}, not a string`,
    };
  }
  if (node.trim() === "") {
    return { ok: false, reason: `he.json: "${key}" is an empty string` };
  }
  return { ok: true, value: node };
}

/**
 * ICU plural / select messages cannot be compared against rendered text — the
 * rendered form depends on runtime `count`, so `he.json`'s raw value never
 * appears on screen. A key like these is a resolver hit and still an unusable
 * assertion target, which is exactly the kind of "green for the wrong reason"
 * this module exists to prevent. Callers must refuse such keys OUT LOUD rather
 * than asserting a substring that happens to survive formatting.
 */
export function isFormattedMessage(value: string): boolean {
  return /\{\s*\w+\s*,\s*(plural|select|selectordinal)\b/.test(value);
}

/**
 * The full decision for one key: usable as a literal text assertion, or not.
 */
export function copyTarget(messages: Messages, key: string): CopyLookup {
  const found = resolveCopy(messages, key);
  if (!found.ok) return found;
  if (isFormattedMessage(found.value)) {
    return {
      ok: false,
      reason: `he.json: "${key}" is an ICU formatted message — its rendered text depends on runtime count, so a literal match would assert a string that never appears. Assert a rendered instance instead, or pick a static key.`,
    };
  }
  return found;
}
