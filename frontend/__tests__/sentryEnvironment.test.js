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
  shouldDropClientEvent,
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

  it("server / edge: by VERCEL_ENV, staging by branch", () => {
    expect(serverSentryEnvironment("production", "main", "production")).toBe("production");
    expect(serverSentryEnvironment("production", "staging", "production")).toBe("production");
    expect(serverSentryEnvironment("preview", "staging", "production")).toBe("staging");
    expect(serverSentryEnvironment("preview", "feature/meh-1-x", "production")).toBe("preview");
    expect(serverSentryEnvironment("preview", undefined, "production")).toBe("preview");
    expect(serverSentryEnvironment("development", undefined, "development")).toBe("development");
  });

  it("server / edge: VERCEL_ENV not exposed keeps the old NODE_ENV label (production never relabelled)", () => {
    expect(serverSentryEnvironment(undefined, undefined, "production")).toBe("production");
    expect(serverSentryEnvironment(undefined, undefined, "development")).toBe("development");
    expect(serverSentryEnvironment(undefined, undefined, undefined)).toBe("development");
  });

  it("browser: lookalike hosts are not production", () => {
    for (const h of ["evilmehamakor.co.il", "mehamakor.co.il.evil.com", "mehamakor.co.il."]) {
      expect(clientSentryEnvironment(h)).not.toBe("production");
    }
  });

  it("an automated browser (navigator.webdriver) is recognised", () => {
    expect(isAutomatedBrowser({ webdriver: true })).toBe(true);
    expect(isAutomatedBrowser({ webdriver: false })).toBe(false);
    expect(isAutomatedBrowser(undefined)).toBe(false);
  });

  it("client guard drops dev and automated browsers, keeps real users", () => {
    expect(shouldDropClientEvent("production", { webdriver: true })).toBe(true);
    expect(shouldDropClientEvent("development", { webdriver: false })).toBe(true);
    expect(shouldDropClientEvent("production", { webdriver: false })).toBe(false);
    expect(shouldDropClientEvent("production", undefined)).toBe(false);
  });

  it("all three Sentry inits use the helpers, none NODE_ENV for the environment", () => {
    for (const f of ["sentry.server.config.js", "sentry.edge.config.js", "instrumentation-client.js"]) {
      const src = readFileSync(path.resolve(__dirname, "..", f), "utf8");
      expect(src, f).toMatch(/environment:\s*\n?\s*process\.env\.\w+ \|\|\s*\n?\s*(server|client)SentryEnvironment\(/);
      expect(src, f).not.toMatch(/environment:[^\n]*NODE_ENV/);
    }
    const client = readFileSync(path.resolve(__dirname, "..", "instrumentation-client.js"), "utf8");
    // Both errors and transactions go through the guard.
    expect(client).toMatch(/beforeSend\(event\) \{\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*if \(shouldDropClientEvent\(/);
    expect(client).toMatch(/beforeSendTransaction: \(event\) =>\s*shouldDropClientEvent\(/);
  });
});
