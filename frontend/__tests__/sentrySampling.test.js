// MEH-2887: production keeps 10% of traces; staging and previews drop to 1%.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { clientTracesSampleRate, serverTracesSampleRate } from "@/lib/sentry-sampling";

describe("traces sample rate (MEH-2887)", () => {
  it("browser: 0.1 on the production host, 0.01 elsewhere", () => {
    expect(clientTracesSampleRate("mehamakor.co.il")).toBe(0.1);
    expect(clientTracesSampleRate("www.mehamakor.co.il")).toBe(0.1);
    for (const h of ["staging.mehamakor.online", "food-mamkor-abc.vercel.app", "localhost", ""]) {
      expect(clientTracesSampleRate(h)).toBe(0.01);
    }
  });

  it("server / edge: 0.1 only when VERCEL_ENV is production", () => {
    expect(serverTracesSampleRate("production")).toBe(0.1);
    for (const v of ["preview", "development", undefined]) expect(serverTracesSampleRate(v)).toBe(0.01);
  });

  it("all three Sentry inits use the helper, none a hard-coded rate", () => {
    for (const f of ["sentry.server.config.js", "sentry.edge.config.js", "instrumentation-client.js"]) {
      const src = readFileSync(path.resolve(__dirname, "..", f), "utf8");
      expect(src, f).toMatch(/tracesSampleRate:\s*(server|client)TracesSampleRate\(/);
      expect(src, f).not.toMatch(/tracesSampleRate:\s*0\.\d/);
    }
  });
});
