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

  it("English has the label too (no MISSING_MESSAGE on /en)", async () => {
    await renderWith([row({ id: 3 })], en, "en");
    expect(await screen.findByText("No delivery confirmation")).toBeInTheDocument();
  });
});
