import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * MEH-3585 (Sapir 21/11, «עיצוב אחיד»): the group-buy card and the surprise-bag
 * card on the business page are ONE component, ui/OfferCard. The bag card used
 * to be a hand-written copy and drifted (twice the width, «נשארו 4» with no
 * noun). This renders both real callers and checks they come out of the same
 * shell, with the same price, saving and band elements — if either goes back
 * to its own markup, the shared classes or test ids below go missing.
 */
vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  useFormatter: () => ({ dateTime: () => "" }),
  useLocale: () => "he",
}));
vi.mock("@/lib/auth-context", () => ({ useOptionalAuth: () => null, useAuth: () => ({ user: null }) }));
vi.mock("@/components/SaveButton", () => ({ default: () => null }));
// Record every card the real OfferCard draws, so a hand-copied card with the
// same classes still fails: its test id never reaches this list.
const drawn = [];
vi.mock("@/components/ui/OfferCard", async (orig) => {
  const Real = (await orig()).default;
  return { default: (props) => { drawn.push(props.testId); return <Real {...props} />; } };
});
const get = vi.fn();
vi.mock("@/lib/api", () => ({ default: { get: (...a) => get(...a) } }));
vi.mock("@/lib/rescue", async (orig) => ({
  ...(await orig()),
  rescueBagsEnabled: () => true,
  fetchOffers: vi.fn(async () => [{
    id: "o1", qty_left: 2, qty_total: 3, price_agorot: 2500, value_min_agorot: 5000,
    pickup_start: new Date(Date.now() + 3600e3).toISOString(),
    pickup_end: new Date(Date.now() + 7200e3).toISOString(),
    producer: { id: "p-1" }, typical_items: ["לחם"],
  }]),
  fetchMyOrders: vi.fn(async () => []),
}));

import ProducerActivities from "@/app/[locale]/producer/[id]/components/ProducerActivities";
import RescueSection from "@/components/rescue/RescueSection";

const GB = {
  id: "gb1", title: "מארז", product_name: "דבש", status: "open", commits_count: 1,
  min_participants: 3, deadline: "2099-01-01T00:00:00Z",
  price_per_unit_regular: "50", price_per_unit_group: "40",
};

/** The OfferCard shell, read off a rendered card. */
function shape(card) {
  const band = card.querySelector(".bg-background-alt");
  return {
    // The link variant adds exactly these three hover/focus classes.
    shell: card.className.replace(/ hover:border-primary transition focus-ring$/, ""),
    price: card.querySelector(".text-2xl")?.className,
    struck: card.querySelector("s")?.className,
    saving: card.querySelector(".text-gold-deep")?.className,
    band: band?.className,
    seeds: Boolean(band?.querySelector("[data-testid='gb-progress-seeds']")),
    h3: card.querySelector("h3")?.className,
    // Neither card draws a generic icon tile (Sapir 21/11, MEH-2659).
    noIconTile: !card.querySelector("span.w-11.h-11"),
    // MEH-3586 follow-up (Sapir 22/11): both cards are the way in to their
    // own page. The whole card is one link with the forward caret, and
    // nothing inside it is a control of its own (a reserve button was).
    link: card.tagName === "A" && Boolean(card.getAttribute("href")),
    caret: Boolean(card.querySelector("svg.ltr\\:rotate-180")),
    noInnerControl: card.querySelectorAll("button, a, details, input").length === 0,
  };
}

describe("OfferCard is the one owner of the offer card (MEH-3585)", () => {
  it("the group-buy card and the bag card render the same shell, price, saving and band", async () => {
    get.mockResolvedValue({ data: [GB] });
    render(
      <>
        <ProducerActivities producerId="p-1" />
        <RescueSection producer={{ id: "p-1" }} />
      </>,
    );
    const gb = shape(await screen.findByTestId("producer-group-buy-row"));
    const bag = shape(await screen.findByTestId("rescue-section-card"));
    for (const k of Object.keys(gb)) expect(gb[k], k).toBeTruthy();
    expect(bag).toEqual(gb);
    expect(drawn).toContain("producer-group-buy-row");
    expect(drawn).toContain("rescue-section-card");
  });

  it("both sit in the same half-width grid", async () => {
    get.mockResolvedValue({ data: [GB] });
    render(
      <>
        <ProducerActivities producerId="p-1" />
        <RescueSection producer={{ id: "p-1" }} />
      </>,
    );
    const gbGrid = (await screen.findByTestId("producer-group-buy-row")).parentElement.className;
    const bagGrid = (await screen.findByTestId("rescue-section-card")).parentElement.className;
    expect(gbGrid).toContain("sm:grid-cols-2");
    expect(bagGrid).toContain("sm:grid-cols-2");
  });
});
