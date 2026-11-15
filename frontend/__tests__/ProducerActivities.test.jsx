import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// MEH-2602: the business page shows that business's own open group buys and
// upcoming experiences; each section is hidden when its list is empty.
// MEH-2659: events + experiences are one date-sorted list of EventEntryRow
// rows; a group buy is a compact card with no photo.

vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  useFormatter: () => ({ dateTime: () => "יום ו׳" }),
  useLocale: () => "he",
}));
vi.mock("@/components/SaveButton", () => ({ default: () => null }));

const get = vi.fn();
vi.mock("@/lib/api", () => ({ default: { get: (...a) => get(...a) } }));

import ProducerActivities from "@/app/[locale]/producer/[id]/components/ProducerActivities";

const GB = {
  id: "gb1", title: "מארז דבש", product_name: "דבש", status: "open",
  commits_count: 2, min_participants: 10, deadline: "2099-01-01T00:00:00Z",
  price_per_unit_regular: "50", price_per_unit_group: "40",
  producer_name: "מכוורת השדה", producer_image_url: "https://res.cloudinary.com/x/image/upload/a.jpg",
};
const EX = { id: "ex1", title: "סדנת גבינות", event_date: "2099-01-03", event_time: "10:00:00", price_per_person: "120" };
const EV = { id: "ev1", title: "שוק חורף", event_date: "2099-01-02", event_time: "09:00:00", price: 0, producer_name: "מכוורת השדה", owner_image_url: "https://x/owner.jpg", registration_url: "https://forms.example/reg" };

function answer(map) {
  get.mockImplementation((url) => {
    const key = Object.keys(map).find((k) => url.startsWith(k));
    return Promise.resolve({ data: key ? map[key] : [] });
  });
}

describe("ProducerActivities", () => {
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

  it("0 items: renders nothing", async () => {
    answer({});
    const { container } = render(<ProducerActivities producerId="p-1" events={[]} />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(container).toBeEmptyDOMElement();
  });

  it("1 group buy: a compact card with no photo and no business name", async () => {
    answer({ "/group-buys": [GB] });
    render(<ProducerActivities producerId="p-1" />);
    const card = await screen.findByTestId("producer-group-buy-row");
    expect(card).toHaveAttribute("href", "/group-buys/gb1");
    expect(card.querySelector("img")).toBeNull();
    expect(card.textContent).not.toContain("מכוורת השדה");
    expect(card.textContent).toContain("דבש");
    expect(card.textContent).toContain("remaining_to_open");
    // MEH-2827 PR 7: the saving is a line under the price, not a -% pill.
    expect(screen.queryByTestId("group-buy-discount")).toBeNull();
    expect(screen.getByTestId("group-buy-saving").textContent).toBe('discount_hint:{"discount":20}');
    expect(screen.queryByTestId("producer-events")).toBeNull();
  });

  it("events and experiences render as ONE list, sorted by date, without the business name", async () => {
    answer({ "/experiences": [EX] });
    render(<ProducerActivities producerId="p-1" events={[EV]} />);
    await screen.findByText("סדנת גבינות");
    const sections = screen.getAllByTestId("producer-events");
    expect(sections).toHaveLength(1);
    const links = sections[0].querySelectorAll("a");
    // Only the two row links: the external registration link is not repeated
    // on the business page (the event page shows it), by decision.
    expect([...links].map((a) => a.getAttribute("href"))).toEqual(["/events/ev1", "/experiences/ex1"]);
    expect(sections[0].textContent).not.toContain("מכוורת השדה");
    // The owner photo is the page's own hero, so the row falls back to the category tile.
    expect(screen.getAllByTestId("event-row-image")[0]).toHaveAttribute("data-kind", "category");
  });

  // MEH-3009: the owner initial marks rows in mixed lists; here every row is
  // this business's own, so no row repeats its letter.
  it("rows with their own photo carry no owner initial on the business page", async () => {
    answer({ "/experiences": [{ ...EX, image_url: "https://x/ex.jpg", host: { producer_name: "מכוורת השדה" } }] });
    render(<ProducerActivities producerId="p-1" events={[{ ...EV, image_url: "https://x/ev.jpg" }]} />);
    await screen.findByText("סדנת גבינות");
    expect(screen.getAllByTestId("event-row-image").map((el) => el.getAttribute("data-kind"))).toEqual(["event", "event"]);
    expect(screen.queryByTestId("event-row-owner-initial")).toBeNull();
  });

  it("many: shows 3, then the existing show-all button reveals the rest", async () => {
    const many = [1, 2, 3, 4].map((n) => ({ ...EV, id: `ev${n}`, title: `אירוע ${n}`, event_date: `2099-02-0${n}` }));
    answer({});
    render(<ProducerActivities producerId="p-1" events={many} />);
    expect(await screen.findByText("אירוע 3")).toBeInTheDocument();
    expect(screen.queryByText("אירוע 4")).toBeNull();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("אירוע 4")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("a failed fetch hides the section instead of breaking the page", async () => {
    get.mockImplementation(() => Promise.reject(new Error("500")));
    const { container } = render(<ProducerActivities producerId="p-1" />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(container).toBeEmptyDOMElement();
  });
});
