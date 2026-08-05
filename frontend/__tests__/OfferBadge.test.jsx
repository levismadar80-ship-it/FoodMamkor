/**
 * OfferBadge + OffersCard — MEH-1823 chunk 3.
 *
 * The load-bearing assertion here is the NEGATIVE one: a business without an
 * offer must render nothing at all. That is what makes "zero visual change for
 * businesses without an offer" a checked property rather than a promise.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import OfferBadge from "@/components/OfferBadge";
import { OffersCard } from "@/app/[locale]/producer/dashboard/edit/cards";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const O = he.producer.offer;

function renderIntl(ui) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const FUTURE = "2099-12-31";
const PAST = "2000-01-01";

const offer = (over = {}) => ({
  id: "o1",
  offer_type: "free_delivery_above",
  threshold_value: 10,
  threshold_unit: "liters",
  headline: null,
  starts_at: null,
  expires_at: FUTURE,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.put.mockResolvedValue({ data: {} });
});

describe("OfferBadge — the four types", () => {
  it.each([
    ["free_delivery_above", 10, "liters"],
    ["gift_above", 150, "ils"],
    ["first_order", 150, "ils"],
    ["pickup_discount", 100, "ils"],
  ])("renders %s with its threshold", (type, value, unit) => {
    renderIntl(
      <OfferBadge offer={offer({ offer_type: type, threshold_value: value, threshold_unit: unit })} />,
    );
    const expected = O.text_with[type]
      .replace("{amount}", `${value} ${O.units[unit]}`);
    // textContent, not a substring match: this is what proves the <bdi> wrapper
    // did not inject an invisible character into the rendered copy. The Unicode
    // isolates would pass a substring check and fail this one.
    expect(screen.getByTestId("offer-badge").textContent).toContain(expected);
  });

  // threshold_value is a positive integer, so 1 is reachable — and «1 יחידות»
  // is what a single non-plural string would render. The load-bearing assertion
  // is the NEGATIVE one: "1 יחידה" is a substring of "1 יחידות", so a
  // toContain("1 יחידה") check alone passes against the broken form too. That
  // is the weak-assertion shape the testing rules warn about, so it is spelled
  // out here rather than left for a reader to notice.
  it("a threshold of 1 renders the singular unit, never «1 יחידות»", () => {
    renderIntl(
      <OfferBadge offer={offer({ threshold_value: 1, threshold_unit: "units" })} />,
    );
    const text = screen.getByTestId("offer-badge").textContent;
    expect(text).not.toContain("1 יחידות");
    expect(text).toContain("1 יחידה");
  });

  // 2 is not redundant with 3: Hebrew has a DUAL, so `two` is its own CLDR
  // branch, and .claude/scripts/check-icu-parity.py exists because that branch
  // is the one translation passes silently drop. It caught this message with
  // one/other only. 3 exercises `other`.
  it.each([2, 3])("a threshold of %i keeps the plural unit", (value) => {
    renderIntl(
      <OfferBadge offer={offer({ threshold_value: value, threshold_unit: "units" })} />,
    );
    expect(screen.getByTestId("offer-badge").textContent).toContain(`${value} יחידות`);
  });

  it("renders the unconditional wording when no threshold is stated", () => {
    renderIntl(<OfferBadge offer={offer({ threshold_value: null, threshold_unit: null })} />);
    expect(screen.getByTestId("offer-badge")).toHaveTextContent(O.text.free_delivery_above);
    expect(screen.getByTestId("offer-badge").textContent).not.toContain("מעל");
  });
});

describe("OfferBadge — the states that must render NOTHING", () => {
  it("no offer → no DOM at all (zero visual change for a business without one)", () => {
    const { container } = renderIntl(<OfferBadge offer={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("expired offer → nothing, even though the server should never send one", () => {
    const { container } = renderIntl(<OfferBadge offer={offer({ expires_at: PAST })} />);
    expect(container).toBeEmptyDOMElement();
  });

  // The PAST case above passes under a UTC clock and an Israel clock alike, so
  // it cannot tell the two apart — "green for two reasons". This one can: it
  // pins the instant to the window where the two dates genuinely disagree.
  // 2026-08-02T21:30:00Z is 2026-08-03 00:30 in Israel (IDT, UTC+3), so the
  // UTC date is still "2026-08-02" while the Israel date is already the 3rd.
  // An offer whose last day was the 2nd is dead in Israel and must not render.
  // Against the previous `toISOString().slice(0, 10)` guard this test fails —
  // "2026-08-02" < "2026-08-02" is false, so the badge rendered.
  it("expiry is judged in Israel time, not UTC (offer dead at 00:30 Israel)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T21:30:00Z"));
    try {
      expect(new Date().toISOString().slice(0, 10)).toBe("2026-08-02"); // the trap
      const { container } = renderIntl(
        <OfferBadge offer={offer({ expires_at: "2026-08-02" })} />,
      );
      expect(container).toBeEmptyDOMElement();
    } finally {
      vi.useRealTimers();
    }
  });

  // The mirror: the same instant must NOT hide an offer that is still live in
  // Israel. Without this, "always return null" would satisfy the test above.
  it("an offer live on the Israel date still renders at that same instant", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T21:30:00Z"));
    try {
      const { container } = renderIntl(
        <OfferBadge offer={offer({ expires_at: "2026-08-03" })} />,
      );
      expect(container).not.toBeEmptyDOMElement();
    } finally {
      vi.useRealTimers();
    }
  });

  // The mirror of the expiry guard, on the other end of the window. Server-side
  // this was already fixed once (Producer.active_offer, models.py:395); the
  // client guard checked only expires_at while its comment claimed defence in
  // depth. Not reachable through the real API — the server filters both ends —
  // so the offer is passed directly, which is the point: this asserts the
  // CLIENT guard, not the server's.
  it("an offer whose starts_at is in the future renders nothing", () => {
    const { container } = renderIntl(
      <OfferBadge offer={offer({ starts_at: FUTURE, expires_at: FUTURE })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  // The control. Without it, "always return null when starts_at is set" would
  // satisfy the test above — the same trap as the singular/plural pair.
  it("an offer that already started still renders", () => {
    const { container } = renderIntl(
      <OfferBadge offer={offer({ starts_at: PAST, expires_at: FUTURE })} />,
    );
    expect(container).not.toBeEmptyDOMElement();
  });

  // FUTURE and PAST bracket the boundary without landing on it, so the pair
  // above cannot see an off-by-one: measured on this file, changing the guard
  // to `starts_at >= today` leaves it at 22/22 green. That mutation makes a
  // one-day offer invisible on its only day — the single day it exists to be
  // seen. This is the cell that catches it, and it is why `>` and `<` on the
  // two ends have to be read as a matched pair rather than two independent
  // choices.
  it("an offer starting today is live today (`>` and not `>=`)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T09:00:00Z"));
    try {
      const { container } = renderIntl(
        <OfferBadge offer={offer({ starts_at: "2026-08-02", expires_at: "2026-08-02" })} />,
      );
      expect(container).not.toBeEmptyDOMElement();
    } finally {
      vi.useRealTimers();
    }
  });

  // The Israel-clock mirror of the expiry pair above, on the start boundary.
  // 2026-08-02T21:30:00Z is already the 3rd in Israel, so an offer starting on
  // the 3rd is live now — a UTC-based comparison still reads "2026-08-02" and
  // would suppress it. This is what pins the start guard to israelToday()
  // rather than letting it acquire a second clock later.
  it("a start date is judged in Israel time, not UTC (offer opens at 00:30 Israel)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T21:30:00Z"));
    try {
      expect(new Date().toISOString().slice(0, 10)).toBe("2026-08-02"); // the trap
      const { container } = renderIntl(
        <OfferBadge offer={offer({ starts_at: "2026-08-03" })} />,
      );
      expect(container).not.toBeEmptyDOMElement();
    } finally {
      vi.useRealTimers();
    }
  });

  it("unknown offer_type → nothing, never a raw i18n key", () => {
    const { container } = renderIntl(<OfferBadge offer={offer({ offer_type: "mystery_type" })} />);
    expect(container).toBeEmptyDOMElement();
    expect(container.textContent).not.toContain("producer.offer");
  });
});

describe("OfferBadge — variants and the owner's own line", () => {
  it("chip variant is short and carries no headline", () => {
    renderIntl(<OfferBadge offer={offer({ headline: "אספקה עד הבית" })} variant="chip" />);
    expect(screen.getByTestId("offer-chip")).toBeInTheDocument();
    expect(screen.queryByTestId("offer-badge")).not.toBeInTheDocument();
    expect(screen.queryByTestId("offer-headline")).not.toBeInTheDocument();
  });

  it("badge variant shows the headline beneath the typed sentence", () => {
    renderIntl(<OfferBadge offer={offer({ headline: "אספקה עד הבית" })} />);
    expect(screen.getByTestId("offer-headline")).toHaveTextContent("אספקה עד הבית");
    // The typed sentence is still there — the headline supplements, never replaces.
    expect(screen.getByTestId("offer-badge").textContent).toContain("משלוח חינם");
  });
});

describe("OffersCard — the three write states", () => {
  const renderCard = (profile = {}) => {
    const onSave = vi.fn();
    renderIntl(<OffersCard profile={profile} onSave={onSave} />);
    return onSave;
  };

  it("empty card offers no fields until a type is chosen", () => {
    renderCard({});
    expect(screen.queryByTestId("offer-expires-input")).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId("offer-type-select"), {
      target: { value: "first_order" },
    });
    expect(screen.getByTestId("offer-expires-input")).toBeInTheDocument();
  });

  it("blocks save until an expiry is set, then sends the offer", async () => {
    renderCard({});
    fireEvent.change(screen.getByTestId("offer-type-select"), {
      target: { value: "gift_above" },
    });
    expect(screen.getByTestId("offer-save")).toBeDisabled();
    expect(screen.getByTestId("offer-expiry-error")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("offer-expires-input"), {
      target: { value: FUTURE },
    });
    fireEvent.click(screen.getByTestId("offer-save"));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me", {
        active_offer: {
          offer_type: "gift_above",
          threshold_value: null,
          threshold_unit: null,
          headline: null,
          expires_at: FUTURE,
        },
      }),
    );
  });

  it("blocks a half-stated threshold pair", () => {
    renderCard({});
    fireEvent.change(screen.getByTestId("offer-type-select"), {
      target: { value: "free_delivery_above" },
    });
    fireEvent.change(screen.getByTestId("offer-expires-input"), { target: { value: FUTURE } });
    fireEvent.change(screen.getByTestId("offer-threshold-input"), { target: { value: "10" } });
    // Value without a unit — the same rule the DB CHECK enforces.
    expect(screen.getByTestId("offer-pair-error")).toBeInTheDocument();
    expect(screen.getByTestId("offer-save")).toBeDisabled();

    fireEvent.change(screen.getByTestId("offer-unit-select"), { target: { value: "liters" } });
    expect(screen.queryByTestId("offer-pair-error")).not.toBeInTheDocument();
    expect(screen.getByTestId("offer-save")).not.toBeDisabled();
  });

  it("choosing 'no offer' on a business that has one sends an explicit null", async () => {
    renderCard({ active_offer: offer() });
    fireEvent.change(screen.getByTestId("offer-type-select"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("offer-save"));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me", { active_offer: null }),
    );
  });

  it("seeds from an existing offer and stays clean until edited", () => {
    renderCard({ active_offer: offer() });
    expect(screen.getByTestId("offer-type-select")).toHaveValue("free_delivery_above");
    expect(screen.getByTestId("offer-threshold-input")).toHaveValue(10);
    expect(screen.getByTestId("offer-unit-select")).toHaveValue("liters");
    // Not dirty → save disabled. Without this, a reopened card would offer to
    // re-save an unchanged offer and quietly rewrite the row.
    expect(screen.getByTestId("offer-save")).toBeDisabled();
  });
});

// ===========================================================================
// MEH-1898 — the fifth type, `custom`.
//
// `custom` inverts the relationship between the two strings OfferBadge can
// render. For the other four the platform sentence is primary and the owner's
// headline is a secondary line under it; for `custom` there is no platform
// sentence at all, so the headline IS the offer. Both halves of that inversion
// are asserted below, because either one alone passes on a broken component:
// showing the headline is only correct if it is ALSO not duplicated as the
// secondary line, and vice versa.
// ===========================================================================

const customOffer = (over = {}) =>
  offer({
    offer_type: "custom",
    threshold_value: null,
    threshold_unit: null,
    headline: "שני מגשי בורקס במחיר אחד בימי שישי",
    ...over,
  });

describe("OfferBadge — custom (MEH-1898)", () => {
  it("renders the headline as the offer text, in both variants", () => {
    const words = "שני מגשי בורקס במחיר אחד בימי שישי";
    const { unmount } = renderIntl(<OfferBadge offer={customOffer()} />);
    expect(screen.getByTestId("offer-badge")).toHaveTextContent(words);
    unmount();

    renderIntl(<OfferBadge offer={customOffer()} variant="chip" />);
    expect(screen.getByTestId("offer-chip")).toHaveTextContent(words);
  });

  it("shows the headline ONCE — not also as the secondary line", () => {
    // The duplication this guards against is invisible in a `toHaveTextContent`
    // assertion (the string is present either way) and looks like a styling
    // quirk on screen: the same sentence bold, then repeated muted under it.
    renderIntl(<OfferBadge offer={customOffer()} />);
    expect(screen.queryByTestId("offer-headline")).not.toBeInTheDocument();
    const shown = screen.getByTestId("offer-badge").textContent;
    expect(shown.split("שני מגשי בורקס").length - 1).toBe(1);
  });

  it("renders NOTHING when the headline is empty — no icon, no empty badge", () => {
    // The API accepts this row (uniform validation, tests/test_producer_offers
    // .py::test_custom_without_a_headline_is_accepted_by_the_api), so this is
    // a reachable state and not a can't-happen guard. A bare Gift icon with no
    // words next to it would assert a benefit the business never described.
    for (const empty of [null, "", "   "]) {
      const { container, unmount } = renderIntl(
        <OfferBadge offer={customOffer({ headline: empty })} />,
      );
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it("never renders a platform sentence for custom — there is no text.custom key", () => {
    // The negative that keeps the empty case honest. If someone adds
    // `producer.offer.text.custom` to the bundles, a headline-less custom
    // offer starts rendering copy the owner never wrote, and the test above
    // stops being able to tell. Assert the key's ABSENCE at its source.
    expect(O.text.custom).toBeUndefined();
    expect(O.text_with.custom).toBeUndefined();
    // …while the dropdown label, which is a different thing, does exist.
    expect(O.types.custom).toBe("הטבה בניסוח חופשי");
  });

  it("ignores a stored threshold — custom has no sentence to put it in", () => {
    // The backend permits a threshold on every type (Sapir, 02/08), so a row
    // switched to custom can still carry one. It must not leak into the text.
    renderIntl(
      <OfferBadge offer={customOffer({ threshold_value: 150, threshold_unit: "ils" })} />,
    );
    const shown = screen.getByTestId("offer-badge").textContent;
    expect(shown).toContain("שני מגשי בורקס");
    expect(shown).not.toContain("150");
  });

  it("still obeys the offer window", () => {
    const { container } = renderIntl(
      <OfferBadge offer={customOffer({ expires_at: PAST })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("OffersCard — custom (MEH-1898)", () => {
  const renderCard = (profile = {}) => {
    const onSave = vi.fn();
    renderIntl(<OffersCard profile={profile} onSave={onSave} />);
    return onSave;
  };

  const chooseCustom = () =>
    fireEvent.change(screen.getByTestId("offer-type-select"), {
      target: { value: "custom" },
    });

  it("the dropdown offers exactly five types plus the «no offer» option", () => {
    renderCard({});
    const options = [...screen.getByTestId("offer-type-select").options];
    expect(options).toHaveLength(6);
    expect(options[0]).toHaveTextContent(O.type_none);
    expect(options.map((option) => option.value)).toEqual([
      "",
      "free_delivery_above",
      "gift_above",
      "first_order",
      "pickup_discount",
      "custom",
    ]);
    expect(options[5]).toHaveTextContent("הטבה בניסוח חופשי");
  });

  it("hides the threshold fields when custom is chosen, and shows them otherwise", () => {
    renderCard({});
    fireEvent.change(screen.getByTestId("offer-type-select"), {
      target: { value: "gift_above" },
    });
    expect(screen.getByTestId("offer-threshold-input")).toBeInTheDocument();

    chooseCustom();
    expect(screen.queryByTestId("offer-threshold-input")).not.toBeInTheDocument();
    expect(screen.queryByTestId("offer-unit-select")).not.toBeInTheDocument();
    // Unmounted, not merely hidden — a disabled field still reads as one this
    // offer has. The headline field, by contrast, is very much still here.
    expect(screen.getByTestId("offer-headline-input")).toBeInTheDocument();
  });

  it("requires the headline: save stays blocked and the Hebrew error shows", () => {
    renderCard({});
    chooseCustom();
    fireEvent.change(screen.getByTestId("offer-expires-input"), {
      target: { value: FUTURE },
    });
    // Expiry is satisfied, so the ONLY thing blocking save is the headline —
    // which is what makes this discriminating rather than a restatement of the
    // existing expiry guard.
    expect(screen.queryByTestId("offer-expiry-error")).not.toBeInTheDocument();
    expect(screen.getByTestId("offer-save")).toBeDisabled();
    expect(screen.getByTestId("offer-headline-error")).toHaveTextContent(
      "להטבה בניסוח חופשי חייבת להיות כותרת",
    );

    fireEvent.change(screen.getByTestId("offer-headline-input"), {
      target: { value: "   " },
    });
    expect(screen.getByTestId("offer-save")).toBeDisabled();

    fireEvent.change(screen.getByTestId("offer-headline-input"), {
      target: { value: "שני מגשים במחיר אחד" },
    });
    expect(screen.queryByTestId("offer-headline-error")).not.toBeInTheDocument();
    expect(screen.getByTestId("offer-save")).not.toBeDisabled();
  });

  it("sends a null threshold pair even if one was typed under a previous type", async () => {
    renderCard({});
    fireEvent.change(screen.getByTestId("offer-type-select"), {
      target: { value: "gift_above" },
    });
    fireEvent.change(screen.getByTestId("offer-threshold-input"), {
      target: { value: "150" },
    });
    fireEvent.change(screen.getByTestId("offer-unit-select"), {
      target: { value: "ils" },
    });
    chooseCustom();
    fireEvent.change(screen.getByTestId("offer-headline-input"), {
      target: { value: "שני מגשים במחיר אחד" },
    });
    fireEvent.change(screen.getByTestId("offer-expires-input"), {
      target: { value: FUTURE },
    });
    fireEvent.click(screen.getByTestId("offer-save"));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me", {
        active_offer: {
          offer_type: "custom",
          threshold_value: null,
          threshold_unit: null,
          headline: "שני מגשים במחיר אחד",
          expires_at: FUTURE,
        },
      }),
    );
  });

  it("seeds from an existing custom offer without tripping its own guard", () => {
    // A saved custom offer must not open showing the required-headline error.
    renderCard({
      active_offer: {
        offer_type: "custom",
        threshold_value: null,
        threshold_unit: null,
        headline: "שני מגשים במחיר אחד",
        expires_at: FUTURE,
      },
    });
    expect(screen.queryByTestId("offer-headline-error")).not.toBeInTheDocument();
    expect(screen.getByTestId("offer-save")).toBeDisabled(); // clean, not blocked
    expect(screen.queryByTestId("offer-threshold-input")).not.toBeInTheDocument();
  });
});
