/**
 * MEH-3199 — the event page's first HTML carries the event.
 * Cells: server copy + no client answer yet (SSR string) · server copy + refetch
 * fails (kept) · server copy + refetch succeeds (replaced) · no server copy +
 * refetch fails (client «not found», as before) · page.js wiring.
 * Harness: EventDetailEndTime.test.jsx.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import api from "@/lib/api";
import EventDetailClient from "@/app/[locale]/events/[id]/EventDetailClient";

vi.mock("@/components/SaveButton", () => ({ default: () => null }));
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
  return { Basket: Stub, CalendarBlank: Stub, CookingPot: Stub, ForkKnife: Stub, MapTrifold: Stub, Path: Stub, Plant: Stub, Storefront: Stub, Calendar: Stub, CalendarPlus: Stub, CaretLeft: Stub, Coins: Stub, Leaf: Stub, MapPin: Stub, UsersThree: Stub };
});
vi.mock("@/components/ShareButton", () => ({ default: () => null }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
vi.mock("@/lib/cloudinary", () => ({ optimizeCloudinary: (u) => u, IMAGE_RATIOS: {} }));
vi.mock("@/lib/format-date", () => ({ formatEventDate: () => "DATE" }));
vi.mock("@/components/Breadcrumb", () => ({ default: () => null }));

const EVENT = {
  id: "ev-1",
  producer_id: "p-1",
  producer_name: "שוק גלם",
  owner_kind: "organizer",
  owner_slug: "gelem",
  title: "שוק גלם בחיפה",
  event_date: "2099-11-07",
  city: "חיפה",
  category: "שוק",
  price: 0,
  is_active: true,
};
const never = () => new Promise(() => {});

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation(never);
});

describe("MEH-3199 — event page SSR", () => {
  it("server copy: the HTML string already has the title, not the skeleton", () => {
    const html = renderToString(<EventDetailClient initialEvent={EVENT} />);
    expect(html).toContain("שוק גלם בחיפה");
    expect(html).not.toContain('aria-busy="true"');
  });

  it("server copy + refetch fails: the event stays on screen", async () => {
    api.get.mockRejectedValue(new Error("offline"));
    render(<EventDetailClient initialEvent={EVENT} />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/events/ev-1"));
    await Promise.resolve();
    expect(screen.getByText("שוק גלם בחיפה")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("events.detail.not_found");
  });

  it("server copy + refetch succeeds: the fresh copy replaces it", async () => {
    api.get.mockResolvedValue({ data: { ...EVENT, title: "שוק גלם — עודכן" } });
    render(<EventDetailClient initialEvent={EVENT} />);
    expect(await screen.findByText("שוק גלם — עודכן")).toBeInTheDocument();
  });

  it("no server copy + refetch fails: the client «not found» (unchanged)", async () => {
    api.get.mockRejectedValue(new Error("404"));
    render(<EventDetailClient />);
    await waitFor(() => expect(document.body.textContent).toContain("events.detail.not_found"));
  });

  it("page.js hands its server fetch to the client, keyed by id", () => {
    const src = readFileSync(join(process.cwd(), "app/[locale]/events/[id]/page.js"), "utf8");
    expect(src).toMatch(/<EventDetailClient\s+key=\{event\.id \?\? params\.id\}\s+initialEvent=\{event\}\s*\/>/);
  });
});
