import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

// MEH-3819 follow-up: the client route shows the loading line until its
// activity lists answer, so the inline contact card mounts one render AFTER
// `producer` is set. useStickyBar's observer used to key on the producer id
// alone: it ran against the loading line, found no card, and never ran again,
// so the phone's sticky contact bar stayed parked (red in WebKit core,
// producer-detail.spec.ts:482, on PR #5294). The real hook runs here.

const state = { producer: null, activitiesReady: true };

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
    similarProducers: [],
    nearbyProducers: [],
  }),
}));
// MEH-3819: the activity lists are their own hook; answered and empty here.
vi.mock("@/app/[locale]/producer/[id]/hooks/useProducerActivities", () => ({
  useProducerActivities: () => ({ events: [], experiences: [], groupBuys: [], ready: state.activitiesReady }),
}));

import ProducerDetail from "@/app/[locale]/producer/[id]/ProducerDetail";

let observed;
beforeEach(() => {
  observed = [];
  window.IntersectionObserver = class {
    observe(el) { observed.push(el); }
    disconnect() {}
    unobserve() {}
  };
});
afterEach(() => {
  cleanup();
  state.activitiesReady = true;
});

const producer = { id: "p1", name: "מאפיית הגבעה", images: [], categories: [] };

describe("the sticky bar observes the inline contact card once the page paints (MEH-3819)", () => {
  it("client route: lists answer after the producer → the card is still observed", () => {
    state.producer = producer;
    state.activitiesReady = false;
    const { rerender, container } = render(<ProducerDetail />);
    expect(observed).toEqual([]);
    state.activitiesReady = true;
    rerender(<ProducerDetail />);
    const card = container.querySelector("#section-contact");
    expect(card).not.toBeNull();
    expect(observed).toContain(card);
  });

  it("server-rendered page: the card is observed on the first paint", () => {
    state.producer = producer;
    state.activitiesReady = false;
    const { container } = render(<ProducerDetail initialProducer={producer} />);
    expect(observed).toContain(container.querySelector("#section-contact"));
  });
});
