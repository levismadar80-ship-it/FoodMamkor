/**
 * MEH-2784 — an unapproved business is told BEFORE it fills the publish form.
 *
 * The server refuses it (rescue.py:351, 403). The form used to render anyway,
 * so a pending business filled every field and learned only after «לפרסם»
 * (Sapir's screenshot, 6/11). Keys resolve against the real he.json.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import heMessages from "../messages/he.json";

const lookup = (key) => key.split(".").reduce((o, k) => (o == null ? o : o[k]), heMessages);
vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key, values = {}) => {
    const raw = lookup(ns ? `${ns}.${key}` : key);
    return typeof raw === "string" ? raw.replace(/\{(\w+)\}/g, (_m, k) => String(values[k] ?? `{${k}}`)) : raw;
  },
}));

const get = vi.fn();
vi.mock("@/lib/api", () => ({ default: { get: (...a) => get(...a), post: vi.fn(), put: vi.fn() } }));

const { default: RescueTab } = await import("@/components/dashboard/RescueTab");

function mockStatus(status) {
  get.mockImplementation((url) => {
    if (url === "/producers/me") return Promise.resolve({ data: { name: "מאפיית בדיקה", status } });
    if (url === "/producers/me/locations") return Promise.resolve({ data: [{ id: "l", location_precision: "exact" }] });
    if (String(url).includes("typical-items")) return Promise.resolve({ data: { items: [] } });
    return Promise.resolve({ data: [] });
  });
}

describe("RescueTab — approval gate (MEH-2784)", () => {
  beforeEach(() => get.mockReset());

  it("pending: banner up front, no publish form", async () => {
    mockStatus("pending");
    render(<RescueTab />);
    const banner = await screen.findByTestId("rescue-pending-banner");
    expect(banner.textContent).toContain("הכלי ייפתח אחרי שהעסק יאושר");
    expect(banner.textContent).toContain("אנחנו בודקים את פרטי העסק, לרוב עד 3 ימי עסקים.");
    expect(screen.getByText("אחרי האישור יופיע כאן טופס: כמה סלים, מחיר ושעות איסוף.")).toBeTruthy();
    expect(screen.queryByTestId("rescue-publish-tomorrow")).toBeNull();
  });

  it("rejected: the server's line, no «we are reviewing», no form", async () => {
    mockStatus("rejected");
    render(<RescueTab />);
    const line = await screen.findByTestId("rescue-not-approved");
    expect(line.textContent).toBe("רק בית עסק מאושר יכול לפרסם סל הפתעה");
    expect(screen.queryByTestId("rescue-pending-banner")).toBeNull();
    expect(screen.queryByTestId("rescue-publish-tomorrow")).toBeNull();
  });

  it("suspended: open orders stay workable, only publishing is gated", async () => {
    mockStatus("suspended");
    render(<RescueTab />);
    await screen.findByTestId("rescue-not-approved");
    expect(screen.getByTestId("rescue-counters")).toBeTruthy();
    expect(screen.queryByTestId("rescue-publish-tomorrow")).toBeNull();
  });

  it("approved: the form, no gate", async () => {
    mockStatus("approved");
    render(<RescueTab />);
    await screen.findByTestId("rescue-publish-tomorrow");
    expect(screen.queryByTestId("rescue-pending-banner")).toBeNull();
    expect(screen.queryByTestId("rescue-not-approved")).toBeNull();
  });

  it("status read fails: falls back to the form (the server still guards)", async () => {
    get.mockImplementation((url) =>
      url === "/producers/me"
        ? Promise.reject(new Error("net"))
        : url === "/producers/me/locations"
          ? Promise.resolve({ data: [{ id: "l", location_precision: "exact" }] })
          : Promise.resolve({ data: [] }),
    );
    render(<RescueTab />);
    await waitFor(() => expect(screen.getByTestId("rescue-publish-tomorrow")).toBeTruthy());
  });
});
