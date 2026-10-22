import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent, within } from "@testing-library/react";
import HeroSearch from "@/components/HeroSearch";
import { highlightMatch } from "@/lib/highlightMatch";

// MEH-1685 ACs 1-3 — hero autocomplete polish:
//   AC1 inverted highlight (typed prefix regular, untyped continuation bold)
//   AC2 producer rows carry a circular Cloudinary thumbnail, initials fallback
//   AC3 total visible suggestions capped: exactly 8 mobile / 10 desktop when
//       the API returns more, with every non-empty section still shown
// AC4 (mobile focus mode) is an open design decision and is NOT covered here.
//
// next-intl is fed the REAL he.json (not identity) so section headings are
// asserted by their rendered Hebrew — same reasoning as
// HeroSearchNoResultsExit.test.jsx (MEH-1619).
vi.mock("next-intl", async () => {
  const he = (await import("../messages/he.json")).default;
  const lookup = (path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), he);
  return {
    useTranslations: (ns) => {
      const fn = (key) => lookup(`${ns}.${key}`) ?? `${ns}.${key}`;
      fn.rich = fn;
      return fn;
    },
    useLocale: () => "he",
  };
});

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, prefetch: vi.fn() }),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const CLOUD = "https://res.cloudinary.com/demo/image/upload/v1/bread.jpg";

// Five per section — the backend's `limit` — so the uncapped total is 15 and
// the cap has something to cut.
const RESULTS = {
  producers: [
    { id: 1, name: "לחם מחמצת", slug: "lechem", city: "תל אביב", image: CLOUD },
    { id: 2, name: "לחמניות הגליל", slug: "lachmaniot", city: "צפת", image: null },
    { id: 3, name: "מאפיית לחם", slug: "p3", city: "חיפה", image: null },
    { id: 4, name: "לחם הבית", slug: "p4", city: "חיפה", image: null },
    { id: 5, name: "לחם שאור", slug: "p5", city: "חיפה", image: null },
  ],
  products: [],
  categories: [1, 2, 3, 4, 5].map((n) => ({ id: n, name: `לחמים ${n}` })),
  cities: [1, 2, 3, 4, 5].map((n) => `כפר לחם ${n}`),
};

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn((url) =>
      Promise.resolve({ data: url === "/search" ? RESULTS : [] }),
    ),
  },
}));

function setViewport({ desktop }) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query.includes("min-width: 768px") ? desktop : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

async function typeQuery(q) {
  render(<HeroSearch placeholder="חיפוש" srLabel="חיפוש" />);
  const input = screen.getByRole("combobox");
  await act(async () => {
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: q } });
  });
  await act(async () => {
    vi.advanceTimersByTime(500);
    await Promise.resolve();
  });
  return input;
}

const options = () =>
  within(screen.getByTestId("hero-search-dropdown")).getAllByRole("option");
const rowFor = (name) => options().find((o) => o.textContent.includes(name));

describe("MEH-1685 AC1 — inverted highlight", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setViewport({ desktop: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("renders the typed prefix regular and the continuation bold", async () => {
    await typeQuery("לח");
    const row = rowFor("לחם מחמצת");
    const typed = within(row).getByText("לח");
    const rest = within(row).getByText("ם מחמצת");
    expect(typed.className).toMatch(/\bfont-normal\b/);
    expect(typed.className).not.toMatch(/\bfont-bold\b/);
    expect(rest.className).toMatch(/\bfont-bold\b/);
  });

  it("applies to category and city rows too", async () => {
    await typeQuery("לח");
    const cat = rowFor("לחמים 1");
    expect(within(cat).getByText("מים 1").className).toMatch(/\bfont-bold\b/);
    const city = rowFor("כפר לחם 1");
    expect(within(city).getByText("כפר").className).toMatch(/\bfont-bold\b/);
    expect(within(city).getByText("לח").className).not.toMatch(/\bfont-bold\b/);
  });

  it("leaves the non-inverted default (ProducerCard) unchanged", () => {
    const parts = highlightMatch("לחם מחמצת", "לח");
    const { container } = render(<div>{parts}</div>);
    expect(container.querySelector("mark").textContent).toBe("לח");
    expect(container.querySelector("mark").className).toMatch(/\bfont-bold\b/);
  });
});

describe("MEH-1685 AC2 — producer thumbnails", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setViewport({ desktop: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("shows a circular 80px Cloudinary square via optimizeCloudinary", async () => {
    await typeQuery("לח");
    const img = rowFor("לחם מחמצת").querySelector("img");
    expect(img).not.toBeNull();
    expect(img.getAttribute("src")).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_fill,g_auto,ar_1:1,w_80/v1/bread.jpg",
    );
    expect(img.getAttribute("alt")).toBe("");
    expect(img.className).toMatch(/\brounded-full\b/);
  });

  it("falls back to an initials circle for an imageless producer", async () => {
    await typeQuery("לח");
    const row = rowFor("לחמניות הגליל");
    expect(row.querySelector("img")).toBeNull();
    const initials = within(row).getByTestId("hero-search-thumb-initials");
    expect(initials.textContent).toBe("ל");
    expect(initials.className).toMatch(/\brounded-full\b/);
  });

  it("falls back to initials when the image fails to load", async () => {
    await typeQuery("לח");
    const row = rowFor("לחם מחמצת");
    await act(async () => {
      fireEvent.error(row.querySelector("img"));
    });
    expect(row.querySelector("img")).toBeNull();
    expect(within(row).getByTestId("hero-search-thumb-initials").textContent).toBe("ל");
  });

  it("does not put thumbnails on category or city rows", async () => {
    await typeQuery("לח");
    expect(rowFor("לחמים 1").querySelector("img")).toBeNull();
    expect(rowFor("כפר לחם 1").querySelector("img")).toBeNull();
  });
});

describe("MEH-1685 AC3 — suggestion cap", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const sectionHeadings = ["בתי עסק", "קטגוריות", "ערים"];

  it("renders exactly 8 options on mobile (<768px), every section kept", async () => {
    setViewport({ desktop: false });
    await typeQuery("לח");
    expect(options()).toHaveLength(8);
    for (const h of sectionHeadings) expect(screen.getByText(h)).toBeTruthy();
  });

  it("renders exactly 10 options on desktop, every section kept", async () => {
    setViewport({ desktop: true });
    await typeQuery("לח");
    expect(options()).toHaveLength(10);
    for (const h of sectionHeadings) expect(screen.getByText(h)).toBeTruthy();
  });

  it("keyboard nav addresses only the capped rows (ArrowDown/Up/Enter)", async () => {
    setViewport({ desktop: false });
    const input = await typeQuery("לח");
    const opts = options();
    // Walk past the end: the active option must stop on the LAST rendered row,
    // never on a sliced-away one with no DOM node.
    for (let i = 0; i < 20; i++) fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(opts[7].id);
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.getAttribute("aria-activedescendant")).toBe(opts[6].id);
    // Back to the top, one down: the second producer.
    for (let i = 0; i < 20; i++) fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/lachmaniot");
  });
});
