/**
 * MEH-2651 — the /group-buys list card shows one short line per answer:
 * pickup (MapPin) and delivery (Truck). A group made before the split carries
 * only fulfillment_note and shows it as before.
 *
 * Cells: pickup only / delivery only / both / old note only / none.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import GroupBuysClient from "@/app/[locale]/group-buys/GroupBuysClient";

vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key) => `${ns}.${key}`,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...rest }) => <a href={typeof href === "string" ? href : "#"} {...rest}>{children}</a>,
}));
vi.mock("next/image", () => ({ default: (props) => <img alt="" {...props} /> }));
vi.mock("@/components/CitySearch", () => ({ default: () => <div /> }));

const rows = { current: [] };
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(() => Promise.resolve({ data: rows.current })) } }));

const gb = (over) => ({
  id: "gb-1",
  title: "מארז לחמים",
  status: "open",
  deadline: "2099-01-01T00:00:00Z",
  min_participants: 5,
  commits_count: 1,
  price_per_unit_regular: "100.00",
  price_per_unit_group: "80.00",
  fulfillment_note: null,
  pickup_note: null,
  delivery_note: null,
  ...over,
});

async function renderCard(over) {
  rows.current = [gb(over)];
  render(<GroupBuysClient />);
  await screen.findByText("מארז לחמים");
}
const line = (kind) => screen.queryByTestId(`group-buy-card-${kind}`);

describe("the pickup / delivery line on a list card", () => {
  it("pickup only", async () => {
    await renderCard({ pickup_note: "מהמשק ביום שישי" });
    expect(line("pickup").textContent).toBe("מהמשק ביום שישי");
    expect(line("delivery")).toBeNull();
    expect(line("fulfillment")).toBeNull();
  });

  it("delivery only", async () => {
    await renderCard({ delivery_note: "לזכרון יעקב" });
    expect(line("delivery").textContent).toBe("לזכרון יעקב");
    expect(line("pickup")).toBeNull();
  });

  it("both, pickup first; a leftover old note is not shown", async () => {
    await renderCard({ pickup_note: "מהמשק", delivery_note: "לחדרה", fulfillment_note: "ישן" });
    expect(line("pickup").compareDocumentPosition(line("delivery")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(line("fulfillment")).toBeNull();
  });

  it("an old group shows its single note as before", async () => {
    await renderCard({ fulfillment_note: "איסוף מחדרה ביום שישי" });
    expect(line("fulfillment").textContent).toBe("איסוף מחדרה ביום שישי");
  });

  it("no answer at all: no line", async () => {
    await renderCard({});
    expect(line("pickup") || line("delivery") || line("fulfillment")).toBeNull();
  });
});
