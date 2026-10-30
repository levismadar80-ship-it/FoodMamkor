import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// MEH-2602: the business page shows that business's own open group buys and
// upcoming experiences; each section is hidden when its list is empty.

vi.mock("next-intl", () => ({
  useTranslations: () => (key) => key,
  useFormatter: () => ({ dateTime: () => "יום ו׳" }),
}));
vi.mock("next/image", () => ({ default: (p) => <img alt={p.alt} src={p.src} /> }));
vi.mock("@/components/ImageWithFallback", () => ({ default: () => null }));
vi.mock("@/components/CitySearch", () => ({ default: () => null }));

const get = vi.fn();
vi.mock("@/lib/api", () => ({ default: { get: (...a) => get(...a) } }));

import ProducerActivities from "@/app/[locale]/producer/[id]/components/ProducerActivities";

const GB = {
  id: "gb1", title: "מארז דבש", product_name: "דבש", status: "open",
  commits_count: 2, min_participants: 10, deadline: "2099-01-01T00:00:00Z",
  price_per_unit_regular: "50", price_per_unit_group: "40",
};
const EX = { id: "ex1", title: "סדנת גבינות", event_date: "2099-01-01", price_per_person: "120" };

function answer(map) {
  get.mockImplementation((url) => {
    const key = Object.keys(map).find((k) => url.startsWith(k));
    return Promise.resolve({ data: key ? map[key] : [] });
  });
}

describe("ProducerActivities (MEH-2602)", () => {
  beforeEach(() => {
    get.mockReset();
  });

  it("asks both endpoints for this business only", async () => {
    answer({});
    render(<ProducerActivities producerId="p-1" />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(get).toHaveBeenCalledWith("/group-buys?producer_id=p-1");
    expect(get).toHaveBeenCalledWith("/experiences?producer_id=p-1");
  });

  it("renders nothing when both lists are empty", async () => {
    answer({});
    const { container } = render(<ProducerActivities producerId="p-1" />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(container).toBeEmptyDOMElement();
  });

  it("renders one group buy and one experience, each linking to its page", async () => {
    answer({ "/group-buys": [GB], "/experiences": [EX] });
    render(<ProducerActivities producerId="p-1" />);
    expect(await screen.findByTestId("producer-group-buys")).toBeInTheDocument();
    expect(screen.getByText("מארז דבש").closest("a")).toHaveAttribute("href", "/group-buys/gb1");
    expect(screen.getByText("סדנת גבינות").closest("a")).toHaveAttribute("href", "/experiences/ex1");
  });

  it("renders many and hides the empty section", async () => {
    answer({ "/experiences": [EX, { ...EX, id: "ex2", title: "סיור", price_per_person: null }] });
    render(<ProducerActivities producerId="p-1" />);
    expect(await screen.findByText("סיור")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByText("experiences.free")).toBeInTheDocument();
    expect(screen.queryByTestId("producer-group-buys")).toBeNull();
  });

  it("a failed fetch hides the section instead of breaking the page", async () => {
    get.mockImplementation(() => Promise.reject(new Error("500")));
    const { container } = render(<ProducerActivities producerId="p-1" />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(container).toBeEmptyDOMElement();
  });
});
