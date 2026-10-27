import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HomeProducersGrid } from "@/app/[locale]/home/HomeProducersGrid";

// MEH-1174 — homepage discovery seam:
//  A) (removed in MEH-2394 with the coach-mark tour)
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
  onChipNavigate: () => {},
  onClearCategory: () => {},
  onLoadMore: () => {},
};

const noCategory = { category: "", delivery_city: "", has_delivery: false };
const withCategory = { category: "3", delivery_city: "", has_delivery: false };

describe("HomeProducersGrid discovery seam (MEH-1174)", () => {
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
    // MEH-2130: the accessible name now INCLUDES the category, because a bare
    // `aria-label` overrides the computed name outright — it was suppressing the
    // category name in the child span, so with an attribute tag also active the
    // two buttons were indistinguishable to a screen reader. Asserting the full
    // name (not a substring) is what makes this a regression test for that.
    const tag = screen.getByRole("button", {
      name: "home.producers.clear_filter חלב וגבינות",
    });
    expect(tag).toHaveTextContent("חלב וגבינות");
    fireEvent.click(tag);
    expect(onClearCategory).toHaveBeenCalledTimes(1);
    // the old separate "מציג:" row is gone.
    expect(screen.queryByText("home.producers.filter_showing")).not.toBeInTheDocument();
  });

  it("C — no category → no removable category tag", () => {
    render(<HomeProducersGrid {...baseProps} filters={noCategory} />);
    // A REGEX, not the exact string. With the name now carrying the category,
    // an exact-match query for the bare key can never match anything — so this
    // negative would have passed whether or not a stray tag rendered, which is
    // the "guard that consults its own subject" shape .claude/rules/testing.md
    // warns about. The regex still catches any clear-filter button.
    expect(
      screen.queryByRole("button", { name: /home\.producers\.clear_filter/ }),
    ).not.toBeInTheDocument();
  });
});
