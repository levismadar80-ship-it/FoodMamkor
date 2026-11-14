// Staging events reached Sentry labelled "production" (NODE_ENV is
// "production" in every Vercel build), so a burst of staging QA traffic on
// 14/11 sent an «Escalating issue» email for production. The environment now
// comes from where the code actually runs, and automated browsers are dropped.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  clientSentryEnvironment,
  serverSentryEnvironment,
  isAutomatedBrowser,
} from "@/lib/sentry-environment";

describe("Sentry environment label", () => {
  it("browser: production only on the production host", () => {
    expect(clientSentryEnvironment("mehamakor.co.il")).toBe("production");
    expect(clientSentryEnvironment("WWW.mehamakor.co.il")).toBe("production");
    expect(clientSentryEnvironment("staging.mehamakor.online")).toBe("staging");
    expect(clientSentryEnvironment("food-mamkor-abc123.vercel.app")).toBe("preview");
    expect(clientSentryEnvironment("localhost")).toBe("development");
    expect(clientSentryEnvironment("")).toBe("development");
  });

  it("server / edge: production only when VERCEL_ENV is production", () => {
    expect(serverSentryEnvironment("production", "main")).toBe("production");
    expect(serverSentryEnvironment("preview", "staging")).toBe("staging");
    expect(serverSentryEnvironment("preview", "feature/meh-1-x")).toBe("preview");
    expect(serverSentryEnvironment("preview", undefined)).toBe("preview");
    expect(serverSentryEnvironment(undefined, undefined)).toBe("development");
  });

  it("an automated browser (navigator.webdriver) is recognised", () => {
    expect(isAutomatedBrowser({ webdriver: true })).toBe(true);
    expect(isAutomatedBrowser({ webdriver: false })).toBe(false);
    expect(isAutomatedBrowser(undefined)).toBe(false);
  });

  it("all three Sentry inits use the helpers, none NODE_ENV for the environment", () => {
    for (const f of ["sentry.server.config.js", "sentry.edge.config.js", "instrumentation-client.js"]) {
      const src = readFileSync(path.resolve(__dirname, "..", f), "utf8");
      expect(src, f).toMatch(/environment:\s*\n?\s*process\.env\.\w+ \|\|\s*\n?\s*(server|client)SentryEnvironment\(/);
      expect(src, f).not.toMatch(/environment:[^\n]*NODE_ENV/);
    }
    const client = readFileSync(path.resolve(__dirname, "..", "instrumentation-client.js"), "utf8");
    expect(client).toMatch(/isAutomatedBrowser\(/);
  });
});
