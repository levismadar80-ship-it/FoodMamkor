import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * MEH-2453 — the create form's 3-letter floor on «מתי ואיך מקבלים» counts the
 * same letters as the server's (`_LETTER_REGEX` in schemas.py). If the two
 * drift, the form blocks a note the server would take, or lets through one it
 * rejects with a raw 422. The client copy cannot import the Python regex, so
 * this pins the two character classes to each other textually.
 */
const SCHEMAS = readFileSync(resolve(__dirname, "../../backend/app/schemas/schemas.py"), "utf8");
const PAGE = readFileSync(
  resolve(__dirname, "../app/[locale]/producer/dashboard/group-buys/page.js"),
  "utf8",
);

// Python: _LETTER_REGEX = re.compile(\n    r"[^<class>]"\n)
const serverClass = SCHEMAS.match(/_LETTER_REGEX = re\.compile\(\s*r"\[\^([^\]]+)\]"/)?.[1];
// JS: const NOTE_LETTER = /[<class>]/g;
const clientClass = PAGE.match(/const NOTE_LETTER = \/\[([^\]]+)\]\/g;/)?.[1];

describe("fulfillment-note letter class: client ↔ server (MEH-2453)", () => {
  it("control: both definitions are found, and both cover Hebrew", () => {
    expect(serverClass).toBeTruthy();
    expect(clientClass).toBeTruthy();
    expect(serverClass).toContain("\\u05d0-\\u05ea");
  });

  it("the form counts exactly the letters the server counts", () => {
    expect(clientClass).toBe(serverClass);
  });
});
