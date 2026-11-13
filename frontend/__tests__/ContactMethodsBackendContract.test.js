import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { CONTACT_METHODS } from "@/lib/contact-method";
import {
  CONTACTED_EVENT,
  contactedMethodLocal,
  trackContactClick,
  trackPrimaryCtaClick,
} from "@/lib/contact-tracking";

// MEH-2999 — the review gate has two halves that drifted apart twice:
//   * the SERVER (reviews.py, MEH-2204) accepts a first review after a click on
//     ANY contact channel, but only the channels POST /contact-click accepts can
//     be stored at all (`_VALID_CONTACT_METHODS`, routers/producers.py);
//   * the BROWSER unlocked the form on a WhatsApp click alone, and sent
//     `facebook` / `external_order` clicks the server 422'd.
// This file pins both halves to one list, so a new channel cannot be added on
// one side only.

const here = path.dirname(fileURLToPath(import.meta.url));
const producersPy = readFileSync(
  path.join(here, "..", "..", "backend", "app", "routers", "producers.py"),
  "utf8",
);

/** The string members of `_VALID_CONTACT_METHODS = frozenset({...})`. */
function backendContactMethods(src) {
  const m = src.match(/_VALID_CONTACT_METHODS\s*=\s*frozenset\(\s*\{([\s\S]*?)\}\s*\)/);
  if (!m) return null;
  return [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]).sort();
}

// What the frontend sends to /contact-click: every primary method except
// WhatsApp (which has its own endpoint), plus the updates-link circle.
const frontendSends = [
  ...CONTACT_METHODS.map((c) => c.key).filter((k) => k !== "whatsapp"),
  "whatsapp_group",
].sort();

describe("contact-click methods — frontend and backend list the same channels (MEH-2999)", () => {
  it("self-test: the parser reads a known frozenset, and returns null when there is none", () => {
    expect(
      backendContactMethods('_VALID_CONTACT_METHODS = frozenset(\n    {"phone", "email"}\n)'),
    ).toEqual(["email", "phone"]);
    expect(backendContactMethods("nothing here")).toBeNull();
  });

  it("the real producers.py parses to a non-empty set (the instrument ran)", () => {
    const methods = backendContactMethods(producersPy);
    expect(methods).not.toBeNull();
    expect(methods.length).toBeGreaterThanOrEqual(5);
  });

  it("every channel the frontend sends is accepted, and nothing extra", () => {
    expect(backendContactMethods(producersPy)).toEqual(frontendSends);
  });
});

describe("trackPrimaryCtaClick — every primary channel is recorded and unlocks reviews (MEH-2999)", () => {
  const PID = "22222222-2222-2222-2222-222222222222";
  let fetchSpy;

  beforeEach(() => {
    localStorage.clear();
    fetchSpy = vi.fn(() => Promise.resolve({ ok: true }));
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("navigator", { sendBeacon: vi.fn(() => true) });
    localStorage.setItem("token", "jwt-abc");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Derived from CONTACT_METHODS, so a new channel is covered the day it lands.
  for (const { key } of CONTACT_METHODS) {
    it(`${key}: one click is recorded and the review form unlocks`, () => {
      trackPrimaryCtaClick(PID, key);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchSpy.mock.calls[0];
      if (key === "whatsapp") {
        expect(url).toBe(`/api/producers/${PID}/whatsapp-click`);
      } else {
        expect(url).toBe(`/api/producers/${PID}/contact-click`);
        expect(JSON.parse(opts.body)).toEqual({ method: key });
      }
      expect(contactedMethodLocal(PID)).toBe(key);
    });
  }

  it("a secondary contact-card circle (trackContactClick) unlocks too", () => {
    trackContactClick(PID, "phone");
    expect(contactedMethodLocal(PID)).toBe("phone");
  });

  it("every primary click announces the contact to this page (no reload needed)", () => {
    const seen = [];
    const on = (e) => seen.push(e.detail.producerId);
    window.addEventListener(CONTACTED_EVENT, on);
    for (const { key } of CONTACT_METHODS) trackPrimaryCtaClick(PID, key);
    window.removeEventListener(CONTACTED_EVENT, on);
    expect(seen).toEqual(CONTACT_METHODS.map(() => PID));
  });

  it("no contact → nothing unlocked", () => {
    expect(contactedMethodLocal(PID)).toBeNull();
  });
});
