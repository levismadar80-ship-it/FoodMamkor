import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { pingWhatsAppBeacon } from "@/lib/contact-tracking";

// MEH-1426: pingWhatsAppBeacon must attribute a logged-in WhatsApp click to the
// user. sendBeacon can't carry the Authorization header, so with a token present
// the helper POSTs via fetch(keepalive:true) + Bearer; with no token it falls
// back to sendBeacon (a legitimate anonymous click, user_id=NULL server-side).
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

  it("no producerId → no-op (neither fetch nor beacon)", () => {
    localStorage.setItem("token", "jwt-abc");
    pingWhatsAppBeacon(undefined);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(beaconSpy).not.toHaveBeenCalled();
  });
});
