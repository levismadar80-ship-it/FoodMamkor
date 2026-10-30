import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

// MEH-2406: one category, one target, on the business page. The breadcrumb
// crumb used to link /?category=<id> (the home feed) while the header meta line
// linked /producers?category=<id>. Both now go to the canonical listing.
// Cells: (category → crumb links the listing) · (no category → no crumb).

const state = { producer: null };

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "p1" }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (key) => key }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/components/ImageGallery", () => ({ default: () => null }));
vi.mock("@/components/OwnerSectionEditLink", () => ({ default: () => null }));
vi.mock("@/components/SectionAnchorNav", () => ({ default: () => null }));
vi.mock("@/app/[locale]/producer/[id]/components/ContactCard", () => ({ default: () => null }));
vi.mock("@/app/[locale]/producer/[id]/components/ContactSidebar", () => ({ default: () => null }));
vi.mock("@/app/[locale]/producer/[id]/components/OtherBusinesses", () => ({ default: () => null }));
vi.mock("@/app/[locale]/producer/[id]/components/OwnerEditBar", () => ({ default: () => null }));
vi.mock("@/app/[locale]/producer/[id]/components/ProducerHeader", () => ({ default: () => null }));
vi.mock("@/app/[locale]/producer/[id]/components/ProducerSections", () => ({ default: () => null }));
vi.mock("@/app/[locale]/producer/[id]/lib/section-nav", () => ({ getSectionNavItems: () => [] }));
vi.mock("@/app/[locale]/producer/[id]/components/StickyContactBar", () => ({ default: () => null }));
vi.mock("@/app/[locale]/producer/[id]/hooks/useProducerData", () => ({
  useProducerData: () => ({
    producer: state.producer,
    loading: false,
    events: [],
    similarProducers: [],
    nearbyProducers: [],
  }),
}));
vi.mock("@/app/[locale]/producer/[id]/hooks/useStickyBar", () => ({
  useStickyBar: () => ({ inlineCTARef: { current: null }, isBarVisible: false }),
}));
vi.mock("@/app/[locale]/producer/[id]/hooks/useLazyReviews", () => ({
  useLazyReviews: () => ({ reviewsContainerRef: { current: null }, reviewsVisible: false }),
}));

import ProducerDetail from "@/app/[locale]/producer/[id]/ProducerDetail";
import { categoryListingHref } from "@/app/[locale]/producer/[id]/lib/producer-format";

function renderWith(producer) {
  state.producer = { id: "p1", name: "מאפיית הגבעה", images: [], ...producer };
  render(<ProducerDetail />);
  return within(screen.getByTestId("producer-breadcrumb-block"));
}

describe("business page category links (MEH-2406)", () => {
  it("the breadcrumb category crumb links the /producers listing, not the home feed", () => {
    const crumbs = renderWith({ categories: [{ id: "bakery", name: "מאפים" }] });
    const crumb = crumbs.getByRole("link", { name: "מאפים" });
    expect(crumb.getAttribute("href")).toBe("/producers?category=bakery");
  });

  it("matches the header meta link target exactly (one helper owns it)", () => {
    const crumbs = renderWith({ categories: [{ id: "dairy & co", name: "מחלבה" }] });
    expect(crumbs.getByRole("link", { name: "מחלבה" }).getAttribute("href")).toBe(
      categoryListingHref("dairy & co"),
    );
  });

  it("no category → no category crumb, only home and the business name", () => {
    const crumbs = renderWith({ categories: [] });
    expect(crumbs.getAllByRole("link")).toHaveLength(1);
    expect(crumbs.getByText("מאפיית הגבעה")).toBeTruthy();
  });
});
