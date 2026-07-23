import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProducersClient from "@/components/ProducersClient";

// MEH-1503: the "בעיר שלי" chip on /producers must consume the saved user city
// (localStorage user_city — seeded from the profile on login by MEH-1485)
// instead of always opening LocationModal:
//   - saved city present  → apply it as ?city= immediately, NO modal, and run
//     the same apply path as a modal pick (setUserCity → MEH-1485 write-back).
//   - no saved city       → LocationModal opens (current behavior preserved).
//   - cityFilter active   → click clears it (toggle behavior preserved).

const router = { replace: vi.fn(), push: vi.fn() };
let params = {}; // drives useSearchParams().get / getAll

// Controllable saved-city value for useUserCity().city.
let savedCity = null;
const setCityMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => ({
    get: (k) => (k in params ? params[k] : null),
    getAll: (k) => (k in params ? [params[k]] : []),
  }),
}));
vi.mock("next-intl", () => ({ useTranslations: (s) => (k) => (s ? `${s}.${k}` : k) }));
vi.mock("next/link", () => ({ default: ({ children, href }) => <a href={href}>{children}</a> }));
vi.mock("@phosphor-icons/react", () => ({
  MagnifyingGlass: (p) => <span {...p} />,
  MapPin: (p) => <span {...p} />,
  Plant: (p) => <span {...p} />,
  Leaf: (p) => <span {...p} />,
  CaretDown: (p) => <span {...p} />,
  SealCheck: (p) => <span {...p} />,
  Truck: (p) => <span {...p} />,
  Certificate: (p) => <span {...p} />,
  GrainsSlash: (p) => <span {...p} />,
  Barn: (p) => <span {...p} />,
  DropSlash: (p) => <span {...p} />,
  FlowerTulip: (p) => <span {...p} />,
}));

// Stub the icon module so the real Phosphor glyphs it maps (category-registry
// pulls CATEGORY_ICONS from here) don't need to be enumerated in the partial
// phosphor mock above. City-chip wiring never renders category glyphs.
vi.mock("@/components/CategoryIcons", () => {
  const Glyph = (p) => <span {...p} />;
  return {
    CATEGORY_ICONS: {},
    Meat: Glyph,
    FishSimple: Glyph,
    Cheese: Glyph,
    Bread: Glyph,
    OliveOil: Glyph,
    Hive: Glyph,
  };
});
vi.mock("@/components/Breadcrumb", () => ({ default: () => null }));
vi.mock("@/components/ProducerCard", () => ({ default: () => <div data-testid="card" /> }));
// Interactive stand-in: always exposes a "city" chip button so the test can
// trigger handleChipClick("city") without depending on chip-row internals.
vi.mock("@/components/ChipScrollRow", () => ({
  default: ({ chips = [], onChipClick }) => (
    <div data-testid="chip-row">
      <button data-testid="chip-city" onClick={() => onChipClick("city")}>city</button>
      {chips.map((c) => (
        <button key={c.key} onClick={() => onChipClick(c.key)}>{c.label}</button>
      ))}
    </div>
  ),
}));
// Render a marker only when open, so we can assert the modal did / didn't open.
vi.mock("@/components/LocationModal", () => ({
  default: ({ open }) => (open ? <div data-testid="location-modal" /> : null),
}));
vi.mock("@/components/Skeleton", () => ({ SkeletonProducerGrid: () => null }));
vi.mock("@/lib/producer-filters", () => ({
  buildChipParams: () => ({}),
  CHIPS_CONFIG: [],
  CHIPS_DEFAULT: {},
}));
vi.mock("@/lib/use-user-city", () => ({
  useUserCity: () => ({ city: savedCity, setCity: setCityMock, clearCity: vi.fn() }),
}));
vi.mock("@/lib/recently-viewed", () => ({ getRecentlyViewedIds: () => [] }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [], headers: { "x-total-count": "0" } })) },
}));

const PROPS = { initialItems: [], initialTotal: 0, initialPage: 1, totalPages: 1, perPage: 12 };

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  params = {};
  savedCity = null;
  setCityMock.mockClear();
});

describe("ProducersClient 'בעיר שלי' chip (MEH-1503)", () => {
  it("saved city present → filters instantly (?city=) without opening the modal", () => {
    savedCity = "תל אביב-יפו";
    render(<ProducersClient {...PROPS} />);
    fireEvent.click(screen.getByTestId("chip-city"));

    expect(new URLSearchParams(window.location.search).get("city")).toBe("תל אביב-יפו");
    expect(screen.queryByTestId("location-modal")).toBeNull();
    // Same apply path as a modal pick → setUserCity runs (the MEH-1485
    // write-back trigger) so a logged-in pick silently PUTs the profile city.
    expect(setCityMock).toHaveBeenCalledWith("תל אביב-יפו");
  });

  it("no saved city → opens LocationModal (current behavior preserved)", () => {
    savedCity = null;
    render(<ProducersClient {...PROPS} />);
    fireEvent.click(screen.getByTestId("chip-city"));

    expect(screen.getByTestId("location-modal")).toBeInTheDocument();
    expect(window.location.search).not.toContain("city=");
    expect(setCityMock).not.toHaveBeenCalled();
  });

  it("active city filter → click clears it (toggle behavior preserved)", () => {
    // Deep-link an active city filter; a saved city must NOT re-apply over a
    // clear (the clear branch wins while cityFilter is active).
    params = { city: "חיפה" };
    savedCity = "תל אביב-יפו";
    render(<ProducersClient {...PROPS} />);
    fireEvent.click(screen.getByTestId("chip-city"));

    expect(window.location.search).not.toContain("city=");
    expect(screen.queryByTestId("location-modal")).toBeNull();
  });
});
