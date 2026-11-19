/**
 * MEH-3108: «מה מחכה לך» on the dashboard home. 0 items → nothing rendered;
 * 1 → one row; 3 → reviews, the top sign-up item, funded group buys, each
 * linking to its tool. Rendered with the real he.json so the ICU plurals are
 * read, not keys.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...p }) => <a href={href} {...p}>{children}</a>,
}));

import OwnerAttentionCard from "@/components/producer/OwnerAttentionCard";

const renderCard = (attention) =>
  render(
    <NextIntlClientProvider locale="he" messages={he}>
      <OwnerAttentionCard attention={attention} />
    </NextIntlClientProvider>,
  );

const none = { unreplied_reviews: 0, new_signups: [], funded_group_buys: 0 };

describe("OwnerAttentionCard (MEH-3108)", () => {
  it("0 items: renders nothing (no empty state)", () => {
    const { container } = renderCard(none);
    expect(container.innerHTML).toBe("");
  });

  it("missing payload (old backend): renders nothing", () => {
    const { container } = renderCard(undefined);
    expect(container.innerHTML).toBe("");
  });

  it("1 item: one row, singular copy, links to the reviews page", () => {
    renderCard({ ...none, unreplied_reviews: 1 });
    const card = screen.getByTestId("owner-attention");
    expect(within(card).getByRole("heading")).toHaveTextContent("מה מחכה לך");
    expect(within(card).getAllByRole("listitem")).toHaveLength(1);
    const row = screen.getByTestId("owner-attention-reviews");
    expect(row).toHaveTextContent("ביקורת אחת בלי תגובה");
    expect(within(row).getByRole("link", { name: "לענות" })).toHaveAttribute("href", "/producer/dashboard/reviews");
  });

  it("3 items: fixed order, plurals, the top sign-up item only, each to its tool", () => {
    renderCard({
      unreplied_reviews: 2,
      new_signups: [
        { kind: "experience", title: "סדנת שאור", count: 3 },
        { kind: "event", title: "יום פתוח", count: 1 },
      ],
      funded_group_buys: 2,
    });
    const rows = screen.getAllByRole("listitem");
    expect(rows.map((r) => r.dataset.testid)).toEqual([
      "owner-attention-reviews",
      "owner-attention-signups",
      "owner-attention-group_buys",
    ]);
    expect(rows[0]).toHaveTextContent("2 ביקורות בלי תגובה");
    expect(rows[1]).toHaveTextContent("3 הרשמות חדשות לסדנת שאור");
    expect(within(rows[1]).getByRole("link")).toHaveAttribute("href", "/producer/dashboard/experiences");
    expect(rows[2]).toHaveTextContent("2 קבוצות רכישה הגיעו ליעד");
    expect(within(rows[2]).getByRole("link")).toHaveAttribute("href", "/producer/dashboard/group-buys");
  });

  it("an event sign-up links to the events tab, singular copy", () => {
    renderCard({ ...none, new_signups: [{ kind: "event", title: "יום פתוח", count: 1 }] });
    const row = screen.getByTestId("owner-attention-signups");
    expect(row).toHaveTextContent("הרשמה חדשה ליום פתוח");
    expect(within(row).getByRole("link")).toHaveAttribute("href", "/producer/dashboard/events");
  });

  it("MEH-3316: orders waiting come first and link to the orders tab", () => {
    renderCard({ ...none, unreplied_reviews: 1, pending_orders: 3 });
    const rows = screen.getAllByRole("listitem");
    expect(rows.map((r) => r.dataset.testid)).toEqual(["owner-attention-orders", "owner-attention-reviews"]);
    expect(rows[0]).toHaveTextContent("3 הזמנות מחכות לאישור");
    expect(within(rows[0]).getByRole("link", { name: "לאשר" })).toHaveAttribute("href", "/producer/dashboard/orders");
  });

  it("MEH-3316: one order waiting reads in the singular; none shows no row", () => {
    renderCard({ ...none, pending_orders: 1 });
    expect(screen.getByTestId("owner-attention-orders")).toHaveTextContent("הזמנה אחת מחכה לאישור");
  });

  // MEH-3430: no products yet → «העלו תפריט», for a business, never an organizer.
  it("0 products: the menu row, linking to the products card", () => {
    renderCard({ ...none, products: 0 });
    const row = screen.getByTestId("owner-attention-menu");
    expect(row).toHaveTextContent(he.dashboard.producer.attention.menu);
    expect(within(row).getByRole("link", { name: "העלו תפריט" })).toHaveAttribute("href", "/producer/dashboard/edit#products");
  });

  it("products, a failed count (-1) or an organizer: no menu row", () => {
    for (const [att, org] of [[{ ...none, products: 3 }, false], [{ ...none, products: -1 }, false], [{ ...none, products: 0 }, true]]) {
      const { container, unmount } = render(
        <NextIntlClientProvider locale="he" messages={he}>
          <OwnerAttentionCard attention={att} isOrganizer={org} />
        </NextIntlClientProvider>,
      );
      expect(container.innerHTML).toBe("");
      unmount();
    }
  });
});
