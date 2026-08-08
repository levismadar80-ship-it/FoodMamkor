import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProducersClient from "@/components/ProducersClient";
import { PRODUCERS_CHIPS_CONFIG, withChipGroups } from "@/lib/producer-filters";
import { TOGGLE_CHIPS } from "@/lib/map-chips";

/**
 * MEH-1862 — the /producers attribute axes live in the FilterSheet, at every
 * inventory level.
 *
 * WHAT THIS TICKET ACTUALLY SHIPPED, AND WHY IT DIFFERS FROM ITS OWN SPEC.
 * The card specced an inventory THRESHOLD: below 15 approved businesses the
 * attribute row would not render at all; at 15+ it would collapse into a sheet.
 * The threshold half was dropped, with the rationale recorded on the card. Two
 * reasons, both measurable rather than aesthetic:
 *
 *   1. `producer-filters.js` carries a written decision from MEH-1934 —
 *      "existing ones are never retro-gated" — because hiding an axis that has
 *      data REMOVES a working filter. Hiding the row below 15 is exactly that,
 *      for seven axes at once.
 *   2. Every value is below 15 today, so the `>= 15` branch (the sheet — i.e.
 *      most of the work) would never have rendered, and the only observable
 *      effect of shipping the card verbatim would have been the deletion.
 *
 * Relocating reaches the card's stated §1 goal — fewer chips competing for
 * attention on the surface — without removing a capability, and it converges
 * /producers onto the IA /map has run since MEH-1368.
 *
 * `@/lib/producer-filters` and `@/components/FilterSheet` are deliberately NOT
 * mocked: the real chip config and the real sheet are the subject. A stubbed
 * config would let these pass against any chip set at all.
 */

const router = { replace: vi.fn(), push: vi.fn() };
let params = {};

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
  Faders: (p) => <span {...p} />,
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
vi.mock("@/components/LocationModal", () => ({ default: () => null }));
vi.mock("@/components/Skeleton", () => ({ SkeletonProducerGrid: () => null }));
// The row keeps its stand-in: what matters here is WHICH chips ProducersClient
// hands it, not how it paints them.
vi.mock("@/components/ChipScrollRow", () => ({
  default: ({ chips = [], onChipClick, variant }) => (
    <div data-testid={`chip-row-${variant}`}>
      {chips.map((c) => (
        <button key={c.key} data-testid={`row-chip-${c.key}`} onClick={() => onChipClick(c.key)}>
          {c.label}
        </button>
      ))}
    </div>
  ),
}));
vi.mock("@/lib/use-user-city", () => ({
  useUserCity: () => ({ city: null, setCity: vi.fn(), clearCity: vi.fn() }),
}));
vi.mock("@/lib/recently-viewed", () => ({ getRecentlyViewedIds: () => [] }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [], headers: { "x-total-count": "0" } })),
  },
}));

/** `n` plain producers — no order_window, no diet flags, so the MEH-1881 and
 *  MEH-1934 runtime gates stay CLOSED and only the ungated axes are offered. */
const items = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `עסק ${i}`, categories: [] }));

const props = (initialItems) => ({
  initialItems,
  initialTotal: initialItems.length,
  initialPage: 1,
  totalPages: 1,
  perPage: 12,
});

const TRIGGER = () => screen.getByTestId("producers-filters-button");
const openSheet = () => {
  const btn = TRIGGER();
  if (btn.getAttribute("aria-expanded") !== "true") fireEvent.click(btn);
};

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  params = {};
  router.replace.mockClear();
});

describe("MEH-1862 — attribute axes move into the sheet", () => {
  it("renders NO attribute chip on the surface — the row is gone", () => {
    render(<ProducersClient {...props(items(3))} />);
    // Numeric absence assertion, not "the row looks shorter": every attribute
    // key must be off the toggle row. The city chip is checked separately below.
    const onSurface = PRODUCERS_CHIPS_CONFIG.filter((c) =>
      screen.queryByTestId(`row-chip-${c.key}`),
    );
    expect(onSurface).toEqual([]);
  });

  it("keeps the city chip ON the surface — it is a picker, not an attribute", () => {
    render(<ProducersClient {...props(items(3))} />);
    // Tapping it opens the LocationModal rather than toggling a boolean, and it
    // is the precondition for the delivery-day row below it (MEH-1825). Burying
    // it in the attribute sheet would strand both.
    expect(screen.getByTestId("row-chip-city")).toBeTruthy();
  });

  it("offers every gated-open attribute inside the sheet", () => {
    render(<ProducersClient {...props(items(3))} />);
    openSheet();
    // The four ungated axes: closed runtime gates (MEH-1881 open-now,
    // MEH-1934 diet) are asserted separately — see the gate specs.
    for (const key of ["kosher", "vegan", "vegetarian", "gluten_free"]) {
      expect(screen.getByTestId(`chip-${key}`)).toBeTruthy();
    }
  });

  it("toggling inside the sheet writes the same URL param the row wrote", () => {
    render(<ProducersClient {...props(items(3))} />);
    openSheet();
    fireEvent.click(screen.getByTestId("chip-kosher"));
    expect(new URLSearchParams(window.location.search).get("kosher")).toBe("1");
  });

  it("counts active attribute filters on the trigger", () => {
    params = { kosher: "1", vegan: "1" };
    render(<ProducersClient {...props(items(3))} />);
    expect(TRIGGER().textContent).toContain("2");
  });

  it("does not count the city in the badge — it is not in the sheet", () => {
    // A city picked elsewhere carries its own visible state; folding it into the
    // attribute count would report a filter the sheet cannot show or clear.
    params = { city: "חיפה", kosher: "1" };
    render(<ProducersClient {...props(items(3))} />);
    expect(TRIGGER().textContent).toContain("1");
  });
});

describe("MEH-1862 — the threshold that was dropped", () => {
  it("offers the attribute axes at ONE producer — no inventory gate", () => {
    // THE DISCRIMINATING CASE for the decision itself. Against the card as
    // written (FILTER_UI_THRESHOLD = 15, row absent below it) there would be no
    // trigger to click at all and this fails outright. It is the whole reason
    // the ticket shipped differently from its spec, so it is pinned here rather
    // than left to the prose on the card.
    render(<ProducersClient {...props(items(1))} />);
    expect(TRIGGER()).toBeTruthy();
    openSheet();
    expect(screen.getByTestId("chip-kosher")).toBeTruthy();
  });

  it("keeps a deep-linked filter reachable at one producer", () => {
    // The card's own worry, and the reason it carved out deep links even under
    // the threshold: a visitor arriving on ?gluten_free=1 must be able to SWITCH
    // IT OFF. With no threshold this holds by construction rather than by carve-out.
    params = { gluten_free: "1" };
    render(<ProducersClient {...props(items(1))} />);
    openSheet();
    const chip = screen.getByTestId("chip-gluten_free");
    expect(chip.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(chip);
    expect(new URLSearchParams(window.location.search).get("gluten_free")).toBeNull();
  });
});

describe("MEH-1862 — the /map surface is not disturbed", () => {
  it("files every shared axis under the same group on both surfaces", () => {
    // The group metadata is duplicated by design (producer-filters.js explains
    // why it is not derived from TOGGLE_CHIPS at runtime). This is the guard
    // that pays for that choice: the two copies cannot disagree silently.
    const mapGroup = Object.fromEntries(TOGGLE_CHIPS.map((c) => [c.key, c.group]));
    for (const chip of withChipGroups(PRODUCERS_CHIPS_CONFIG)) {
      if (mapGroup[chip.key]) {
        expect(`${chip.key}:${chip.group}`).toBe(`${chip.key}:${mapGroup[chip.key]}`);
      }
    }
  });

  it("gives every /producers axis a real group — none falls through", () => {
    // withChipGroups defaults an unknown key to "service" so a new chip stays
    // reachable. That fallback must never be the actual answer: a chip added to
    // the config without a group would land in the wrong section silently.
    const grouped = withChipGroups(PRODUCERS_CHIPS_CONFIG);
    const diet = grouped.filter((c) => c.group === "diet").map((c) => c.key);
    // The six diet axes are the ones a fallback would visibly swallow.
    expect(diet).toEqual([
      "vegan",
      "vegetarian",
      "gluten_free",
      "lactose_free",
      "no_added_sugar",
      "low_carb",
    ]);
  });
});
