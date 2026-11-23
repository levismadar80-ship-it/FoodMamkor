/**
 * MEH-3733 — Zod's eval probe is off in the browser (lib/zod-csp.js).
 * Without it, Zod calls Function("") once and a CSP without 'unsafe-eval'
 * reports «Blocked unsafe eval()» (MEH-3706).
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  // z.config writes a global that outlives vi.resetModules(); clear it so the
  // jitless setting does not leak into a later test in this worker.
  delete globalThis.__zod_globalConfig;
});

describe("lib/zod-csp", () => {
  it("sets jitless, and an object parse never calls the Function constructor", async () => {
    vi.resetModules();
    const spy = vi.spyOn(globalThis, "Function");
    await import("@/lib/zod-csp");
    const { z } = await import("zod");
    expect(z.config().jitless).toBe(true);
    const schema = z.object({ id: z.string(), price_agorot: z.number(), tags: z.array(z.string()) });
    expect(schema.parse({ id: "a", price_agorot: 1250, tags: ["x"] })).toEqual({ id: "a", price_agorot: 1250, tags: ["x"] });
    expect(spy, "Zod probed eval — the CSP would report it").not.toHaveBeenCalled();
  });

  // Source text, not behaviour (testing.md MEH-3531): which file Next loads
  // first is a fact about the file, which no unit test runs.
  it("instrumentation-client.js imports it before any other module", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "..", "instrumentation-client.js"), "utf8");
    const firstImport = src.split("\n").find((l) => /^import\b/.test(l));
    expect(firstImport, "control: no import line found").toBeTruthy();
    expect(firstImport).toBe('import "./lib/zod-csp";');
  });
});
