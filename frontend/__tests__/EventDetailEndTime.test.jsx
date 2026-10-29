/**
 * MEH-2469 — the event page shows «09:30–15:00» when the event has an end
 * time, and the start alone otherwise. Harness: EventDetailOrganizer.test.jsx.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import api from "@/lib/api";
import EventDetailClient from "@/app/[locale]/events/[id]/EventDetailClient";

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "ev-1" }) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next-intl", () => ({
  useTranslations: (ns) => (k) => `${ns}.${k}`,
  useLocale: () => "he",
}));
vi.mock("@phosphor-icons/react", () => {
  const Stub = () => null;
  return { Basket: Stub, CalendarBlank: Stub, CookingPot: Stub, Drop: Stub, MapTrifold: Stub, Path: Stub, Plant: Stub, Storefront: Stub, Calendar: Stub, CalendarPlus: Stub, CaretLeft: Stub, Coins: Stub, Leaf: Stub, MapPin: Stub, UsersThree: Stub };
});
vi.mock("@/components/ShareButton", () => ({ default: () => null }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
vi.mock("@/lib/cloudinary", () => ({ optimizeCloudinary: (u) => u, IMAGE_RATIOS: {} }));
vi.mock("@/lib/format-date", () => ({ formatEventDate: () => "DATE" }));
vi.mock("@/components/Breadcrumb", () => ({ default: () => null }));

const base = {
  id: "ev-1",
  producer_id: "p-1",
  producer_name: "שוק גלם",
  owner_kind: "organizer",
  owner_slug: "gelem",
  title: "שוק גלם בחיפה",
  event_date: "2026-11-07",
  city: "חיפה",
  category: "שוק",
  price: 0,
  is_active: true,
};

async function renderEvent(extra) {
  api.get.mockResolvedValue({ data: { ...base, ...extra } });
  render(<EventDetailClient />);
  await screen.findByText("שוק גלם בחיפה");
}

beforeEach(() => vi.clearAllMocks());

describe("MEH-2469 — event page time line", () => {
  it("start + end: «09:30–15:00»", async () => {
    await renderEvent({ event_time: "09:30:00", end_time: "15:00:00" });
    const range = screen.getByText("09:30–15:00");
    // review #3717: the range is LTR-isolated, the «·» separator is not.
    expect(range.getAttribute("dir")).toBe("ltr");
    expect(range.textContent).not.toContain("·");
  });

  it("start only: «09:30» with no dash", async () => {
    await renderEvent({ event_time: "09:30:00", end_time: null });
    expect(document.body.textContent).toContain("09:30");
    expect(document.body.textContent).not.toContain("09:30–");
  });

  it("no time at all: no time line", async () => {
    await renderEvent({ event_time: null, end_time: null });
    expect(document.body.textContent).not.toMatch(/\d\d:\d\d/);
  });
});
