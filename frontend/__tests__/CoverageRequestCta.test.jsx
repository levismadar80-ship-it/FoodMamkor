import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// MEH-1675: "לא מגיעים ל{עיר}?" CTA. It lives on ONE state only — the
// DeliveryChecker's negative verdict (MEH-1536) — so these tests drive the
// checker, not the CTA in isolation: the thing worth locking is that the CTA
// and the verdict above it can never disagree.
//
// Covered here rather than only in Playwright because e2e runs unmocked
// against real staging data (e2e/CLAUDE.md, MEH-417) and cannot guarantee a
// producer whose city list excludes a given visitor's city.

vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key, vars) => {
    const city = vars?.city ?? "";
    if (ns === "whatsapp.question_chips") {
      return key === "source_line" ? "הגעתי דרך מהמקור" : key;
    }
    if (key === "checker.yes_nationwide") return `כן! משלוחים לכל הארץ — כולל ${city}`;
    if (key === "checker.yes") return `כן, מגיעים ל${city}`;
    if (key === "checker.no") return `לצערנו לא מגיעים ל${city} כרגע`;
    if (key === "coverage_cta.known_city") return `לא מגיעים ל${city}? אפשר לשאול את בית העסק`;
    if (key === "coverage_cta.prefill")
      return `היי! אני מ${city} — אשמח לדעת אם יש אפשרות למשלוח לאזור`;
    const map = {
      "checker.label": "מגיעים אלייך?",
      "checker.placeholder": "הקלידי עיר לבדיקה",
      min_order: "מינימום",
      placeholder: "עיר",
      clear_aria: "ניקוי",
    };
    return map[key] ?? key;
  },
}));

vi.mock("@phosphor-icons/react", () => {
  const Stub = () => <span />;
  return { CheckCircle: Stub, XCircle: Stub, ChatCircle: Stub };
});

// CitySearch hydrates its list from GET /cities; keep the unit test offline.
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [] })) },
}));

const ping = vi.hoisted(() => vi.fn());
vi.mock("@/lib/contact-tracking", () => ({ pingWhatsAppBeacon: ping }));

import DeliveryChecker from "@/components/DeliveryChecker";

const PRODUCER = { id: 7, phone: "050-1234567" };
const AREAS = [
  { id: 1, city: "חיפה", min_order: 150, delivery_day: "חמישי" },
  { id: 2, city: "עתלית" },
];

function setUserCity(value) {
  if (value) localStorage.setItem("user_city", value);
  else localStorage.removeItem("user_city");
}

function setup(props) {
  return render(
    <DeliveryChecker
      offersDelivery
      nationwide={false}
      excluded={[]}
      areas={AREAS}
      producer={PRODUCER}
      {...props}
    />,
  );
}

// The verdict is committed, not live (DeliveryChecker.jsx:78) — type, then
// pick the suggestion, exactly as a visitor does and exactly as
// DeliveryChecker.test.jsx:52 drives it. Every city used here is in
// ISRAEL_CITIES, so the option is always offered.
function commitCity(value) {
  fireEvent.change(screen.getByRole("combobox"), { target: { value } });
  fireEvent.mouseDown(screen.getByRole("option", { name: value }));
}

const field = () => screen.getByRole("combobox");

beforeEach(() => {
  localStorage.clear();
  ping.mockClear();
});

describe("CoverageRequestCta on the checker's negative verdict (MEH-1675)", () => {
  it("appears when a typed city is NOT served", async () => {
    setup();
    commitCity("נתניה");
    await waitFor(() => expect(screen.getByTestId("coverage-request-cta")).toBeTruthy());
    expect(screen.getByTestId("coverage-request-cta").textContent).toContain("לא מגיעים לנתניה?");
  });

  it("is absent when the typed city IS served", async () => {
    setup();
    commitCity("חיפה");
    await waitFor(() => expect(screen.getByText("כן, מגיעים לחיפה")).toBeTruthy());
    expect(screen.queryByTestId("coverage-request-cta")).toBeNull();
  });

  it("is absent before any city is committed", () => {
    setup();
    expect(screen.queryByTestId("coverage-request-cta")).toBeNull();
  });

  it("is absent for a nationwide YES", async () => {
    setup({ nationwide: true, excluded: ["אילת"], areas: [] });
    commitCity("נתניה");
    await waitFor(() => expect(screen.getByText(/כן! משלוחים לכל הארץ/)).toBeTruthy());
    expect(screen.queryByTestId("coverage-request-cta")).toBeNull();
  });

  it("appears for a city excluded from nationwide delivery", async () => {
    setup({ nationwide: true, excluded: ["אילת"], areas: [] });
    commitCity("אילת");
    await waitFor(() => expect(screen.getByTestId("coverage-request-cta")).toBeTruthy());
  });

  // The count assert the card asks for.
  it("renders exactly ONE CTA block in the negative state", async () => {
    setup();
    commitCity("נתניה");
    await waitFor(() => expect(screen.getAllByTestId("coverage-request-cta")).toHaveLength(1));
  });

  it("prefills the city AND the locked attribution marker in the wa.me href", async () => {
    setup();
    commitCity("נתניה");
    await waitFor(() => expect(screen.getByTestId("coverage-request-link")).toBeTruthy());
    const href = screen.getByTestId("coverage-request-link").getAttribute("href");
    const text = decodeURIComponent(href.split("text=")[1]);
    // Asserted separately, not with `||`, so losing either one reds the test.
    expect(text).toContain("אני מנתניה");
    expect(text.endsWith("הגעתי דרך מהמקור")).toBe(true);
  });

  it("pings the existing whatsapp-click counter on click", async () => {
    setup();
    commitCity("נתניה");
    await waitFor(() => expect(screen.getByTestId("coverage-request-link")).toBeTruthy());
    screen.getByTestId("coverage-request-link").click();
    expect(ping).toHaveBeenCalledWith(7);
  });

  it("is absent when the producer has no WhatsApp channel", async () => {
    setup({ producer: { id: 7, phone: null } });
    commitCity("נתניה");
    await waitFor(() => expect(screen.getByText(/לצערנו לא מגיעים/)).toBeTruthy());
    expect(screen.queryByTestId("coverage-request-cta")).toBeNull();
  });
});

describe("user_city seed (MEH-1675 addition)", () => {
  it("a saved uncovered city answers — and shows the CTA — with zero typing", async () => {
    setUserCity("נתניה");
    setup();
    await waitFor(() => expect(screen.getByText("לצערנו לא מגיעים לנתניה כרגע")).toBeTruthy());
    expect(screen.getByTestId("coverage-request-cta")).toBeTruthy();
    expect(field().value).toBe("נתניה");
  });

  it("a saved COVERED city answers yes with zero typing and shows no CTA", async () => {
    setUserCity("חיפה");
    setup();
    await waitFor(() => expect(screen.getByText("כן, מגיעים לחיפה")).toBeTruthy());
    expect(screen.queryByTestId("coverage-request-cta")).toBeNull();
  });

  it("seeds once — the visitor's own edit is not overwritten", async () => {
    setUserCity("נתניה");
    setup();
    await waitFor(() => expect(screen.getByTestId("coverage-request-cta")).toBeTruthy());
    // She retypes; a later user_city change event must not yank her verdict back.
    commitCity("חיפה");
    await waitFor(() => expect(screen.getByText("כן, מגיעים לחיפה")).toBeTruthy());
    window.dispatchEvent(new CustomEvent("mehamakor:city-changed"));
    await waitFor(() => expect(field().value).toBe("חיפה"));
    expect(screen.queryByTestId("coverage-request-cta")).toBeNull();
  });

  it("no saved city → no seed, no verdict, no CTA", () => {
    setUserCity(null);
    setup();
    expect(field().value).toBe("");
    expect(screen.queryByTestId("coverage-request-cta")).toBeNull();
  });
});
