/**
 * MEH-1306: "view on page" back-link in the edit-tab card bodies.
 *
 * Renders the cards directly under the REAL NextIntlClientProvider + he.json
 * (the EditTabDescriptionCard harness) with @/i18n/navigation mocked to a
 * plain <a>. Covers: link presence + href inside a mapped card's expanded
 * body, self-hide when the profile id is absent, and the direct
 * ViewOnPageLink contract.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import {
  DescriptionCard,
  ViewOnPageLink,
} from "@/app/[locale]/producer/dashboard/edit/cards";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));
vi.mock("@/lib/toast", () => ({
  showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));

const VIEW_LABEL = he.dashboard.producer.view_on_page;

function wrap(ui) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {ui}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ViewOnPageLink (MEH-1306)", () => {
  it("links to the mapped public section id on the business page", () => {
    wrap(<ViewOnPageLink producerId={42} anchor="section-products" />);
    const link = screen.getByTestId("view-on-page-section-products");
    expect(link).toHaveAttribute("href", "/producer/42#section-products");
    expect(link.textContent).toContain(VIEW_LABEL);
  });

  it("renders nothing without a producer id (no dead link)", () => {
    const { container } = wrap(<ViewOnPageLink anchor="section-products" />);
    expect(container.querySelector("a")).toBeNull();
  });
});

describe("DescriptionCard view-link presence (MEH-1306)", () => {
  it("renders the back-link to #section-bio inside the card body", () => {
    wrap(<DescriptionCard profile={{ id: 42 }} onSave={() => {}} />);
    const link = screen.getByTestId("view-on-page-section-bio");
    expect(link).toHaveAttribute("href", "/producer/42#section-bio");
  });

  it("shows the MEH-1306 empty-state placeholder on the hero textarea", () => {
    wrap(<DescriptionCard profile={{ id: 42 }} onSave={() => {}} />);
    expect(
      screen.getByPlaceholderText(he.dashboard.producer.description_card.desc_placeholder),
    ).toBeInTheDocument();
  });
});
