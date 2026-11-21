/**
 * MEH-3616 — «הוספה ליומן» on the buyer's order status page, and the slot
 * .ics it downloads (lib/event-ics.js buildSlotIcs). The button exists only
 * once the business committed to a slot (confirmed / ready).
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));

import { OrderStatusView } from "@/app/[locale]/order/[id]/OrderStatusClient";
import { buildSlotIcs } from "@/lib/event-ics";

const base = {
  id: "0a000000-0000-4000-8000-00000000000a",
  status: "confirmed",
  fulfilment: "pickup",
  slot_start: "2026-11-20T07:00:00Z",
  slot_end: "2026-11-20T08:00:00Z",
  items: [],
  estimated_total_agorot: 0,
  final_total_agorot: null,
  delivery_fee_agorot: 0,
  proposal: null,
  expires_at: null,
  producer_name: "המאפייה של רותי",
  pickup_address: "הנשיא 5, זכרון יעקב",
  pickup_code: "1234",
  can_cancel: true,
};

const show = (over) =>
  render(
    <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
      <OrderStatusView order={{ ...base, ...over }} onChange={() => {}} refOf={() => ({})} />
    </NextIntlClientProvider>,
  );

describe("order status «הוספה ליומן» (MEH-3616)", () => {
  it.each(["confirmed", "ready"])("%s with a slot shows the button", (status) => {
    show({ status });
    expect(screen.getByTestId("order-add-to-calendar").textContent).toContain("הוספה ליומן");
  });

  it.each(["pending", "change_proposed", "declined", "cancelled", "expired", "handed"])(
    "%s shows no button",
    (status) => {
      show({ status });
      expect(screen.queryByTestId("order-add-to-calendar")).toBeNull();
    },
  );

  it("a confirmed order without a slot end shows no button", () => {
    show({ slot_end: null });
    expect(screen.queryByTestId("order-add-to-calendar")).toBeNull();
  });
});

describe("the downloaded file (MEH-3616)", () => {
  /** Click the button and return the .ics text handed to the Blob. */
  const clickAndRead = async (over) => {
    window.location.hash = "#t=SECRET-TOKEN";
    let blobPart = "";
    const RealBlob = globalThis.Blob;
    globalThis.Blob = class extends RealBlob {
      constructor(parts, opts) {
        super(parts, opts);
        blobPart = String(parts[0]);
      }
    };
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    try {
      show(over);
      fireEvent.click(screen.getByTestId("order-add-to-calendar"));
    } finally {
      globalThis.Blob = RealBlob;
      window.location.hash = "";
    }
    return blobPart;
  };

  it("a pickup order: the business title, the address, and never the #t= token", async () => {
    const ics = await clickAndRead({});
    expect(ics).toContain("SUMMARY:איסוף הזמנה: המאפייה של רותי");
    expect(ics).toContain("LOCATION:הנשיא 5\\, זכרון יעקב");
    expect(ics).toContain("DTSTART:20261120T070000Z");
    expect(ics).not.toContain("SECRET-TOKEN");
    expect(ics).not.toMatch(/^URL:/m);
  });

  it("a delivery order: the delivery title and no LOCATION", async () => {
    const ics = await clickAndRead({ fulfilment: "delivery" });
    expect(ics).toContain("SUMMARY:משלוח הזמנה: המאפייה של רותי");
    expect(ics).not.toMatch(/^LOCATION:/m);
  });
});

describe("buildSlotIcs (MEH-3616)", () => {
  const lines = (ics) => ics.replaceAll("\r\n ", "").split("\r\n");
  const NOW = new Date(Date.UTC(2026, 10, 19, 12, 0, 0));

  it("writes the slot instants in UTC, the title and the place", () => {
    const out = lines(
      buildSlotIcs(
        { uid: "order-1", start: "2026-11-20T09:00:00+02:00", end: "2026-11-20T10:30:00+02:00", title: "איסוף הזמנה: רותי", location: "הנשיא 5, זכרון יעקב" },
        { now: NOW },
      ),
    );
    expect(out).toContain("DTSTART:20261120T070000Z");
    expect(out).toContain("DTEND:20261120T083000Z");
    expect(out).toContain("UID:order-1@mehamakor.co.il");
    expect(out).toContain("SUMMARY:איסוף הזמנה: רותי");
    expect(out).toContain("LOCATION:הנשיא 5\\, זכרון יעקב");
  });

  it("a delivery slot has no LOCATION line", () => {
    const out = lines(buildSlotIcs({ uid: "o", start: "2026-11-20T07:00:00Z", end: "2026-11-20T08:00:00Z", title: "x", location: null }, { now: NOW }));
    expect(out.some((l) => l.startsWith("LOCATION"))).toBe(false);
  });
});
