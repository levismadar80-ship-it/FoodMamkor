import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import HeroSearch from "@/components/HeroSearch";

// MEH-3415 — when /search answers with corrected_query (the query was re-read
// on the other keyboard layout), the dropdown says so, and «לחפש בכל זאת»
// re-runs the query exactly as typed.
//
// next-intl is mocked against the REAL he.json (not identity) so the
// assertions fail if the approved copy stops rendering — same reasoning as
// HeroSearchNoResultsExit.test.jsx. `rich` fills {vars} and drops the tags.
vi.mock("next-intl", async () => {
  const he = (await import("../messages/he.json")).default;
  const lookup = (path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), he);
  const fill = (s, vars = {}) =>
    s
      .replace(/\{(\w+)\}/g, (_, k) => (typeof vars[k] === "string" ? vars[k] : `{${k}}`))
      .replace(/<\/?\w+>/g, "");
  return {
    useTranslations: (ns) => {
      const fn = (key, vars) => fill(lookup(`${ns}.${key}`) ?? `${ns}.${key}`, vars);
      fn.rich = fn;
      return fn;
    },
    useLocale: () => "he",
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const HONEY = {
  producers: [{ id: "p1", name: "דבש הגליל", slug: "honey", city: "צפת", images: [] }],
  categories: [],
  cities: [],
};

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: { get } }));

async function flush() {
  await act(async () => {
    vi.advanceTimersByTime(500);
    await Promise.resolve();
  });
}

async function typeQuery(q) {
  render(<HeroSearch placeholder="חיפוש" srLabel="חיפוש" />);
  const input =
    screen.queryByRole("combobox", { hidden: true }) ?? screen.getByRole("textbox");
  await act(async () => {
    fireEvent.change(input, { target: { value: q } });
  });
  await flush();
  return input;
}

describe("MEH-3415 — hero search explains a keyboard-layout correction", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    get.mockImplementation((_url, { params }) =>
      Promise.resolve({
        data: params.as_typed
          ? { producers: [], categories: [], cities: [], corrected_query: null }
          : { ...HONEY, corrected_query: "דבש" },
      }),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("shows the approved three lines when the query was typed on English", async () => {
    await typeQuery("sca");
    const note = screen.getByTestId("hero-search-correction");
    expect(note.textContent).toContain("מציגים תוצאות עבור דבש");
    expect(note.textContent).toContain("הקלדתם sca — אולי המקלדת הייתה באנגלית.");
    expect(screen.getByRole("button", { name: "לחפש בכל זאת «sca»" })).toBeTruthy();
    expect(screen.getByText("דבש הגליל")).toBeTruthy();
  });

  it("«לחפש בכל זאת» re-runs the query as typed and drops the note", async () => {
    await typeQuery("sca");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "לחפש בכל זאת «sca»" }));
    });
    await flush();
    const last = get.mock.calls.at(-1)[1].params;
    expect(last).toMatchObject({ q: "sca", as_typed: true });
    expect(screen.queryByTestId("hero-search-correction")).toBeNull();
    expect(screen.getByText(/אין תוצאות עבור/)).toBeTruthy();
  });

  it("a new keystroke clears «בכל זאת»", async () => {
    const input = await typeQuery("sca");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "לחפש בכל זאת «sca»" }));
    });
    await flush();
    await act(async () => {
      fireEvent.change(input, { target: { value: "scad" } });
    });
    await flush();
    expect(get.mock.calls.at(-1)[1].params.as_typed).toBeUndefined();
  });

  it("skips the English-keyboard line when what was typed is Hebrew", async () => {
    get.mockImplementation(() =>
      Promise.resolve({ data: { ...HONEY, corrected_query: "bread" } }),
    );
    await typeQuery("נרקשג");
    const note = screen.getByTestId("hero-search-correction");
    expect(note.textContent).toContain("מציגים תוצאות עבור bread");
    expect(note.textContent).not.toContain("אולי המקלדת הייתה באנגלית");
  });

  it("no note when nothing was corrected", async () => {
    get.mockImplementation(() =>
      Promise.resolve({ data: { ...HONEY, corrected_query: null } }),
    );
    await typeQuery("דבש");
    expect(screen.queryByTestId("hero-search-correction")).toBeNull();
  });
});
