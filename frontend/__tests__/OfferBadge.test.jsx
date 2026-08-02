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
