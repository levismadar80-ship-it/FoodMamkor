import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// MEH-1675: "לא מגיעים ל{עיר}?" CTA. The three render states are covered here
// rather than only in Playwright because e2e runs unmocked against real staging
// data (e2e/CLAUDE.md, MEH-417) and cannot guarantee a producer exists whose
// city list excludes the visitor's saved city. These assertions are
// deterministic and run in the required CI gate.

vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key, vars) => {
    const city = vars?.city ?? "";
    if (ns === "whatsapp.question_chips") {
      return key === "source_line" ? "הגעתי דרך מהמקור" : key;
    }
    if (key === "coverage_cta.known_city") return `לא מגיעים ל${city}? אפשר לשאול את בית העסק`;
    if (key === "coverage_cta.no_city") return "האזור שלך לא ברשימה? אפשר לשאול את בית העסק";
    if (key === "coverage_cta.prefill")
      return `היי! אני מ${city} — אשמח לדעת אם יש אפשרות למשלוח לאזור`;
    return key;
  },
}));

vi.mock("@phosphor-icons/react", () => {
  const Stub = () => <span />;
  return { ChatCircle: Stub, X: Stub };
});

// The picker hydrates its city list from GET /cities; keep the unit test offline.
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [] })) },
}));

const ping = vi.hoisted(() => vi.fn());
vi.mock("@/lib/contact-tracking", () => ({ pingWhatsAppBeacon: ping }));

import CoverageRequestCta from "@/components/CoverageRequestCta";

const PRODUCER = { id: 7, phone: "050-1234567" };
const AREAS = [
  { id: 1, city: "חיפה", min_order: 150 },
  { id: 2, city: "עתלית" },
];

function setCity(value) {
  if (value) localStorage.setItem("user_city", value);
  else localStorage.removeItem("user_city");
}

function setup(props) {
  render(
    <CoverageRequestCta
      producer={PRODUCER}
      nationwide={false}
      excluded={[]}
      areas={AREAS}
      {...props}
    />,
  );
}

beforeEach(() => {
  localStorage.clear();
  ping.mockClear();
});

describe("CoverageRequestCta (MEH-1675)", () => {
  it("renders when the saved city is NOT in the producer's list", () => {
    setCity("רעננה");
    setup();
    const link = screen.getByTestId("coverage-request-link");
    expect(link).toBeTruthy();
    expect(screen.getByTestId("coverage-request-cta").textContent).toContain("לא מגיעים לרעננה?");
  });

  it("is hidden when the saved city IS in the producer's list", () => {
    setCity("חיפה");
    setup();
    expect(screen.queryByTestId("coverage-request-cta")).toBeNull();
  });

  it("is hidden when there is no city list to be absent from", () => {
    setCity("רעננה");
    // No areas and not nationwide → the section renders "משלוחים בתיאום מראש",
    // which makes no coverage claim for the CTA to answer.
    setup({ areas: [] });
    expect(screen.queryByTestId("coverage-request-cta")).toBeNull();
  });

  // The count assertion the card asks for: exactly ONE CTA block, never two.
  it("renders exactly one CTA block", () => {
    setCity("רעננה");
    setup();
    expect(screen.getAllByTestId("coverage-request-cta")).toHaveLength(1);
    expect(screen.queryByTestId("coverage-request-picker-trigger")).toBeNull();
  });

  it("falls back to the generic picker variant when no city is saved", () => {
    setCity(null);
    setup();
    expect(screen.getByTestId("coverage-request-picker-trigger")).toBeTruthy();
    expect(screen.getByTestId("coverage-request-cta").textContent).toContain(
      "האזור שלך לא ברשימה?",
    );
    // Generic variant has no href — the city is unknown until the picker commits.
    expect(screen.queryByTestId("coverage-request-link")).toBeNull();
  });

  it("prefills the city AND the locked attribution marker in the wa.me href", () => {
    setCity("רעננה");
    setup();
    const href = screen.getByTestId("coverage-request-link").getAttribute("href");
    const text = decodeURIComponent(href.split("text=")[1]);
    expect(text).toContain("אני מרעננה");
    // MEH-1524 marker, on its own final line — asserted separately from the
    // body so losing either one reds the test (no `||` carrying the assertion).
    expect(text.endsWith("הגעתי דרך מהמקור")).toBe(true);
  });

  it("is hidden when the producer has no WhatsApp channel", () => {
    setCity("רעננה");
    setup({ producer: { id: 7, phone: null } });
    expect(screen.queryByTestId("coverage-request-cta")).toBeNull();
  });

  it("is hidden for nationwide delivery with no exclusions", () => {
    setCity("רעננה");
    setup({ nationwide: true, areas: [] });
    expect(screen.queryByTestId("coverage-request-cta")).toBeNull();
  });

  it("renders for a city excluded from nationwide delivery", () => {
    setCity("אילת");
    setup({ nationwide: true, excluded: ["אילת"], areas: [] });
    expect(screen.getByTestId("coverage-request-link")).toBeTruthy();
  });

  it("pings the existing whatsapp-click counter on click", () => {
    setCity("רעננה");
    setup();
    screen.getByTestId("coverage-request-link").click();
    expect(ping).toHaveBeenCalledWith(7);
  });
});
