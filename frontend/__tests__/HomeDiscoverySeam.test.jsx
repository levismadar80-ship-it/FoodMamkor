import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HomeProducersGrid } from "@/app/[locale]/home/HomeProducersGrid";

// MEH-1174 — homepage discovery seam:
//  A) onboarding tip step 0 renders ABOVE the section heading (before <h2>)
//  B) heading is dynamic — default vs "בתי עסק · {name}" when a category is active
//  C) an active category shows a removable "× {name}" tag in the applied-filters
//     row whose × reuses the existing clear-category handler.

vi.mock("next-intl", () => ({
  useTranslations: () => (k, v) => (v ? `${k}:${JSON.stringify(v)}` : k),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...p }) => <a href={href} {...p}>{children}</a>,
}));
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, initial, whileInView, viewport, transition, ...p }) => (
      <div {...p}>{children}</div>
    ),
  },
}));
vi.mock("@/components/ProducerCard", () => ({ default: () => <div /> }));
vi.mock("@/components/Skeleton", () => ({ SkeletonProducerGrid: () => <div /> }));
vi.mock("@/components/ChipScrollRow", () => ({ default: () => null }));
// MEH-1774: this suite pulls use-home-page transitively (HomeProducersGrid
// imports LOAD_MORE_CAP from it), and that module now imports the locale-aware
// router. Stub it so next-intl's ESM createNavigation never loads under vitest.
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
// Render only when `show` so DOM-order / visibility assertions are meaningful.
vi.mock("@/components/OnboardingTip", () => ({
  default: ({ show, text }) => (show ? <div data-testid="tip">{text}</div> : null),
}));

const baseProps = {
  producers: [{ id: 1 }],
  producersLoading: false,
  visibleProducers: [{ id: 1 }],
  hasMore: false,
  visibleCount: 8,
  chips: {},
  categories: [{ id: 3, name: "חלב וגבינות" }],
  showNewUserHint: false,
  fridayMode: false,
  step0Visible: false,
  onboardStep: -1,
  onboardAdvance: () => {},
  onboardDismiss: () => {},
  onAdvanceFromStep0: () => {},
  onChipNavigate: () => {},
  onClearCategory: () => {},
  onLoadMore: () => {},
};

const noCategory = { category: "", delivery_city: "", has_delivery: false };
const withCategory = { category: "3", delivery_city: "", has_delivery: false };

describe("HomeProducersGrid discovery seam (MEH-1174)", () => {
  it("A — step 0 tip renders before the section heading in DOM order", () => {
    render(
      <HomeProducersGrid
        {...baseProps}
        filters={noCategory}
        step0Visible
        onboardStep={0}
      />,
    );
    const tip = screen.getByTestId("tip");
    const heading = screen.getByRole("heading", { level: 2 });
    // heading must FOLLOW the tip in the document.
    expect(
      tip.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("B — default heading when no category is active", () => {
    render(<HomeProducersGrid {...baseProps} filters={noCategory} />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "home.producers.heading",
    );
    expect(screen.queryByText(/heading_category/)).not.toBeInTheDocument();
  });

  it("B — active category heading interpolates the category name", () => {
    render(<HomeProducersGrid {...baseProps} filters={withCategory} />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveTextContent("home.producers.heading_category");
    expect(heading).toHaveTextContent("חלב וגבינות");
  });

  it("C — active category renders a removable tag whose × clears the filter", () => {
    const onClearCategory = vi.fn();
    render(
      <HomeProducersGrid
        {...baseProps}
        filters={withCategory}
        onClearCategory={onClearCategory}
      />,
    );
    const tag = screen.getByRole("button", { name: "home.producers.clear_filter" });
    expect(tag).toHaveTextContent("חלב וגבינות");
    fireEvent.click(tag);
    expect(onClearCategory).toHaveBeenCalledTimes(1);
    // the old separate "מציג:" row is gone.
    expect(screen.queryByText("home.producers.filter_showing")).not.toBeInTheDocument();
  });

  it("C — no category → no removable category tag", () => {
    render(<HomeProducersGrid {...baseProps} filters={noCategory} />);
    expect(
      screen.queryByRole("button", { name: "home.producers.clear_filter" }),
    ).not.toBeInTheDocument();
  });
});
