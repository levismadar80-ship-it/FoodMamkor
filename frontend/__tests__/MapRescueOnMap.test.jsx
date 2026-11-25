/**
 * MEH-3824 — a business with a surprise bag today shows it in its picked card
 * on the map: a row with the window and the price, linking to the bag page.
 * No badge on the pin (Sapir 25/11: bags are one offer among several on the
 * site, not its focus). The row reads `rescue_today` off the producer list and
 * stays dark while the client half of the pilot switch is off. Real he.json.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));

const { default: MapRescueRow } = await import("@/app/[locale]/map/components/MapRescueRow");
const { ProducerSchema } = await import("@/lib/schemas");


// 17:00–19:00 UTC on 25/11 is 19:00–21:00 in Israel (UTC+2).
const bag = (over = {}) => ({
  offer_id: "0f0f0f0f-0000-4000-8000-000000000001",
  location_id: "loc-branch",
  price_agorot: 1500,
  value_min_agorot: null,
  pickup_start: "2026-11-25T17:00:00Z",
  pickup_end: "2026-11-25T19:00:00Z",
  qty_left: 3,
  ...over,
});
const producer = (rescue_today) => ({ id: "p1", name: "מאפיית הדוגמה", categories: [], rescue_today });

const showRow = (p) =>
  render(
    <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
      <MapRescueRow producer={p} />
    </NextIntlClientProvider>,
  );

describe("bags on the map — pilot on", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_RESCUE_BAGS_ENABLED", "true"));
  afterEach(() => vi.unstubAllEnvs());

  it("the row says «סל הפתעה», today's window in Israel time and the price, and links to the bag", () => {
    showRow(producer(bag()));
    const row = screen.getByTestId("map-rescue-row");
    expect(row.getAttribute("href")).toBe("/rescue/0f0f0f0f-0000-4000-8000-000000000001");
    expect(row.textContent).toContain("סל הפתעה");
    // The window is isolated LTR (LRI … PDI), so it cannot read backwards.
    expect(screen.getByTestId("map-rescue-row-window").textContent).toBe("איסוף היום ⁦19:00–21:00⁩");
    expect(screen.getByTestId("map-rescue-row-price").textContent).toBe("15 ₪");
    expect(screen.queryByTestId("map-rescue-row-worth")).toBeNull();
  });

  it("a worth above the price is struck, and read aloud as worth and price", () => {
    showRow(producer(bag({ value_min_agorot: 4500 })));
    expect(screen.getByTestId("map-rescue-row-worth").textContent).toBe("45 ₪");
    expect(screen.getByTestId("map-rescue-row").textContent).toContain("שווי 45 ₪, משלמים 15 ₪");
  });

  it("no bag today, no row", () => {
    const { container } = showRow(producer(null));
    expect(container.innerHTML).toBe("");
  });

  it("a malformed bag drops the row, never the business (the feed parses all-or-nothing)", () => {
    const parsed = ProducerSchema.safeParse({ ...producer({ offer_id: 7 }), id: "p1" });
    expect(parsed.success).toBe(true);
    expect(parsed.data.rescue_today).toBeNull();
    const good = ProducerSchema.safeParse({ ...producer(bag()), id: "p1" });
    expect(good.data.rescue_today.offer_id).toBe(bag().offer_id);
  });

  it("an empty bag id renders no row instead of a link with no target", () => {
    const parsed = ProducerSchema.safeParse({ ...producer(bag({ offer_id: "" })), id: "p1" });
    expect(parsed.data.rescue_today).toBeNull();
    const { container } = showRow(producer(bag({ offer_id: "" })));
    expect(container.innerHTML).toBe("");
  });
});

describe("bags on the map — client switch off", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_RESCUE_BAGS_ENABLED", "false"));
  afterEach(() => vi.unstubAllEnvs());

  it("no row, even with a bag in the payload", () => {
    const { container } = showRow(producer(bag()));
    expect(container.innerHTML).toBe("");
  });
});
