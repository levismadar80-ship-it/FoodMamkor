/**
 * MEH-1404 — AddressSearch → lat/lng wiring in the event + experience
 * create forms.
 *
 * AddressSearch is mocked as a button that fires onSelect with fixed coords
 * (no Nominatim / Google network). We assert the submitted POST body carries
 * lat/lng once an address is picked, and null when the form is submitted with
 * free-text only. CitySearch is mocked to a plain input so it never reaches
 * its own network path. Mirrors EditTabLocationCard.test.jsx.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";

const PICK = { street: "הרצל 1", lat: 32.1, lng: 34.8, city: "תל אביב", displayName: "הרצל 1, תל אביב" };

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));
// MEH-1639: the dashboard pages import Link/useRouter from the locale-aware
// wrapper now, so the mock has to live on @/i18n/navigation. The
// next/navigation mock below stays for useParams/useSearchParams, which
// createNavigation does not export.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>{children}</a>
  ),
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", role: "producer" }, loading: false }),
}));
vi.mock("@/lib/toast", () => ({
  showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
// AddressSearch mocked: a button that fires onSelect (pick) — plus it still
// calls onChange so the free-text path is exercised too.
vi.mock("@/components/AddressSearch", () => ({
  default: ({ onSelect, onChange, id }) => (
    <button type="button" data-testid={`pick-${id}`} onClick={() => onSelect(PICK)}>
      pick-address
    </button>
  ),
}));
vi.mock("@/components/CitySearch", () => ({
  default: ({ value, onChange, id }) => (
    <input aria-label="city" id={id} value={value || ""} onChange={(e) => onChange(e.target.value)} />
  ),
}));

function wrap(node) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {node}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: { status: "approved" } });
  api.post.mockImplementation((url) =>
    Promise.resolve({ data: { id: url === "/events" || url === "/experiences" ? "new-id" : null, status: "APPROVED" } }),
  );
});

describe("MEH-1404 — event create form sends lat/lng", () => {
  it("includes picked coords in the POST /events body", async () => {
    const { default: NewEventPage } = await import(
      "@/app/[locale]/producer/dashboard/events/new/page"
    );
    const { container } = wrap(<NewEventPage />);

    fireEvent.change(container.querySelector("#title"), { target: { value: "סדנת אפייה" } });
    fireEvent.change(container.querySelector("#event_date"), { target: { value: "2026-09-01" } });
    fireEvent.click(screen.getByTestId("pick-location"));
    fireEvent.click(container.querySelector('button[type="submit"]'));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/events", expect.anything()));
    const body = api.post.mock.calls.find((c) => c[0] === "/events")[1];
    expect(body.lat).toBe(32.1);
    expect(body.lng).toBe(34.8);
    expect(body.location).toBe("הרצל 1");
  });

  it("sends lat/lng = null when no address is picked (free-text fallback)", async () => {
    const { default: NewEventPage } = await import(
      "@/app/[locale]/producer/dashboard/events/new/page"
    );
    const { container } = wrap(<NewEventPage />);

    fireEvent.change(container.querySelector("#title"), { target: { value: "סדנת אפייה" } });
    fireEvent.change(container.querySelector("#event_date"), { target: { value: "2026-09-01" } });
    fireEvent.click(container.querySelector('button[type="submit"]'));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/events", expect.anything()));
    const body = api.post.mock.calls.find((c) => c[0] === "/events")[1];
    expect(body.lat).toBeNull();
    expect(body.lng).toBeNull();
  });
});

describe("MEH-1404 — experience create form sends lat/lng", () => {
  it("includes picked coords in the POST /experiences body", async () => {
    const { default: NewExperienceClient } = await import(
      "@/app/[locale]/experiences/new/NewExperienceClient"
    );
    const N = he.experiences.new;
    wrap(<NewExperienceClient />);

    fireEvent.change(screen.getByLabelText(N.field_title), { target: { value: "סדנת בישול קהילתית" } });
    fireEvent.change(screen.getByPlaceholderText(N.field_description_placeholder), {
      target: { value: "תיאור מפורט של הסדנה שלנו שנמשך יותר מעשרים תווים בדיוק" },
    });
    fireEvent.change(screen.getByLabelText(N.field_date), { target: { value: "2026-09-01" } });
    fireEvent.click(screen.getByTestId("pick-experience-address"));
    fireEvent.click(screen.getByRole("button", { name: N.submit_cta }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/experiences", expect.anything()));
    const body = api.post.mock.calls.find((c) => c[0] === "/experiences")[1];
    expect(body.lat).toBe(32.1);
    expect(body.lng).toBe(34.8);
    expect(body.address).toBe("הרצל 1");
  });
});
