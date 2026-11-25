/**
 * MEH-3867 — paste a list of cities into CitiesAutocomplete.
 *
 * Two or more pasted names go to POST /cities/match in ONE request; the
 * matched names become chips (canonical spelling, no duplicates), the
 * unmatched ones are listed under the field. One name pastes as before.
 * States: 1 / many added, unmatched shown, all already present, request
 * failed. api is mocked.
 */
import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import CitiesAutocomplete from "@/components/CitiesAutocomplete";
import { splitPastedCities } from "@/components/cities-paste";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));

let latest = [];
function Harness({ initial = [], showRegionChips = true }) {
  const [v, setV] = useState(initial);
  return (
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <CitiesAutocomplete value={v} onChange={(n) => { latest = n; setV(n); }} showRegionChips={showRegionChips} />
    </NextIntlClientProvider>
  );
}

const paste = (text) =>
  fireEvent.paste(screen.getByRole("combobox"), { clipboardData: { getData: () => text } });

beforeEach(() => {
  vi.clearAllMocks();
  latest = [];
  api.get.mockResolvedValue({ data: [] });
});

describe("splitPastedCities", () => {
  it("splits on newline, comma, semicolon and tab and drops list markers", () => {
    expect(splitPastedCities("1. חדרה\n- עפולה, תל מונד;חיפה\t• נתניה\n\n")).toEqual([
      "חדרה", "עפולה", "תל מונד", "חיפה", "נתניה",
    ]);
  });
  it("keeps a hyphen inside a name", () => {
    expect(splitPastedCities("תל-מונד, פרדס חנה-כרכור")).toEqual(["תל-מונד", "פרדס חנה-כרכור"]);
  });
});

describe("CitiesAutocomplete paste (MEH-3867)", () => {
  it("adds every matched city in one request and lists the unmatched", async () => {
    api.post.mockResolvedValue({ data: { matched: ["חדרה", "תל מונד"], unmatched: ["קרני שומרוןן"] } });
    render(<Harness initial={["חיפה"]} />);

    expect(paste("חדרה\nתל-מונד\nקרני שומרוןן")).toBe(false);

    await screen.findByText("נוספו 2 ערים.");
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith("/cities/match", { names: ["חדרה", "תל-מונד", "קרני שומרוןן"] });
    expect(latest).toEqual(["חיפה", "חדרה", "תל מונד"]);
    expect(screen.getByTestId("cities-paste-unmatched").textContent).toBe(
      "לא מצאנו ברשימת היישובים: קרני שומרוןן. אפשר לבדוק את הכתיב ולחפש בשדה.",
    );
  });

  it("one added city reads in the singular, and a city already chosen is not added twice", async () => {
    api.post.mockResolvedValue({ data: { matched: ["חיפה", "חדרה"], unmatched: [] } });
    render(<Harness initial={["חיפה"]} />);

    paste("חיפה, חדרה");

    await screen.findByText("נוספה עיר אחת.");
    expect(latest).toEqual(["חיפה", "חדרה"]);
    expect(screen.queryByTestId("cities-paste-unmatched")).toBeNull();
  });

  it("says so when every pasted city was already in the list", async () => {
    api.post.mockResolvedValue({ data: { matched: ["חיפה"], unmatched: [] } });
    render(<Harness initial={["חיפה"]} />);

    paste("חיפה\nחיפה");

    await screen.findByText("כל הערים שהודבקו כבר ברשימה.");
    expect(latest).toEqual([]);
  });

  it("shows an error, adds nothing, when the check fails", async () => {
    api.post.mockRejectedValue(new Error("network"));
    render(<Harness />);

    paste("חיפה\nחדרה");

    await screen.findByText("לא הצלחנו לבדוק את הרשימה. כדאי לנסות להדביק שוב.");
    expect(latest).toEqual([]);
  });

  it("a single pasted name goes into the input as before, with no request", async () => {
    render(<Harness />);

    // fireEvent returns false when the handler called preventDefault: true
    // here means the browser's own paste goes ahead into the input.
    expect(paste("חדרה")).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.queryByTestId("cities-paste-result")).toBeNull();
  });

  it("shows the paste hint in delivery contexts only", () => {
    const { unmount } = render(<Harness showRegionChips />);
    expect(screen.getByText(he.search.cities_autocomplete.paste_hint)).toBeTruthy();
    unmount();
    render(<Harness showRegionChips={false} />);
    expect(screen.queryByText(he.search.cities_autocomplete.paste_hint)).toBeNull();
  });

  it("the result line clears when typing resumes", async () => {
    api.post.mockResolvedValue({ data: { matched: ["חדרה", "עפולה"], unmatched: [] } });
    render(<Harness />);
    paste("חדרה, עפולה");
    await screen.findByText("נוספו 2 ערים.");

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ח" } });

    expect(screen.queryByTestId("cities-paste-result")).toBeNull();
  });
});

describe("CitiesAutocomplete paste — review cases (MEH-3867)", () => {
  it("two overlapping pastes keep both lists", async () => {
    let releaseA;
    api.post
      .mockImplementationOnce(() => new Promise((r) => { releaseA = () => r({ data: { matched: ["חדרה", "עפולה"], unmatched: [] } }); }))
      .mockResolvedValueOnce({ data: { matched: ["חיפה", "עכו"], unmatched: [] } });
    render(<Harness />);

    paste("חדרה\nעפולה");
    paste("חיפה\nעכו");
    await screen.findByText("נוספו 2 ערים.");
    releaseA();
    await new Promise((r) => setTimeout(r, 0));

    expect([...latest].sort()).toEqual(["חדרה", "חיפה", "עכו", "עפולה"].sort());
  });

  it("a chip saved in another spelling is not added twice", async () => {
    api.post.mockResolvedValue({ data: { matched: ["תל אביב-יפו", "קריית שמונה"], unmatched: [] } });
    render(<Harness initial={["תל אביב - יפו", "קרית שמונה"]} />);

    paste("תל אביב-יפו\nקריית שמונה");

    await screen.findByText("כל הערים שהודבקו כבר ברשימה.");
    expect(latest).toEqual([]);
  });

  it("names over the request limits are reported, not dropped", async () => {
    api.post.mockResolvedValue({ data: { matched: [], unmatched: [] } });
    render(<Harness />);
    const many = Array.from({ length: 302 }, (_, i) => `עיר${i}`);

    paste(many.join("\n"));

    const line = await screen.findByTestId("cities-paste-unmatched");
    expect(api.post.mock.calls[0][1].names).toHaveLength(300);
    expect(line.textContent).toContain("עיר300, עיר301");
  });
});
