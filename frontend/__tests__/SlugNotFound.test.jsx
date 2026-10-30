// MEH-2602: a business URL that resolves to nothing (suspended, pending, never
// existed) shows the business-specific not-found page, not the global
// «לא מצאנו את הדף הזה» — and never says why.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));

import SlugNotFound from "@/app/[locale]/[slug]/not-found";

describe("/[slug] not-found (MEH-2602)", () => {
  it("renders the business copy with a way back to the map", () => {
    render(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <SlugNotFound />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("heading")).toHaveTextContent(he.errors.producer_not_found.heading);
    expect(screen.queryByText(he.errors.not_found.heading)).toBeNull();
    expect(screen.getByText(he.errors.producer_not_found.discover).closest("a")).toHaveAttribute("href", "/map");
    expect(document.body.textContent).not.toMatch(/מושה|הושע/);
  });
});
