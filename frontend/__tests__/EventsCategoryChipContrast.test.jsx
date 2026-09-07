import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import EventsClient from "@/app/[locale]/events/EventsClient";

// MEH-2069: bg-accent/10 on the page background (cream, #f5f0e8) composited
// under the experience-row category chip computes 4.07:1 — AA fail for the
// text-xs (12px) label (Bug Protocol rule 2 sibling of MEH-2032/#2909, which
// fixed the same class pair in BadgeRow.jsx). Same usage-level fix: solid
// bg-surface-card gets text-accent to 5.19:1. Mounts a real experience row
// (accent="gold" -> isExp -> catChip, EventsClient.jsx:425) so the assertion
// pins the rendered class, not the source string — a presence-only check on
// bg-surface-card alone couldn't distinguish "fixed" from "never had the bug",
// so both sides are pinned (mirrors BadgeRow.test.jsx's MEH-2032 case).

let params = {}; // drives useSearchParams().get(key) — city/category only (MEH-2245)

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: (k) => (k in params ? params[k] : null) }),
}));
// MEH-2245: switching tab is a route change through next-intl's router;
// stub it (HANDOFF lesson: next-intl navigation under vitest needs the
// 5-line @/i18n/navigation stub, same as the Register suites).
const pushMock = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
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
  default: ({ children, href, className }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));
vi.mock("@phosphor-icons/react", () => {
  const Stub = () => null;
  return Object.fromEntries(
    [
      "ArrowCounterClockwise", "ArrowRight", "Basket", "CalendarBlank",
      "CalendarX", "CookingPot", "Drop", "MapTrifold", "Path", "Plant",
      "Plus", "Rows", "Storefront",
    ].map((name) => [name, Stub]),
  );
});

const EXPERIENCE_TITLE = "סדנת טעימות";
const EXPERIENCE_ROW = {
  id: 1,
  title: EXPERIENCE_TITLE,
  event_date: "2026-09-01",
  event_time: "18:00",
  host: { name: "רותי" },
  city: "חיפה",
  category: "טעימות",
  price_per_person: 120,
  description: "",
};

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [EXPERIENCE_ROW] })) },
}));
vi.mock("@/lib/cloudinary", () => ({ optimizeCloudinary: (u) => u }));
vi.mock("@/lib/format-date", () => ({ formatEventDate: () => "1" }));
vi.mock("@/components/Breadcrumb", () => ({ default: () => null }));
vi.mock("@/components/CalendarView", () => ({ default: () => null }));
vi.mock("@/components/CitySearch", () => ({ default: () => null }));
vi.mock("@/components/ChipScrollRow", () => ({ default: () => null }));

beforeEach(() => {
  params = {};
});

describe("EventsClient experience category chip contrast (MEH-2069)", () => {
  it("uses the AA-passing bg-surface-card, not bg-accent/10", async () => {
    // MEH-2245: the experiences tab is the /experiences route → prop, not ?tab=.
    render(<EventsClient initialTab="experiences" />);
    const title = await screen.findByText(EXPERIENCE_TITLE);
    const chip = title.closest("a").querySelector("span.rounded-full");
    expect(chip).not.toBeNull();
    expect(chip.className).toContain("bg-surface-card");
    expect(chip.className).not.toContain("bg-accent/10");
  });
});
