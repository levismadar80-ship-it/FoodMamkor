import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { StrictMode, useEffect, useRef, useState } from "react";

import { trackProducerView } from "@/lib/contact-tracking";

// MEH-2159: view counting moved off GET /producers/{id} and onto an explicit
// browser beacon. Two properties have to hold, and each has bitten before:
//
//   1. EXACTLY ONE POST per producer per page load. Not two (the /producer/
//      {uuid} route used to record twice — SSR plus client) and not zero (the
//      /{slug} route used to record nothing, because its fetch effect
//      short-circuits on initialProducer).
//
//   2. The guard survives BOTH ways a naive boolean fails: StrictMode
//      double-invoking effects in development, and [slug]/page.js:107-109
//      reusing one ProducerDetail instance across slugs.
//
// The hook itself is not imported here — it pulls @/lib/api, Sentry and the
// recently-viewed store, none of which this behaviour depends on. What is
// reproduced is the exact guard shape from useProducerData.js, and the real
// `trackProducerView` is exercised against a stubbed fetch. See the
// "guard shape parity" test at the bottom, which is what keeps the copy
// honest.

const PID_A = "aaaaaaaa-1111-1111-1111-111111111111";
const PID_B = "bbbbbbbb-2222-2222-2222-222222222222";

/** Verbatim guard shape from useProducerData.js — id-keyed ref, not boolean. */
function useViewBeacon(producer) {
  const reportedViewFor = useRef(null);
  useEffect(() => {
    if (!producer?.id) return;
    if (reportedViewFor.current === producer.id) return;
    reportedViewFor.current = producer.id;
    let referrer = null;
    try {
      referrer = new URLSearchParams(window.location.search).get("from");
    } catch {
      // a missing referrer is a valid view
    }
    trackProducerView(producer.id, referrer);
  }, [producer?.id]);
}

function Detail({ producer }) {
  useViewBeacon(producer);
  return <div data-testid="detail">{producer?.id ?? "loading"}</div>;
}

describe("MEH-2159 — producer view beacon fires exactly once per producer", () => {
  let fetchSpy;

  beforeEach(() => {
    localStorage.clear();
    fetchSpy = vi.fn(() => Promise.resolve({ ok: true }));
    vi.stubGlobal("fetch", fetchSpy);
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const viewCalls = () =>
    fetchSpy.mock.calls.filter(([url]) => String(url).endsWith("/view"));

  it("fires exactly one POST /view for a producer present on first render (the /{slug} route)", async () => {
    // The slug route seeds initialProducer from SSR, so the producer is
    // already there on mount and the fetch effect never runs. This is the
    // route that recorded ZERO views before this ticket.
    render(<Detail producer={{ id: PID_A }} />);
    await waitFor(() => expect(viewCalls()).toHaveLength(1));

    const [url, opts] = viewCalls()[0];
    expect(url).toBe(`/api/producers/${PID_A}/view`);
    expect(opts.method).toBe("POST");
    expect(opts.keepalive).toBe(true);
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(opts.body)).toEqual({ referrer: null });
  });

  it("fires exactly one POST /view when the producer arrives later (the /producer/{uuid} route)", async () => {
    // The uuid route renders with no producer and fills it in from the client
    // fetch. Must be one call in total, not one per render.
    function Wrapper() {
      const [producer, setProducer] = useState(null);
      useEffect(() => {
        const t = setTimeout(() => setProducer({ id: PID_A }), 0);
        return () => clearTimeout(t);
      }, []);
      return <Detail producer={producer} />;
    }
    render(<Wrapper />);
    await waitFor(() => expect(viewCalls()).toHaveLength(1));
    expect(viewCalls()[0][0]).toBe(`/api/producers/${PID_A}/view`);
  });

  it("does not fire while the producer is still null", async () => {
    render(<Detail producer={null} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(viewCalls()).toHaveLength(0);
  });

  it("re-renders with the SAME producer do not add a second POST", async () => {
    const { rerender } = render(<Detail producer={{ id: PID_A }} />);
    await waitFor(() => expect(viewCalls()).toHaveLength(1));
    // A new object with the same id — the effect dep is producer?.id, so this
    // must not re-fire.
    rerender(<Detail producer={{ id: PID_A }} />);
    rerender(<Detail producer={{ id: PID_A }} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(viewCalls()).toHaveLength(1);
  });

  it("StrictMode double-invocation still yields exactly one POST", async () => {
    // React 18+ StrictMode mounts, unmounts and remounts every effect in dev.
    // A `useRef(false)` boolean survives this too, so this case ALONE does not
    // justify the id-keyed ref — the next test is the one that does.
    render(
      <StrictMode>
        <Detail producer={{ id: PID_A }} />
      </StrictMode>,
    );
    await waitFor(() => expect(viewCalls()).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(viewCalls()).toHaveLength(1);
  });

  it("a SECOND producer on a reused instance is counted — the case a boolean guard loses", async () => {
    // THE discriminating test. [slug]/page.js:107-109 keeps one ProducerDetail
    // instance alive across slugs, so the ref persists between businesses. A
    // `useRef(false)` flag latches after the first and every subsequent
    // business silently stops counting — zero views, no error, no failing
    // test anywhere else in this file.
    const { rerender } = render(<Detail producer={{ id: PID_A }} />);
    await waitFor(() => expect(viewCalls()).toHaveLength(1));

    rerender(<Detail producer={{ id: PID_B }} />);
    await waitFor(() => expect(viewCalls()).toHaveLength(2));

    expect(viewCalls().map(([u]) => u)).toEqual([
      `/api/producers/${PID_A}/view`,
      `/api/producers/${PID_B}/view`,
    ]);

    // and navigating BACK to the first one counts again — it is a new page
    // view, not a duplicate of the earlier one.
    rerender(<Detail producer={{ id: PID_A }} />);
    await waitFor(() => expect(viewCalls()).toHaveLength(3));
  });

  it("sends the ?from= value off the PAGE url as the referrer", async () => {
    window.history.replaceState({}, "", "/some-slug?from=search");
    render(<Detail producer={{ id: PID_A }} />);
    await waitFor(() => expect(viewCalls()).toHaveLength(1));
    expect(JSON.parse(viewCalls()[0][1].body)).toEqual({ referrer: "search" });
  });

  it("attaches the bearer token when one is stored", async () => {
    localStorage.setItem("token", "jwt-abc");
    render(<Detail producer={{ id: PID_A }} />);
    await waitFor(() => expect(viewCalls()).toHaveLength(1));
    expect(viewCalls()[0][1].headers.Authorization).toBe("Bearer jwt-abc");
  });

  it("omits Authorization when anonymous", async () => {
    render(<Detail producer={{ id: PID_A }} />);
    await waitFor(() => expect(viewCalls()).toHaveLength(1));
    expect(viewCalls()[0][1].headers.Authorization).toBeUndefined();
  });

  it("a rejected beacon is swallowed and never reaches the caller", async () => {
    fetchSpy.mockImplementation(() => Promise.reject(new Error("offline")));
    const onError = vi.fn();
    window.addEventListener("unhandledrejection", onError);
    render(<Detail producer={{ id: PID_A }} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(onError).not.toHaveBeenCalled();
    window.removeEventListener("unhandledrejection", onError);
  });

  it("guard shape parity — the hook's real guard is id-keyed, not a boolean", async () => {
    // The tests above exercise a local copy of the guard, so this asserts the
    // copy has not drifted from the file that ships. Reading the real source
    // is what makes the copy evidence rather than decoration (the repo's
    // "anchor at least one case to a real file" rule).
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.resolve(
        process.cwd(),
        "app/[locale]/producer/[id]/hooks/useProducerData.js",
      ),
      "utf8",
    );
    expect(src).toContain("const reportedViewFor = useRef(null)");
    expect(src).toContain("if (reportedViewFor.current === producer.id) return");
    expect(src).toContain("trackProducerView(producer.id, referrer)");
    // and the failure mode this ticket exists to prevent, spelled out:
    expect(src).not.toContain("useRef(false)");
  });
});
