import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";

import useIsraelToday from "@/lib/use-israel-today";
import { RENDER_TIME_META } from "@/lib/render-time";

// MEH-3861: a page cached on the server before midnight and hydrated after it.
// The hook must hydrate with the server's day (no React 418, no re-render of
// the subtree) and then move to the browser's day.

function Day() {
  return <p data-testid="day">{useIsraelToday()}</p>;
}

// 23:59:30 and 00:01:00 in Israel (winter, UTC+2).
const SERVER_AT = Date.parse("2026-11-26T21:59:30Z");
const CLIENT_AT = Date.parse("2026-11-26T22:01:00Z");

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
  document.head.querySelectorAll(`meta[name="${RENDER_TIME_META}"]`).forEach((m) => m.remove());
});

/** Server HTML at `serverAt` (with its render-time tag, as the layout writes it), hydrated at `clientAt`. */
async function hydrateAcross(serverAt, clientAt, { withTag = true } = {}) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(serverAt);
  const html = renderToString(<Day />);
  if (withTag) {
    const meta = document.createElement("meta");
    meta.setAttribute("name", RENDER_TIME_META);
    meta.setAttribute("content", new Date(serverAt).toISOString());
    document.head.appendChild(meta);
  }
  vi.setSystemTime(clientAt);
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.appendChild(host);
  const recoverable = [];
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  await act(async () => {
    hydrateRoot(host, <Day />, { onRecoverableError: (e) => recoverable.push(e) });
  });
  const hydrationLogs = consoleError.mock.calls.filter((c) => /hydrat|did not match/i.test(String(c[0])));
  consoleError.mockRestore();
  return { html, host, recoverable, hydrationLogs };
}

describe("useIsraelToday across midnight (MEH-3861)", () => {
  it("server HTML from 23:59 Thursday, hydrated at 00:01 Friday: no hydration error, ends on Friday", async () => {
    const { html, host, recoverable, hydrationLogs } = await hydrateAcross(SERVER_AT, CLIENT_AT);
    expect(html).toContain("2026-11-26");
    expect(recoverable).toEqual([]);
    expect(hydrationLogs).toEqual([]);
    expect(host.textContent).toBe("2026-11-27");
  });

  it("same day on both sides: the day, no error", async () => {
    const { host, recoverable } = await hydrateAcross(SERVER_AT - 3_600_000, SERVER_AT);
    expect(recoverable).toEqual([]);
    expect(host.textContent).toBe("2026-11-26");
  });

  it("a mount after hydration reads the browser's day, not the tag", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const meta = document.createElement("meta");
    meta.setAttribute("name", RENDER_TIME_META);
    meta.setAttribute("content", new Date(SERVER_AT).toISOString());
    document.head.appendChild(meta);
    vi.setSystemTime(CLIENT_AT);
    const { render } = await import("@testing-library/react");
    const { getByTestId } = render(<Day />);
    expect(getByTestId("day").textContent).toBe("2026-11-27");
  });
});
