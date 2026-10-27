/**
 * MEH-2396 — a failed /events load is an error, not a zero.
 *
 * Before: `load()` caught any failure with `setRows([])`, and the page then
 * rendered the editorial "אין אירועים" empty state — a false statement when
 * the backend simply did not answer (seen 26/10 during a Railway redeploy:
 * ~40 s of 502, skeleton on screen the whole time, then the fake empty state).
 *
 * Cells: (a) rejection → the error surface, and NEITHER zero surface;
 * (b) "נסו שוב" issues a new request and the rows it returns render;
 * (c) the request carries a per-call timeout, so a hanging backend cannot pin
 * the skeleton forever. Cell (a)'s absence half is the discriminating one —
 * the old code passed the presence of *a* surface and failed exactly this.
 *
 * Harness mirrors __tests__/EventsEmptyStates.test.jsx; only the api mock
 * differs (it can reject).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import EventsClient from "@/app/[locale]/events/EventsClient";

let params = {};
let responder = () => Promise.resolve({ data: [] });
const getMock = vi.fn((endpoint, config) => responder(endpoint, config));

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: (k) => (k in params ? params[k] : null) }),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  Link: ({ children, href, ...props }) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next-intl", () => ({
  useTranslations: (ns) => (k) => (ns ? `${ns}.${k}` : k),
  useLocale: () => "he",
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@phosphor-icons/react", () => {
  const Stub = () => null;
  return Object.fromEntries(
    [
      "ArrowCounterClockwise", "ArrowRight", "Basket", "CalendarBlank",
      "CalendarX", "CookingPot", "Drop", "MapTrifold", "Path", "Plant",
      "Plus", "Rows", "Storefront",
    ].map((name) => [name, Stub]),
  );
});
vi.mock("@/lib/api", () => ({ default: { get: (...a) => getMock(...a) } }));
vi.mock("@/lib/cloudinary", () => ({ optimizeCloudinary: (u) => u }));
vi.mock("@/lib/format-date", () => ({ formatEventDate: () => "" }));
vi.mock("@/components/Breadcrumb", () => ({ default: () => null }));
vi.mock("@/components/CalendarView", () => ({ default: () => null }));
vi.mock("@/components/CitySearch", () => ({ default: () => <input data-testid="city-input" /> }));
// The chip row exposes one button so a test can change the category filter
// (which re-runs load) while a previous request is still pending — cell (d).
vi.mock("@/components/ChipScrollRow", () => ({
  default: ({ onChipClick }) => (
    <button type="button" data-testid="chip-harvest" onClick={() => onChipClick("harvest")} />
  ),
}));

const row = (id) => ({
  id,
  title: `event ${id}`,
  event_date: "2026-09-0" + id,
  event_time: "10:00",
  city: "חיפה",
  category: "harvest",
  price: 0,
  producer_name: "בית עסק",
  description: "",
});

const settle = async () => {
  await waitFor(() => {
    expect(screen.queryByRole("status")).toBeNull();
  });
};

beforeEach(() => {
  params = {};
  getMock.mockClear();
  window.history.replaceState(null, "", "/events");
});
afterEach(cleanup);

describe("/events — a failed load is an error, not a zero (MEH-2396)", () => {
  it("(a) rejection → the error surface with a retry, and NEITHER zero surface", async () => {
    responder = () => Promise.reject(new Error("timeout of 15000ms exceeded"));
    render(<EventsClient initialTab="events" />);
    await settle();
    expect(screen.getByTestId("events-load-error")).toBeInTheDocument();
    expect(screen.getByTestId("events-retry")).toHaveTextContent("error.retry");
    // The load-bearing half: the old code rendered this on a failure.
    expect(screen.queryByTestId("events-empty-dataset")).not.toBeInTheDocument();
    expect(screen.queryByTestId("events-no-results")).not.toBeInTheDocument();
  });

  it("(b) retry issues a new request, and the rows it returns render", async () => {
    let calls = 0;
    responder = () => {
      calls += 1;
      return calls === 1
        ? Promise.reject(new Error("boom"))
        : Promise.resolve({ data: [row(1), row(2)] });
    };
    render(<EventsClient initialTab="events" />);
    await settle();
    expect(screen.getByTestId("events-load-error")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("events-retry"));
    await settle();
    expect(calls).toBe(2);
    expect(screen.queryByTestId("events-load-error")).not.toBeInTheDocument();
    expect(screen.getByText("event 1")).toBeInTheDocument();
    expect(screen.getByText("event 2")).toBeInTheDocument();
  });

  it("(d) a late result from a superseded request is ignored — the retry's rows win", async () => {
    // First request hangs; the retry answers at once; then the first one
    // finally rejects. Without the ticket guard the late rejection flips the
    // page back to the error surface over the rows the retry rendered.
    let rejectFirst;
    let calls = 0;
    responder = () => {
      calls += 1;
      if (calls === 1) return new Promise((_, reject) => { rejectFirst = reject; });
      return Promise.resolve({ data: [row(1)] });
    };
    render(<EventsClient initialTab="events" />);
    await waitFor(() => expect(calls).toBe(1));
    // change a filter while the first request is still in flight (the skeleton
    // is up, so there is no retry button yet) — that issues request #2
    fireEvent.click(screen.getByTestId("chip-harvest"));
    await waitFor(() => expect(calls).toBe(2));
    await settle();
    expect(screen.getByText("event 1")).toBeInTheDocument();
    rejectFirst(new Error("timeout of 15000ms exceeded"));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId("events-load-error")).not.toBeInTheDocument();
    expect(screen.getByText("event 1")).toBeInTheDocument();
  });

  it("(c) the list request carries a per-call timeout", async () => {
    responder = () => Promise.resolve({ data: [] });
    render(<EventsClient initialTab="events" />);
    await settle();
    const listCall = getMock.mock.calls.find(([endpoint]) => endpoint === "/events");
    expect(listCall).toBeDefined();
    expect(listCall[1].timeout).toBeGreaterThan(0);
    expect(listCall[1].timeout).toBeLessThanOrEqual(15000);
  });
});
