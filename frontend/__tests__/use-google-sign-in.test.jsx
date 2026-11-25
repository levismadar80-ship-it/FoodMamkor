/**
 * lib/use-google-sign-in.js — the one place that adds Google's GSI script.
 *
 * MEH-3690 removed this file's MEH-1784 half (one initialize() per document,
 * the callback routed to the live button): our own Google button opens the
 * popup with a code client of its own, so nothing calls initialize() any more.
 *
 * What is real: loadGsiScript and gsiLang. Only the script's load/error events
 * are fired by the test.
 */
import { describe, it, expect, afterEach, vi } from "vitest";

const GSI = 'script[src^="https://accounts.google.com/gsi/client"]';

async function fresh() {
  vi.resetModules();
  return import("@/lib/use-google-sign-in");
}

afterEach(() => {
  document.querySelectorAll(GSI).forEach((s) => s.remove());
  document.documentElement.lang = "";
  delete window.google;
});

describe("loadGsiScript (MEH-3690)", () => {
  it("resolves at once when the library is already there, adding no tag", async () => {
    window.google = { accounts: {} };
    const { loadGsiScript } = await fresh();
    await expect(loadGsiScript()).resolves.toBeUndefined();
    expect(document.querySelectorAll(GSI)).toHaveLength(0);
  });

  it("adds one tag and resolves when it loads", async () => {
    const { loadGsiScript } = await fresh();
    const done = loadGsiScript();
    expect(document.querySelectorAll(GSI)).toHaveLength(1);
    document.querySelector(GSI).dispatchEvent(new Event("load"));
    await expect(done).resolves.toBeUndefined();
  });

  // DISCRIMINATION: red against an exact `script[src="…/gsi/client"]` lookup,
  // which does not match a src with `?hl=` (MEH-2319).
  it("waits on a tag the preload already added instead of adding a second", async () => {
    const pending = document.createElement("script");
    pending.src = "https://accounts.google.com/gsi/client?hl=he";
    document.body.appendChild(pending);
    const { loadGsiScript } = await fresh();
    const done = loadGsiScript();
    expect(document.querySelectorAll(GSI)).toHaveLength(1);
    pending.dispatchEvent(new Event("load"));
    await expect(done).resolves.toBeUndefined();
  });

  it("rejects and removes a tag that failed, so the next call retries", async () => {
    const { loadGsiScript } = await fresh();
    const done = loadGsiScript();
    document.querySelector(GSI).dispatchEvent(new Event("error"));
    await expect(done).rejects.toThrow("gsi_load_failed");
    expect(document.querySelectorAll(GSI)).toHaveLength(0);
    loadGsiScript().catch(() => {});
    expect(document.querySelectorAll(GSI)).toHaveLength(1);
  });

  it.each([["he", "he"], ["en", "en"]])("loads the library with hl=%s on a %s page", async (lang, hl) => {
    document.documentElement.lang = lang;
    const { loadGsiScript } = await fresh();
    loadGsiScript().catch(() => {});
    expect(new URL(document.querySelector(GSI).src).searchParams.get("hl")).toBe(hl);
  });
});

// The app only ever sets "he" or "en" on <html lang> (app/[locale]/layout.js),
// but the reader is total: region tags and unknown languages fall back sanely.
describe("gsiLang (MEH-2319)", () => {
  it.each([
    ["", "he"],
    ["he", "he"],
    ["he-IL", "he"],
    ["en", "en"],
    ["en-US", "en"],
    ["EN", "en"],
    ["ar", "he"],
  ])("<html lang=%j> → %s", async (lang, expected) => {
    document.documentElement.lang = lang;
    const { gsiLang } = await fresh();
    expect(gsiLang()).toBe(expected);
  });
});
