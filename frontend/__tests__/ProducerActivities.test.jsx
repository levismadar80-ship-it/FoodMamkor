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

  // MEH-3585: how the goods arrive, on the card itself (the bag card beside
  // it shows its address). 0 / 1 / 2 answers, and a group from before the split.
  it("group buy card: pickup / delivery lines — none, one, both, and the pre-split note", async () => {
    const cases = [
      [{}, []],
      [{ pickup_note: "איסוף מהחנות, הנביאים 10" }, ["pickup"]],
      [{ pickup_note: "איסוף מהחנות", delivery_note: "משלוח בכפר סבא" }, ["pickup", "delivery"]],
      [{ fulfillment_note: "איסוף בשוק האיכרים" }, ["fulfillment"]],
      [{ pickup_note: "   ", fulfillment_note: "איסוף בשוק" }, ["fulfillment"]],
    ];
    for (const [extra, kinds] of cases) {
      answer({ "/group-buys": [{ ...GB, ...extra }] });
      const { unmount } = render(<ProducerActivities producerId="p-1" />);
      const card = await screen.findByTestId("producer-group-buy-row");
      const shown = [...card.querySelectorAll("[data-testid^='group-buy-row-']")].map((el) => el.dataset.testid.replace("group-buy-row-", ""));
      expect(shown).toEqual(kinds);
      for (const k of kinds) {
        const note = (extra[`${k}_note`] || "").trim();
        expect(screen.getByTestId(`group-buy-row-${k}`).textContent).toBe(note);
        expect(screen.getByTestId(`group-buy-row-${k}`).querySelector("svg")).not.toBeNull();
      }
      unmount();
      get.mockReset();
    }
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
    // MEH-3892: no gallery handed in → the category tile (the 0-photo cell).
    expect(screen.getAllByTestId("event-row-image")[0]).toHaveAttribute("data-kind", "category");
  });

  // MEH-3892: a row with no photo takes one of the business's photos — the
  // non-cover ones first, in turn by date — never the owner_image_url cover.
  it("rows without a photo take the business's other photos in turn; the row's own photo wins", async () => {
    answer({ "/experiences": [] });
    const rows = [1, 2, 3].map((n) => ({ ...EV, id: `ev${n}`, title: `אירוע ${n}`, event_date: `2099-02-0${n}` }));
    rows[1] = { ...rows[1], image_url: "https://x/own.jpg" };
    render(
      <ProducerActivities
        producerId="p-1"
        images={["https://x/cover.jpg", "https://x/b.jpg", " ", "https://x/c.jpg"]}
        events={rows}
        experiences={[]}
        groupBuys={[]}
      />,
    );
    await screen.findByText("אירוע 3");
    const thumbs = screen.getAllByTestId("event-row-image");
    expect(thumbs.map((el) => el.getAttribute("data-kind"))).toEqual(["owner", "event", "owner"]);
    expect(thumbs[0].style.backgroundImage).toContain("b.jpg");
    expect(thumbs[1].style.backgroundImage).toContain("own.jpg");
    expect(thumbs[2].style.backgroundImage).toContain("c.jpg");
    expect(screen.queryByTestId("event-row-owner-initial")).toBeNull();
  });

  it("a business with one photo: every photo-less row shows that one", async () => {
    render(
      <ProducerActivities producerId="p-1" images={["https://x/only.jpg"]} events={[EV]} experiences={[]} groupBuys={[]} />,
    );
    const thumb = await screen.findByTestId("event-row-image");
    expect(thumb).toHaveAttribute("data-kind", "owner");
    expect(thumb.style.backgroundImage).toContain("only.jpg");
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
