/**
 * MEH-1405 — producer "my events" manage list.
 *
 * Covers the new logic: renders GET /events/mine (incl. inactive), the
 * cancel/reactivate toggle (PUT is_active flip, optimistic), and delete
 * (window.confirm → DELETE → row removed). AddressSearch/forms are not
 * involved here. Mirrors the mocking style of EventExperienceAddress.test.jsx.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
// Stable router ref — the real next/navigation useRouter is stable across
// renders; returning a fresh object here would re-fire the [..., router] effect
// and re-fetch, masking the optimistic list mutations under test.
const ROUTER = { push: vi.fn() };
// MEH-1639: the dashboard pages import Link/useRouter from the locale-aware
// wrapper now, so the mock has to live on @/i18n/navigation. The
// next/navigation mock below stays for useParams/useSearchParams, which
// createNavigation does not export.
vi.mock("next/navigation", () => ({ useRouter: () => ROUTER }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ROUTER,
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>{children}</a>
  ),
}));
// Stable user/auth ref — the real useAuth holds `user` in useState (stable
// across renders). A fresh object here would re-fire the [user, …] effect and
// re-fetch on every render, re-adding rows removed by the optimistic mutations.
const AUTH = { user: { id: "u1", role: "producer" }, loading: false };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => AUTH }));
vi.mock("@/lib/toast", () => ({ showToast: { error: vi.fn(), success: vi.fn() } }));

const EVENTS = [
  { id: "e1", title: "אירוע פעיל", event_date: "2099-01-01", city: "תל אביב", is_active: true },
  { id: "e2", title: "אירוע מבוטל", event_date: "2099-02-01", city: "חיפה", is_active: false },
];

const L = he.dashboard.producer.manage_events;

async function renderPage() {
  const { default: ManageEventsPage } = await import(
    "@/app/[locale]/producer/dashboard/events/page"
  );
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ManageEventsPage />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: EVENTS });
  api.put.mockResolvedValue({ data: {} });
  api.delete.mockResolvedValue({ data: {} });
});

describe("MEH-1405 — ManageEventsPage", () => {
  it("lists own events with active/canceled badges", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("אירוע פעיל")).toBeInTheDocument());
    expect(screen.getByText("אירוע מבוטל")).toBeInTheDocument();
    expect(screen.getAllByText(L.badge_active).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(L.badge_inactive).length).toBeGreaterThanOrEqual(1);
  });

  it("cancel toggle PUTs is_active:false for an active event", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("אירוע פעיל")).toBeInTheDocument());
    // The active event's toggle shows the "cancel" label.
    fireEvent.click(screen.getByText(L.action_cancel));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/events/e1", { is_active: false }),
    );
  });

  it("delete confirms then DELETEs and removes the row", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    await renderPage();
    await waitFor(() => expect(screen.getByText("אירוע פעיל")).toBeInTheDocument());
    const deleteButtons = screen.getAllByLabelText(L.action_delete);
    fireEvent.click(deleteButtons[0]);
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/events/e1"));
    await waitFor(() => expect(screen.queryByText("אירוע פעיל")).not.toBeInTheDocument());
    confirmSpy.mockRestore();
  });

  it("delete does nothing when confirm is dismissed", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    await renderPage();
    await waitFor(() => expect(screen.getByText("אירוע פעיל")).toBeInTheDocument());
    fireEvent.click(screen.getAllByLabelText(L.action_delete)[0]);
    expect(api.delete).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
