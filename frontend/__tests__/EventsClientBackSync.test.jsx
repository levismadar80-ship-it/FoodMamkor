import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import EventsClient from "@/app/[locale]/events/EventsClient";

// MEH-3090: E2E `46-hub-tab-switch.spec.ts:114` — after events → experiences
// (an in-place pushState) and Back, the «אירועים» tab stayed unselected for 20 s
// on a loaded runner. The tab followed history only through
// `useEffect(…, [pathname])`, and Next folds our pushState into its router in a
// transition, so the hook can miss the move entirely; Back then changes no
// pathname the hook ever saw, and nothing re-reads the URL. This pins the case
// with the hook frozen on "/events": a `popstate` alone must bring the tab and
// the URL's filter back.

vi.mock("@/lib/israel-date", () => ({ israelToday: () => "2026-11-18" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => null, getAll: () => [] }),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  // Frozen: the lagging hook this test is about.
  usePathname: () => "/events",
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
  default: ({ children, href }) => <a href={href}>{children}</a>,
}));
const apiGet = vi.fn(() => Promise.resolve({ data: [] }));
vi.mock("@/lib/api", () => ({ default: { get: (...a) => apiGet(...a) } }));
vi.mock("@/components/SaveButton", () => ({ default: () => null }));
vi.mock("@/lib/cloudinary", () => ({ optimizeCloudinary: (u) => u }));
vi.mock("@/lib/format-date", () => ({ formatEventDate: () => "" }));
vi.mock("@/components/Breadcrumb", () => ({ default: () => null }));
vi.mock("@/components/CalendarView", () => ({ default: () => null }));
vi.mock("@/components/CitySearch", () => ({
  default: ({ value, onChange, id }) => (
    <input data-testid="city-input" id={id} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const setUrl = (url) => window.history.replaceState(null, "", url);
const tab = (value) => document.querySelector(`[data-tab-value="${value}"]`);

beforeEach(() => {
  apiGet.mockClear();
  setUrl("/events?city=%D7%97%D7%99%D7%A4%D7%94");
});
afterEach(() => {
  cleanup();
  setUrl("/");
});

describe("EventsClient follows Back even when usePathname never moved (MEH-3090)", () => {
  it("popstate to /events?city= selects «אירועים» and restores the city", async () => {
    render(<EventsClient initialTab="events" />);
    await waitFor(() => expect(screen.getByTestId("city-input")).toHaveValue("חיפה"));
    expect(tab("events")).toHaveAttribute("aria-selected", "true");

    fireEvent.click(tab("experiences"));
    expect(window.location.pathname).toBe("/experiences");
    await waitFor(() => expect(tab("experiences")).toHaveAttribute("aria-selected", "true"));

    // Back: the browser restores the old entry and fires popstate. The
    // mocked hook still says "/events" — it never saw /experiences.
    setUrl("/events?city=%D7%97%D7%99%D7%A4%D7%94");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    await waitFor(() => expect(tab("events")).toHaveAttribute("aria-selected", "true"));
    expect(tab("experiences")).toHaveAttribute("aria-selected", "false");
    await waitFor(() => expect(screen.getByTestId("city-input")).toHaveValue("חיפה"));
  });

  it("a popstate that lands on the tab already shown fetches nothing more", async () => {
    render(<EventsClient initialTab="events" />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    const before = apiGet.mock.calls.length;

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    // Let any effect the event scheduled run.
    await act(async () => {});
    expect(apiGet.mock.calls.length).toBe(before);
    expect(tab("events")).toHaveAttribute("aria-selected", "true");
  });
});
