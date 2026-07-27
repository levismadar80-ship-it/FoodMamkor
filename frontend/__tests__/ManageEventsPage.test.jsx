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
vi.mock("next/navigation", () => ({ useRouter: () => ROUTER }));
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

  // MEH-1655 — create-CTA count per list state. Numeric assertions on purpose:
  // a presence-only check cannot detect the loading-state CTA that used to
  // render and then jump to the EmptyState CTA. Both CTAs are links named
  // create_cta (== empty_cta), so role+name counts them exactly.
  const createCtaCount = () =>
    screen.queryAllByRole("link", { name: L.create_cta }).length;

  it("loading (items === null) renders ZERO create-CTAs", async () => {
    api.get.mockReturnValue(new Promise(() => {})); // never resolves
    await renderPage();
    expect(screen.getByText(L.loading)).toBeInTheDocument();
    expect(createCtaCount()).toBe(0);
  });

  it("empty list renders EXACTLY 1 create-CTA (the EmptyState one)", async () => {
    api.get.mockResolvedValue({ data: [] });
    await renderPage();
    await waitFor(() => expect(screen.getByText(L.empty_title)).toBeInTheDocument());
    expect(createCtaCount()).toBe(1);
  });

  it("non-empty list renders EXACTLY 1 create-CTA (the header one)", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("אירוע פעיל")).toBeInTheDocument());
    expect(createCtaCount()).toBe(1);
    expect(screen.queryByText(L.empty_title)).not.toBeInTheDocument();
  });
});
