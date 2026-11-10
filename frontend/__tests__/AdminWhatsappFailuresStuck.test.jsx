/**
 * MEH-2122 Chunk E — a stuck `accepted` row (Meta accepted it over a day ago,
 * no delivery receipt since) is listed by GET /admin/whatsapp/failed and must
 * render with its approved label «אין אישור מסירה» (Sapir 10/11), not as a
 * raw i18n key. Real NextIntlClientProvider + he.json, so a missing key shows.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";
import Page from "@/app/[locale]/admin/whatsapp-failures/page";

const apiMock = vi.hoisted(() => ({ rows: [], get: vi.fn() }));
vi.mock("@/lib/api", () => ({
  default: { get: (...a) => (apiMock.get(...a), Promise.resolve({ data: apiMock.rows })) },
}));
vi.mock("@/lib/toast", () => ({ showToast: { error: vi.fn(), success: vi.fn() } }));

const row = (over) => ({
  id: 1,
  to_phone: "972501112222",
  kind: "otp",
  status: "accepted",
  error_code: null,
  error_message: null,
  created_at: "2026-11-08T09:00:00Z",
  updated_at: "2026-11-08T09:00:00Z",
  ...over,
});

async function renderWith(rows, messages = he, locale = "he") {
  apiMock.rows = rows;
  render(
    <NextIntlClientProvider locale={locale} messages={messages} onError={() => {}}>
      <Page />
    </NextIntlClientProvider>,
  );
  await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
}

describe("admin WhatsApp failures — stuck `accepted` rows (MEH-2122 Chunk E)", () => {
  it("an accepted row reads «אין אישור מסירה», never the raw key", async () => {
    await renderWith([row({ id: 1 }), row({ id: 2, status: "failed" })]);
    expect(await screen.findByText("אין אישור מסירה")).toBeInTheDocument();
    expect(screen.getByText(he.admin.whatsapp_failures.status.failed)).toBeInTheDocument();
    expect(screen.queryByText(/whatsapp_failures\.status\./)).not.toBeInTheDocument();
  });

  // MEH-2122: the hint line above the table, approved word for word 10/11.
  const HINT =
    "הודעות ש-Meta קיבלה לפני יותר מיום, ועדיין לא הגיע עליהן אישור מסירה. אם יש הרבה כאלה, ייתכן שאישורי המסירה לא מגיעים אלינו.";

  it("one stuck row: the hint shows, with the approved copy", async () => {
    await renderWith([row({ id: 4 })]);
    expect(await screen.findByTestId("whatsapp-stuck-hint")).toHaveTextContent(HINT);
  });

  it("many rows, some stuck: one hint, not one per row", async () => {
    await renderWith([row({ id: 5 }), row({ id: 6 }), row({ id: 7, status: "failed" })]);
    await screen.findByTestId("whatsapp-stuck-hint");
    expect(screen.getAllByTestId("whatsapp-stuck-hint")).toHaveLength(1);
  });

  it("only failed rows: no hint (it is about missing receipts, not failures)", async () => {
    await renderWith([row({ id: 8, status: "failed" }), row({ id: 9, status: "window_expired" })]);
    await screen.findByText(he.admin.whatsapp_failures.status.failed);
    expect(screen.queryByTestId("whatsapp-stuck-hint")).toBeNull();
  });

  it("no rows: the empty state and no hint", async () => {
    await renderWith([]);
    await screen.findByText(he.admin.whatsapp_failures.empty);
    expect(screen.queryByTestId("whatsapp-stuck-hint")).toBeNull();
  });

  it("English has the label too (no MISSING_MESSAGE on /en)", async () => {
    await renderWith([row({ id: 3 })], en, "en");
    expect(await screen.findByText("No delivery confirmation")).toBeInTheDocument();
  });
});
