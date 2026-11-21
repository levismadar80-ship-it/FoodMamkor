import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import he from "../messages/he.json";

/**
 * MEH-3557 — the print kit on /producer/dashboard/qr-card.
 *
 * Renders the real page (api, auth and router stubbed) and drives the picker.
 * Discrimination: render one sticker instead of STICKER_COUNT → the count case
 * goes red; drop `flipped` on the top half → the rotate case goes red; read the
 * hint from a fixed key → the hint case goes red; put an <a> in a layout → the
 * no-anchor case goes red.
 */

vi.mock("qrcode", () => ({
  default: { toString: () => Promise.resolve("<svg data-testid='stub-qr'></svg>") },
}));

const replace = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  Link: ({ href, children, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: 1, role: "producer" }, loading: false }),
}));

const producer = {
  id: "0b5f2c18-7a44-4d6e-9f31-2c8a5e7b1d90",
  slug: "lechem-shel-dana",
  name: "הלחם של דנה",
  status: "approved",
  kind: "producer",
};
vi.mock("@/lib/api", () => ({ default: { get: () => Promise.resolve({ data: producer }) } }));
vi.mock("@/lib/producer-completeness", () => ({
  producerCompleteness: () => ({ missing: [] }),
}));

import QrCardPage from "@/app/[locale]/producer/dashboard/qr-card/page";

async function renderPage() {
  render(
    <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
      <QrCardPage />
    </NextIntlClientProvider>,
  );
  await screen.findByTestId("print-kit-a6");
}

const pick = (f) => fireEvent.click(screen.getByTestId(`print-kit-format-${f}`));

describe("print kit", () => {
  beforeEach(() => replace.mockClear());

  it("opens on the A6 card, its button pressed", async () => {
    await renderPage();
    expect(screen.getByTestId("print-kit-format-a6").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("print-kit-format-poster").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("print-kit-hint").textContent).toBe(he.qr_card.hints.a6);
    expect(screen.queryByTestId("print-kit-poster")).toBeNull();
  });

  it("the sticker sheet carries 12 stickers, each with the business name", async () => {
    await renderPage();
    pick("sticker");
    const items = screen.getAllByTestId("print-kit-sticker-item");
    expect(items).toHaveLength(12);
    for (const el of items) expect(el.textContent).toContain(producer.name);
    expect(screen.queryByTestId("print-kit-a6")).toBeNull();
    expect(screen.getByTestId("print-kit-hint").textContent).toBe(he.qr_card.hints.sticker);
  });

  it("the table sign turns only its top half upside down", async () => {
    await renderPage();
    pick("table");
    expect(screen.getByTestId("print-kit-table-top").className).toContain("rotate-180");
    expect(screen.getByTestId("print-kit-table-bottom").className).not.toContain("rotate-180");
    expect(screen.getByTestId("print-kit-hint").textContent).toBe(he.qr_card.hints.table);
  });

  it("the poster carries its extra line and the A4 page rule", async () => {
    await renderPage();
    pick("poster");
    const poster = screen.getByTestId("print-kit-poster");
    expect(poster.textContent).toContain(he.qr_card.poster_line);
    expect(document.querySelector("style")?.textContent).toContain("size: A4");
  });

  it("no printed layout holds a link (print CSS would print its href)", async () => {
    await renderPage();
    for (const f of ["a6", "poster", "table", "sticker"]) {
      pick(f);
      const article = screen.getByTestId(`print-kit-${f}`);
      expect(article.tagName).toBe("ARTICLE");
      expect(within(article).queryAllByRole("link")).toHaveLength(0);
    }
  });

  it("draws the code once the SVG resolves", async () => {
    await renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("business-qr-print-code").querySelector("svg")).not.toBeNull(),
    );
  });
});
