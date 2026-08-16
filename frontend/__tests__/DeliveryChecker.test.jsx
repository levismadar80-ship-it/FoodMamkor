import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// MEH-1536: "מגיעים אלייך?" delivery checker. The five answer states are
// covered here (not only in Playwright) because e2e runs unmocked against real
// staging data (e2e/CLAUDE.md, MEH-417) — which cannot guarantee a producer
// exists in every state. These assertions are deterministic and run in the
// required CI gate; the e2e spec covers real rendering on a live page.

vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) => {
    const city = vars?.city ?? "";
    if (key === "checker.yes_nationwide") return `כן! משלוחים לכל הארץ — כולל ${city}`;
    if (key === "checker.yes") return `כן, מגיעים ל${city}`;
    if (key === "checker.no") return `לצערנו לא מגיעים ל${city} כרגע`;
    const map = {
      "checker.label": "מגיעים אלייך?",
      "checker.placeholder": "הקלידי עיר לבדיקה",
      "min_order": "מינימום",
      // search.city_search.* — consumed by the real CitySearch underneath.
      "placeholder": "עיר",
      "clear_aria": "ניקוי",
    };
    return map[key] ?? key;
  },
}));

vi.mock("@phosphor-icons/react", () => {
  const Stub = () => <span />;
  return { CheckCircle: Stub, XCircle: Stub };
});

// CitySearch hydrates its list from GET /cities; keep the unit test offline.
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [] })) },
}));

import DeliveryChecker, { matchDeliveryCity } from "@/components/DeliveryChecker";

const AREAS = [
  { id: 1, city: "חיפה", min_order: 150, delivery_day: "חמישי" },
  { id: 2, city: "עתלית" },
];

function setup(props) {
  render(<DeliveryChecker offersDelivery nationwide={false} excluded={[]} areas={[]} {...props} />);
}

// The verdict is committed, not live (DeliveryChecker.jsx:78) — type, then pick
// the suggestion, exactly as a visitor does. Every city used here is in
// ISRAEL_CITIES, so the option is always offered.
const check = (value) => {
  fireEvent.change(screen.getByRole("combobox"), { target: { value } });
  fireEvent.mouseDown(screen.getByRole("option", { name: value }));
};

const type = (value) =>
  fireEvent.change(screen.getByRole("combobox"), { target: { value } });

const result = () => screen.getByTestId("delivery-checker-result");

describe("DeliveryChecker — visibility gates (MEH-1536)", () => {
  it("hidden when the producer does not offer delivery", () => {
    setup({ offersDelivery: false, areas: AREAS });
    expect(screen.queryByTestId("delivery-checker")).not.toBeInTheDocument();
  });

  it("hidden when nationwide with NO exclusions — the answer is trivially yes", () => {
    setup({ nationwide: true, excluded: [] });
    expect(screen.queryByTestId("delivery-checker")).not.toBeInTheDocument();
  });

  it("hidden when there is nothing to check against (no areas, not nationwide)", () => {
    setup({ areas: [] });
    expect(screen.queryByTestId("delivery-checker")).not.toBeInTheDocument();
  });

  it("visible when nationwide WITH exclusions, and when explicit areas exist", () => {
    setup({ nationwide: true, excluded: ["אילת"] });
    expect(screen.getByTestId("delivery-checker")).toBeInTheDocument();
  });
});

describe("DeliveryChecker — answer states (MEH-1536)", () => {
  it("state 1 — yes, nationwide: city outside the exclusion list", () => {
    setup({ nationwide: true, excluded: ["אילת"] });
    check("חיפה");
    expect(result()).toHaveAttribute("data-result", "yes_nationwide");
    expect(screen.getByText("כן! משלוחים לכל הארץ — כולל חיפה")).toBeInTheDocument();
  });

  it("state 2 — no: city IS on the exclusion list (MEH-1255)", () => {
    setup({ nationwide: true, excluded: ["אילת"] });
    check("אילת");
    expect(result()).toHaveAttribute("data-result", "no");
    expect(screen.getByText("לצערנו לא מגיעים לאילת כרגע")).toBeInTheDocument();
  });

  it("state 3 — yes with details: day + minimum on the secondary line", () => {
    setup({ areas: AREAS });
    check("חיפה");
    expect(result()).toHaveAttribute("data-result", "yes");
    expect(screen.getByText("כן, מגיעים לחיפה")).toBeInTheDocument();
    expect(screen.getByText("חמישי", { exact: false })).toBeInTheDocument();
    // formatPrice canonical shekel format (MEH-1140), dir=ltr isolated.
    expect(screen.getByText("150₪")).toBeInTheDocument();
  });

  it("state 4 — yes without details: no secondary line invented", () => {
    setup({ areas: AREAS });
    check("עתלית");
    expect(result()).toHaveAttribute("data-result", "yes");
    expect(screen.getByText("כן, מגיעים לעתלית")).toBeInTheDocument();
    expect(screen.queryByText("מינימום", { exact: false })).not.toBeInTheDocument();
  });

  it("a 0 minimum reads as NO minimum — same as the list row (DeliveryBlock.jsx:41)", () => {
    setup({ areas: [{ id: 9, city: "חיפה", min_order: 0, delivery_day: "חמישי" }] });
    check("חיפה");
    expect(result()).toHaveAttribute("data-result", "yes");
    expect(screen.getByText("חמישי", { exact: false })).toBeInTheDocument();
    expect(screen.queryByText("מינימום", { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByText("0₪")).not.toBeInTheDocument();
  });

  it("state 5 — no: city matches no delivery area", () => {
    setup({ areas: AREAS });
    check("אילת");
    expect(result()).toHaveAttribute("data-result", "no");
    expect(screen.getByText("לצערנו לא מגיעים לאילת כרגע")).toBeInTheDocument();
  });

  it("renders no verdict while the field is empty, and the region is aria-live", () => {
    setup({ areas: AREAS });
    expect(result()).toHaveAttribute("data-result", "none");
    expect(result()).toHaveAttribute("aria-live", "polite");
  });

  it("holds the verdict until the city is committed — no mid-typing false negative", () => {
    setup({ areas: AREAS });
    // "חיפ" is a prefix of a SERVED city; a live verdict would read
    // "לצערנו לא מגיעים" to someone who is in fact covered.
    type("חיפ");
    expect(result()).toHaveAttribute("data-result", "none");
    check("חיפה");
    expect(result()).toHaveAttribute("data-result", "yes");
  });

  it("editing the field clears a stale verdict", () => {
    setup({ areas: AREAS });
    check("חיפה");
    expect(result()).toHaveAttribute("data-result", "yes");
    type("עתל");
    expect(result()).toHaveAttribute("data-result", "none");
  });
});

describe("matchDeliveryCity — pure logic (MEH-1536)", () => {
  it("returns null for empty / whitespace input", () => {
    expect(matchDeliveryCity({ city: "", areas: AREAS })).toBeNull();
    expect(matchDeliveryCity({ city: "   ", areas: AREAS })).toBeNull();
  });

  it("is trimmed and case-insensitive, and echoes the canonical spelling", () => {
    const r = matchDeliveryCity({ city: "  חיפה  ", areas: AREAS });
    expect(r.status).toBe("yes");
    expect(r.city).toBe("חיפה");
    const en = matchDeliveryCity({ city: " haifa ", areas: [{ city: "Haifa" }] });
    expect(en).toEqual({ status: "yes", city: "Haifa", day: null, minOrder: null });
  });

  it("exclusion match is case-insensitive too, and echoes the producer spelling", () => {
    const r = matchDeliveryCity({ city: " eilat", nationwide: true, excluded: ["Eilat"] });
    expect(r).toEqual({ status: "no", city: "Eilat" });
  });

  it("does no fuzzy matching — a partial city name is not a match", () => {
    expect(matchDeliveryCity({ city: "חיפ", areas: AREAS }).status).toBe("no");
  });
});
