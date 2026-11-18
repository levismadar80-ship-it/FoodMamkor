/**
 * MEH-151 — the sr-only business index /map renders for Googlebot.
 *
 * MEH-0000 rewrote this file. Every case in it used to re-implement
 * fetchProducersForSSR inline — "Instead, inline the same logic to verify
 * contract", in the file's own words — and never imported the page or the
 * helper. All six would have passed with the real function DELETED. One case
 * was worse still: `expect(true).toBe(false)` sat inside a `try` whose
 * `catch {}` swallowed the thrown assertion, after which it asserted that a
 * literal `[]` it had just written had length 0.
 *
 * The helper now lives in lib/map-ssr-producers.js precisely so it can be
 * imported, and this file imports it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// A plain function, deliberately NOT vi.fn(). vi.fn() keeps every result in
// mock.results, and a result that is a thrown error or a rejected promise is
// reported by vitest as an unhandled one — the case below then goes red even
// though the helper caught it and returned []. Measured: `out=[] err=null`,
// test still failed. Calls are recorded by hand instead; it is three lines.
let impl = async () => ({ ok: true, json: async () => [] });
const calls = [];
vi.mock("@/lib/server-fetch", () => ({
  serverFetch: (...args) => {
    calls.push(args);
    return impl(...args);
  },
}));
vi.mock("@/lib/env", () => ({ API_URL: "https://api.example.test", SITE_URL: "https://mehamakor.co.il" }));

const { fetchProducersForSSR } = await import("@/lib/map-ssr-producers");

beforeEach(() => {
  calls.length = 0;
  impl = async () => ({ ok: true, json: async () => [] });
});

describe("fetchProducersForSSR — the real one", () => {
  it("is the function under test, not a copy of it", () => {
    // The control. The point of this rewrite is that the subject is imported;
    // if that ever stops being true, every case below becomes a test of its
    // own fixture again, which is what it was before.
    expect(typeof fetchProducersForSSR).toBe("function");
    expect(fetchProducersForSSR.name).toBe("fetchProducersForSSR");
  });

  it("returns the businesses on success, and asks the right URL", async () => {
    const rows = [
      { id: "1", name: "חוות הגליל", city: "מגדל", slug: "havat-hagalil" },
      { id: "2", name: "מאפיית לחם", city: "תל אביב", slug: "maafiyat-lechem" },
    ];
    impl = async () => ({ ok: true, json: async () => rows });

    const producers = await fetchProducersForSSR();

    expect(producers).toHaveLength(2);
    expect(producers[0].slug).toBe("havat-hagalil");
    // The call itself is part of the contract: a helper that returned the right
    // shape from the wrong endpoint would have passed the old file.
    expect(calls).toHaveLength(1);
    const [url, options] = calls[0];
    expect(url).toBe("https://api.example.test/producers?limit=100&offset=0");
    expect(options).toEqual({ next: { revalidate: 3600 } });
  });

  it("returns [] when the fetch throws", async () => {
    impl = async () => {
      throw new Error("network error");
    };
    // No try/catch around the call. The helper's own catch is the subject: if
    // it ever stops swallowing, this REJECTS and the case fails — which is
    // precisely what the old `try { expect(true).toBe(false) } catch {}` could
    // never do, because its catch ate the assertion.
    await expect(fetchProducersForSSR()).resolves.toEqual([]);
  });

  it("returns [] on a non-ok response, without reading the body", async () => {
    const json = vi.fn();
    impl = async () => ({ ok: false, json });
    await expect(fetchProducersForSSR()).resolves.toEqual([]);
    expect(json).not.toHaveBeenCalled();
  });

  it("returns [] when the payload is not an array", async () => {
    impl = async () => ({ ok: true, json: async () => ({ detail: "nope" }) });
    await expect(fetchProducersForSSR()).resolves.toEqual([]);
  });

  it("returns [] when the body is not JSON", async () => {
    impl = async () => ({
      ok: true,
      json: async () => { throw new SyntaxError("Unexpected token <"); },
    });
    await expect(fetchProducersForSSR()).resolves.toEqual([]);
  });
});
