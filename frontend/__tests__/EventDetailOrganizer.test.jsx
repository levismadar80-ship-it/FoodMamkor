/**
 * MEH-2461 — the event page names its owner by kind.
 * Organizer: «מארגן: {name}» linking to /organizers/{owner_slug}; no
 * «יצירת קשר עם בית העסק» button (it names a business). Business: the
 * existing «מאורגן על ידי» line + /producer/{id} link + contact button.
 * Cells: organizer with slug / organizer without slug / business.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import api from "@/lib/api";
import EventDetailClient from "@/app/[locale]/events/[id]/EventDetailClient";

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "ev-1" }) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next-intl", () => ({
  useTranslations: (ns) => (k, v) =>
    `${ns}.${k}${v ? ` ${Object.values(v).join(" ")}` : ""}`,
  useLocale: () => "he",
}));
vi.mock("@phosphor-icons/react", () => {
  const Stub = () => null;
  return { Calendar: Stub, Coins: Stub, Leaf: Stub, MapPin: Stub, UsersThree: Stub };
});
vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
vi.mock("@/lib/cloudinary", () => ({ optimizeCloudinary: (u) => u, IMAGE_RATIOS: {} }));
vi.mock("@/lib/format-date", () => ({ formatEventDate: () => "" }));
vi.mock("@/components/Breadcrumb", () => ({ default: () => null }));

const base = {
  id: "ev-1",
  producer_id: "p-1",
  title: "שוק החורף",
  event_date: "2026-11-10",
  event_time: null,
  city: "חיפה",
  category: "שוק",
  price: 0,
  is_active: true,
  registration_url: null,
};

async function renderEvent(extra) {
  api.get.mockResolvedValue({ data: { ...base, ...extra } });
  render(<EventDetailClient />);
  await screen.findByText("שוק החורף");
}

beforeEach(() => vi.clearAllMocks());

describe("MEH-2461 — event page owner line by kind", () => {
  it("organizer with slug: «מארגן:» links to the organizer page, no business contact button", async () => {
    await renderEvent({ producer_name: "שוק גלם", owner_kind: "organizer", owner_slug: "gelem" });
    const line = screen.getByTestId("event-organizer-line");
    expect(line.textContent).toBe("events.detail.organizer_line שוק גלם");
    expect(line.querySelector("a").getAttribute("href")).toBe("/organizers/gelem");
    expect(screen.queryByText("events.detail.contact_producer")).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/producer/p-1"]')).toBeNull();
  });

  it("organizer without a slug: the line renders as text, never a dead link", async () => {
    await renderEvent({ producer_name: "שוק גלם", owner_kind: "organizer", owner_slug: null });
    const line = screen.getByTestId("event-organizer-line");
    expect(line.textContent).toBe("events.detail.organizer_line שוק גלם");
    expect(line.querySelector("a")).toBeNull();
  });

  it("business: unchanged — «מאורגן על ידי» + /producer link + contact button", async () => {
    await renderEvent({ producer_name: "חוות הניסוי", owner_kind: "producer", owner_slug: "farm" });
    expect(screen.queryByTestId("event-organizer-line")).not.toBeInTheDocument();
    expect(screen.getByText("events.detail.contact_producer")).toBeInTheDocument();
    expect(screen.getByText("חוות הניסוי").getAttribute("href")).toBe("/producer/p-1");
  });
});
