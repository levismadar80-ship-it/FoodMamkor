import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { pingWhatsAppBeacon } from "@/lib/contact-tracking";

// MEH-1426: pingWhatsAppBeacon must attribute a logged-in WhatsApp click to the
// user. sendBeacon can't carry the Authorization header, so with a token present
// the helper POSTs via fetch(keepalive:true) + Bearer; with no token it falls
// back to sendBeacon (a legitimate anonymous click, user_id=NULL server-side).
//
// MEH-1677 added a SECOND axis: an optional `city`, sent only by
// CoverageRequestCta. sendBeacon cannot set Content-Type: application/json (it
// sends text/plain, which FastAPI rejects with 422), so a city forces the
// fetch(keepalive) path even with no token. That makes the transport a
// token x city MATRIX, not two independent switches, so the cases below cover
// all four cells -- (no-token, no-city) and (token, no-city) predate MEH-1677;
// (no-token, city) and (token, city) are the ones it introduced.
describe("pingWhatsAppBeacon (MEH-1426 auth attribution)", () => {
  const PID = "11111111-1111-1111-1111-111111111111";
  let fetchSpy;
  let beaconSpy;

  beforeEach(() => {
    localStorage.clear();
    fetchSpy = vi.fn(() => Promise.resolve({ ok: true }));
    beaconSpy = vi.fn(() => true);
    vi.stubGlobal("fetch", fetchSpy);
    // navigator.sendBeacon is not implemented in jsdom — define it.
    vi.stubGlobal("navigator", { sendBeacon: beaconSpy });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("logged-in → authenticated fetch(keepalive) with Bearer, no sendBeacon", () => {
    localStorage.setItem("token", "jwt-abc");
    pingWhatsAppBeacon(PID);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe(`/api/producers/${PID}/whatsapp-click`);
    expect(opts.method).toBe("POST");
    expect(opts.keepalive).toBe(true);
    expect(opts.headers.Authorization).toBe("Bearer jwt-abc");
    expect(beaconSpy).not.toHaveBeenCalled();
  });

  it("anonymous (no token) → sendBeacon fallback, no fetch", () => {
    pingWhatsAppBeacon(PID);
    expect(beaconSpy).toHaveBeenCalledTimes(1);
    expect(beaconSpy).toHaveBeenCalledWith(`/api/producers/${PID}/whatsapp-click`);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // MEH-1677 -- the anonymous coverage-CTA path. This is the cell the
  // CoverageRequestCta suite cannot reach: it mocks this module wholesale, so
  // nothing there exercises the real transport. Discriminates against the
  // pre-MEH-1677 implementation (`if (token)`), which routed this to
  // sendBeacon and would fail every assertion below.
  it("anonymous + city → fetch(keepalive) with JSON body, no Bearer, no sendBeacon", () => {
    pingWhatsAppBeacon(PID, "נתניה");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe(`/api/producers/${PID}/whatsapp-click`);
    expect(opts.method).toBe("POST");
    expect(opts.keepalive).toBe(true);
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(opts.headers.Authorization).toBeUndefined();
    expect(JSON.parse(opts.body)).toEqual({ city: "נתניה" });
    expect(beaconSpy).not.toHaveBeenCalled();
  });

  it("logged-in + city → fetch carries BOTH Bearer and the JSON body", () => {
    localStorage.setItem("token", "jwt-abc");
    pingWhatsAppBeacon(PID, "  קרית גת  ");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, opts] = fetchSpy.mock.calls[0];
    expect(opts.headers.Authorization).toBe("Bearer jwt-abc");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    // trimmed at the edge, so the server never stores the padding
    expect(JSON.parse(opts.body)).toEqual({ city: "קרית גת" });
    expect(beaconSpy).not.toHaveBeenCalled();
  });

  // The trim guard, from the other side: a blank city must NOT be treated as a
  // city. Without it an empty CoverageRequestCta submit would force the fetch
  // path and POST `{"city":""}`; here it stays an ordinary anonymous click.
  it("anonymous + whitespace-only city → still sendBeacon, no fetch", () => {
    pingWhatsAppBeacon(PID, "   ");
    expect(beaconSpy).toHaveBeenCalledTimes(1);
    expect(beaconSpy).toHaveBeenCalledWith(`/api/producers/${PID}/whatsapp-click`);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("no producerId → no-op (neither fetch nor beacon)", () => {
    localStorage.setItem("token", "jwt-abc");
    pingWhatsAppBeacon(undefined);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(beaconSpy).not.toHaveBeenCalled();
  });
});
