/**
 * MEH-3304 stage 1 — the Report-Only CSP is the enforced CSP minus
 * 'unsafe-eval', nothing else. next.config.js cannot be require()d under the
 * jsdom suite (see PosthogCsp.test.js), so the REAL headers() output is read
 * from a child Node process with placeholder public env.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

const SCRIPT = `require("./next.config.js").headers().then((r) => {
  const h = r.find((x) => x.source === "/(.*)").headers;
  process.stdout.write("@@" + JSON.stringify(Object.fromEntries(h.map((x) => [x.key, x.value]))));
});`;

const out = execFileSync(process.execPath, ["-e", SCRIPT], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NEXT_PUBLIC_API_URL: "https://example.test/api",
    NEXT_PUBLIC_SENTRY_DSN: "https://k@o1.ingest.sentry.io/123",
    VERCEL_ENV: "",
  },
  timeout: 60000,
  stdio: ["ignore", "pipe", "ignore"],
}).toString();
const headers = JSON.parse(out.slice(out.indexOf("@@") + 2));

const directives = (csp) =>
  Object.fromEntries(
    csp.split(";").map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]),
  );

describe("CSP Report-Only (MEH-3304)", () => {
  it("control: the enforced CSP is found and still carries unsafe-eval", () => {
    const enforced = directives(headers["Content-Security-Policy"]);
    expect(enforced["script-src"]).toContain("'unsafe-eval'");
    expect(enforced["report-uri"]?.[0]).toMatch(/ingest\.sentry\.io/);
  });

  it("Report-Only exists and drops unsafe-eval", () => {
    const ro = headers["Content-Security-Policy-Report-Only"];
    expect(ro).toBeTruthy();
    expect(ro).not.toContain("unsafe-eval");
  });

  it("every other directive, report-uri included, matches the enforced one", () => {
    const enforced = directives(headers["Content-Security-Policy"]);
    enforced["script-src"] = enforced["script-src"].filter(
      (s) => s !== "'unsafe-eval'",
    );
    expect(directives(headers["Content-Security-Policy-Report-Only"])).toEqual(
      enforced,
    );
  });
});
