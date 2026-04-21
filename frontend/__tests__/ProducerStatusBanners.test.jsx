/**
 * MEH-157 — producer status banners in dashboard
 * Tests that pending / rejected / approved states render the correct banner.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

// --- mock next/navigation ---
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

// --- mock next/link ---
vi.mock("next/link", () => ({
  default: ({ href, children, className }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

// --- mock holidays (return null so no holiday banner interferes) ---
vi.mock("@/lib/holidays", () => ({ getUpcomingHoliday: () => null }));

// --- shared api response ref so each test can control data ---
const apiRef = { current: {} };

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn((url) => {
      if (url === "/producers/me/dashboard") return Promise.resolve({ data: apiRef.current.dashboard });
      if (url === "/producers/me/analytics") return Promise.resolve({ data: null });
      if (url === "/producers/me") return Promise.resolve({ data: null });
      return Promise.resolve({ data: null });
    }),
  },
}));

// --- mock auth so user is always a producer ---
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", name: "שרה", role: "producer" },
    loading: false,
  }),
}));

function makeDashboard(status) {
  return {
    producer: {
      id: "p1",
      name: "חוות הבוקר",
      status,
      slug: "chavat-haboker",
      is_available_today: true,
      availability_status: "available",
      plan: "free",
    },
    favorites_count: 0,
    whatsapp_clicks_week: 0,
  };
}

describe("producer dashboard status banners", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("shows pending banner when status is pending", async () => {
    apiRef.current.dashboard = makeDashboard("pending");
    const { default: Page } = await import("../app/producer/dashboard/page.js");
    const { findByText } = render(<Page />);

    expect(await findByText(/הפרופיל שלך בסקירה/)).toBeTruthy();
    expect(await findByText(/3 ימי עסקים/)).toBeTruthy();
    const cta = await findByText("השלימי פרופיל ←");
    expect(cta.getAttribute("href")).toBe("/settings");
  });

  it("shows rejected banner when status is rejected", async () => {
    apiRef.current.dashboard = makeDashboard("rejected");
    const { default: Page } = await import("../app/producer/dashboard/page.js");
    const { findByText } = render(<Page />);

    expect(await findByText(/הבקשה לא אושרה/)).toBeTruthy();
    const cta = await findByText("צרי קשר ←");
    expect(cta.getAttribute("href")).toBe("/contact");
  });

  it("shows no status banner when status is approved", async () => {
    apiRef.current.dashboard = makeDashboard("approved");
    const { default: Page } = await import("../app/producer/dashboard/page.js");
    render(<Page />);

    // Wait for data to load then verify no status banners
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/הפרופיל שלך בסקירה/)).toBeNull();
    expect(screen.queryByText(/הבקשה לא אושרה/)).toBeNull();
  });
});
