/**
 * MEH-3402 follow-up — messages dropped outside production are listed with
 * what they would have said. 0 rows (production) → nothing renders;
 * 1 / many rows → one table row each, with the approved copy.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import WhatsappBlockedSection from "@/components/admin/WhatsappBlockedSection";

const apiMock = vi.hoisted(() => ({ rows: [], get: vi.fn() }));
vi.mock("@/lib/api", () => ({
  default: { get: (...a) => (apiMock.get(...a), Promise.resolve({ data: apiMock.rows })) },
}));

const row = (over) => ({
  id: "1",
  to_phone: "972541112233",
  kind: "template[product_order_new_v1]",
  status: "blocked_nonprod",
  error_code: null,
  error_message: "product_order_new_v1: משק הגליל | 2",
  created_at: "2026-11-18T09:00:00Z",
  updated_at: null,
  ...over,
});

async function renderWith(rows) {
  apiMock.rows = rows;
  apiMock.get.mockClear();
  const view = render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <WhatsappBlockedSection />
    </NextIntlClientProvider>,
  );
  await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith("/admin/whatsapp/blocked"));
  return view;
}

describe("admin — WhatsApp blocked outside production", () => {
  it("0 rows: renders nothing", async () => {
    const { container } = await renderWith([]);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("1 row: the section, the approved title and the content", async () => {
    await renderWith([row()]);
    expect(await screen.findByText("הודעות שנחסמו בסביבת הבדיקות")).toBeInTheDocument();
    expect(screen.getByText("תוכן ההודעה")).toBeInTheDocument();
    expect(screen.getByText("product_order_new_v1: משק הגליל | 2")).toBeInTheDocument();
  });

  it("many rows: one row each", async () => {
    await renderWith([row({ id: "1" }), row({ id: "2", error_message: "שלום" }), row({ id: "3" })]);
    const section = await screen.findByTestId("whatsapp-blocked");
    expect(section.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(screen.getByText("שלום")).toBeInTheDocument();
  });
});
