import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";

// MEH-3019: on a phone the business page shows «→ חזרה» instead of the
// breadcrumb; on a desktop nothing changes. jsdom applies no CSS, so the
// phone/desktop split is read off the responsive classes that carry it
// (`hidden lg:block` on the breadcrumb, `lg:hidden` on the back link) — the
// rendered pixels are checked by the 390 / 1280 screenshots and mobile VRT.
// Cells: arrival (direct / from inside the site / from the map) × (phone / desktop).

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

function arrive({ canGoBack, search = "" }) {
  window.history.replaceState(null, "", `/producer/p1${search}`);
  Object.defineProperty(window, "navigation", { configurable: true, value: { canGoBack } });
  state.producer = { id: "p1", name: "מאפיית הגבעה", images: [], categories: [{ id: "bakery", name: "מאפים" }] };
  render(<ProducerDetail />);
  return within(screen.getByTestId("producer-breadcrumb-block"));
}

const classesOf = (el) => el.className.split(/\s+/);
const phoneOnly = (el) => classesOf(el).includes("lg:hidden") && !classesOf(el).includes("hidden");
const desktopOnly = (el) => classesOf(el).includes("hidden") && classesOf(el).includes("lg:block");

afterEach(() => {
  cleanup();
  delete window.navigation;
});

describe("business page: breadcrumb on desktop, «→ חזרה» on a phone (MEH-3019)", () => {
  it("the breadcrumb still renders, desktop only (phone: hidden · desktop: unchanged)", () => {
    const block = arrive({ canGoBack: false });
    expect(desktopOnly(block.getByTestId("breadcrumb-nav"))).toBe(true);
    expect(block.getByRole("link", { name: "מאפים" })).toBeTruthy();
  });

  it("direct arrival: no back link at all, on either screen", () => {
    const block = arrive({ canGoBack: false });
    expect(block.queryByTestId("history-back")).toBeNull();
    expect(block.queryByTestId("back-to-map")).toBeNull();
  });

  it("arrival from inside the site: «→ חזרה», phone only (desktop shows none)", () => {
    const block = arrive({ canGoBack: true });
    const back = block.getByTestId("history-back");
    expect(back.textContent).toBe("back_label");
    expect(phoneOnly(back)).toBe(true);
  });

  it("arrival from the map: «חזרה למפה» on both screens, and no «→ חזרה» beside it", () => {
    const block = arrive({ canGoBack: true, search: "?from=map" });
    const toMap = block.getByTestId("back-to-map");
    expect(toMap.getAttribute("href")).toBe("/map");
    expect(classesOf(toMap.closest("p")).some((c) => c === "hidden" || c === "lg:hidden")).toBe(false);
    expect(block.queryByTestId("history-back")).toBeNull();
  });

  it("the block itself carries no phone margin, so a direct arrival leaves no gap", () => {
    arrive({ canGoBack: false });
    const cls = classesOf(screen.getByTestId("producer-breadcrumb-block"));
    expect(cls.filter((c) => /^m[bty]?-/.test(c))).toEqual([]);
  });
});
