/**
 * MEH-2249 — experience creation lives under the producer dashboard.
 *
 * The real UX gate is producer/dashboard/DashboardLayoutClient.jsx (401 → /login?redirect=,
 * 403 → the in-app denied state), which returns before this page mounts. This
 * suite covers the page's own duplicate guard — the one the layout comment
 * says child pages keep until its Phase 2 — plus the crumb wiring.
 *
 * State matrix (role × loading): producer/settled → form; consumer/settled →
 * no form, pushed to /login; anonymous/settled → same; anyone/loading →
 * neither (no premature bounce).
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

let authState = { user: null, loading: true };
const pushMock = vi.fn();

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }),
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>{children}</a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authState }));
vi.mock("@/lib/toast", () => ({
  showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@phosphor-icons/react", () => ({ Leaf: () => null }));
vi.mock("@/components/ExperienceForm", () => ({
  default: ({ cancelHref, initial }) => (
    <form data-testid="experience-form" data-cancel={cancelHref} data-initial-title={initial?.title ?? ""} data-initial-date={initial ? initial.event_date : "none"} />
  ),
}));
const apiGet = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ default: { get: apiGet } }));

import NewExperiencePage from "@/app/[locale]/producer/dashboard/experiences/new/page";

const wrap = () =>
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <NewExperiencePage />
    </NextIntlClientProvider>
  );

beforeEach(() => pushMock.mockClear());
afterEach(cleanup);

describe("/producer/dashboard/experiences/new (MEH-2249)", () => {
  it("producer: renders ExperienceForm, cancels back to the dashboard list, no redirect", () => {
    authState = { user: { id: "u1", role: "producer" }, loading: false };
    wrap();

    expect(screen.getByTestId("experience-form")).toHaveAttribute(
      "data-cancel",
      "/producer/dashboard/experiences"
    );
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("producer: crumb reads ניהול העסק › חוויה חדשה, linking to the list", () => {
    authState = { user: { id: "u1", role: "producer" }, loading: false };
    wrap();

    const crumbLink = screen.getByRole("link", {
      name: he.sweep_tail.event_new.crumb_dashboard,
    });
    expect(crumbLink).toHaveAttribute("href", "/producer/dashboard/experiences");
    expect(screen.getByText(he.experiences.new.crumb_current)).toBeInTheDocument();
  });

  it("consumer: no form, pushed to /login (the layout's denied state is the real gate)", async () => {
    authState = { user: { id: "u2", role: "consumer" }, loading: false };
    wrap();

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/login"));
    expect(screen.queryByTestId("experience-form")).toBeNull();
  });

  it("anonymous: no form, pushed to /login", async () => {
    authState = { user: null, loading: false };
    wrap();

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/login"));
    expect(screen.queryByTestId("experience-form")).toBeNull();
  });

  it("still loading: neither form nor redirect", () => {
    authState = { user: null, loading: true };
    wrap();

    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("experience-form")).toBeNull();
  });

  // MEH-3438: «שכפול» lands here with ?from=<id>.
  it("?from=<own id>: the form opens seeded, date cleared, with the copied-from line", async () => {
    authState = { user: { id: "u1", role: "producer" }, loading: false };
    window.history.replaceState(null, "", "/?from=x1");
    apiGet.mockResolvedValue({ data: [{ id: "x1", title: "סיור במטע", event_date: "2099-03-01" }] });
    wrap();
    const form = await screen.findByTestId("experience-form");
    expect(apiGet).toHaveBeenCalledWith("/experiences/mine");
    expect(form).toHaveAttribute("data-initial-title", "סיור במטע");
    expect(form).toHaveAttribute("data-initial-date", "");
    expect(screen.getByTestId("duplicate-note")).toHaveTextContent("הפרטים הועתקו מ«סיור במטע». נשאר לבחור תאריך.");
    window.history.replaceState(null, "", "/");
  });

  it("no ?from: an empty form and no copied-from line", () => {
    authState = { user: { id: "u1", role: "producer" }, loading: false };
    wrap();
    expect(screen.getByTestId("experience-form")).toHaveAttribute("data-initial-date", "none");
    expect(screen.queryByTestId("duplicate-note")).toBeNull();
  });
});
