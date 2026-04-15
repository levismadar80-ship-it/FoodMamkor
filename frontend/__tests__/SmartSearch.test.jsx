import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SmartSearch from "@/components/SmartSearch";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const apiResponse = { current: { data: null } };
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(() => Promise.resolve(apiResponse.current)),
  },
}));

const sampleResults = {
  producers: [
    {
      id: "p1",
      name: "חוות השקמה",
      slug: "havat-hashikma",
      city: "רחובות",
      avg_rating: 4.7,
      reviews_count: 12,
      image: null,
    },
  ],
  products: [
    {
      id: "pr1",
      name: "גבינת עיזים",
      description: "מיושנת",
      producer_id: "p1",
      producer_name: "חוות השקמה",
      producer_slug: "havat-hashikma",
    },
  ],
  cities: ["רחובות"],
  categories: [{ id: 3, name: "חלב וגבינות", emoji: "🥛" }],
};

describe("SmartSearch", () => {
  beforeEach(() => {
    mockPush.mockClear();
    apiResponse.current = { data: sampleResults };
  });

  it("does NOT fetch or open when query is < 2 characters", async () => {
    const api = (await import("@/lib/api")).default;
    api.get.mockClear();
    render(<SmartSearch placeholder="חפשי" />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ש" } });
    // Wait through the debounce window + a margin.
    await new Promise((r) => setTimeout(r, 300));
    expect(api.get).not.toHaveBeenCalled();
    expect(screen.queryByTestId("smart-search-dropdown")).not.toBeInTheDocument();
  });

  it("fetches and shows four grouped sections when results arrive", async () => {
    const api = (await import("@/lib/api")).default;
    api.get.mockClear();
    render(<SmartSearch placeholder="חפשי" />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "חוות" } });
    await waitFor(
      () => {
        expect(api.get).toHaveBeenCalledWith(
          "/search",
          expect.objectContaining({ params: { q: "חוות" } }),
        );
      },
      { timeout: 1000 },
    );
    await waitFor(() => {
      expect(screen.getByText("בתי עסק")).toBeInTheDocument();
      expect(screen.getByText("מוצרים")).toBeInTheDocument();
      expect(screen.getByText("ערים")).toBeInTheDocument();
      expect(screen.getByText("קטגוריות")).toBeInTheDocument();
    });
  });

  it("skips empty sections (only renders non-empty groups)", async () => {
    apiResponse.current = {
      data: {
        producers: sampleResults.producers,
        products: [],
        cities: [],
        categories: [],
      },
    };
    render(<SmartSearch placeholder="חפשי" />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "חוות" } });
    await waitFor(() => expect(screen.getByText("בתי עסק")).toBeInTheDocument());
    expect(screen.queryByText("מוצרים")).not.toBeInTheDocument();
    expect(screen.queryByText("ערים")).not.toBeInTheDocument();
    expect(screen.queryByText("קטגוריות")).not.toBeInTheDocument();
  });

  it("highlights the matching substring with <mark>", async () => {
    render(<SmartSearch placeholder="חפשי" />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "חוות" } });
    await waitFor(() => {
      const marks = document.querySelectorAll("mark");
      expect(marks.length).toBeGreaterThan(0);
      expect(marks[0].textContent).toBe("חוות");
    });
  });

  it("Enter with no selection navigates to /search?q=<raw>", async () => {
    apiResponse.current = {
      data: { producers: [], products: [], cities: [], categories: [] },
    };
    render(<SmartSearch placeholder="חפשי" />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "xyz" } });
    // Let the debounced fetch resolve so results === empty.
    await waitFor(() =>
      expect(screen.getByText(/אין תוצאות עבור/)).toBeInTheDocument(),
    );
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockPush).toHaveBeenCalledWith("/search?q=xyz");
  });

  it("Enter on the first highlighted producer row routes to /:slug", async () => {
    render(<SmartSearch placeholder="חפשי" />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "חוות" } });
    // Heading "בתי עסק" is stable (not split by <mark>).
    await waitFor(() => screen.getByText("בתי עסק"));
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockPush).toHaveBeenCalledWith("/havat-hashikma");
  });

  it("ArrowDown moves the cursor; Enter picks the moved row", async () => {
    render(<SmartSearch placeholder="חפשי" />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "חוות" } });
    // Heading "בתי עסק" is stable (not split by <mark>).
    await waitFor(() => screen.getByText("בתי עסק"));
    // Rows in order: producer, product, city, category — move to city.
    fireEvent.keyDown(input, { key: "ArrowDown" }); // product
    fireEvent.keyDown(input, { key: "ArrowDown" }); // city
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockPush).toHaveBeenCalledWith(
      "/search?q=%D7%A8%D7%97%D7%95%D7%91%D7%95%D7%AA",
    );
  });

  it("Escape closes the dropdown", async () => {
    render(<SmartSearch placeholder="חפשי" />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "חוות" } });
    // Wait for results to actually render (a section header appears).
    await waitFor(() => screen.getByText("בתי עסק"));
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByTestId("smart-search-dropdown"),
      ).not.toBeInTheDocument(),
    );
  });

  it("mousedown on a category row routes to /?category=<id>", async () => {
    render(<SmartSearch placeholder="חפשי" />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "חוות" } });
    await waitFor(() => screen.getByText("קטגוריות"));
    // "חלב וגבינות" is never matched by "חוות" so it renders as one span (no <mark>).
    fireEvent.mouseDown(screen.getByText("חלב וגבינות"));
    expect(mockPush).toHaveBeenCalledWith("/?category=3");
  });
});
