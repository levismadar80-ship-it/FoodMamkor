import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

/**
 * MEH-2045 — ProductSheet prev/next paging.
 *
 * LOCATION: `frontend/__tests__/`, not `frontend/components/public/__tests__/`.
 * vitest.config.js `include` is rooted at frontend/ and matches
 * `__tests__/**\/*.test.{js,jsx,ts,tsx}` only, so a spec nested under
 * components/ is never collected and reports a silent green by never running
 * (.claude/rules/testing.md — "a green that has two possible causes"). Same
 * call, same reason, as the note at the top of ProductSheet.test.jsx.
 *
 * SCOPE: paging only. The MEH-1901/1916 contract (open/close, diet chips,
 * price, CTA routing, image) is asserted in ProductSheet.test.jsx and is not
 * restated here — except where paging could break it, which is why the
 * re-derivation and Escape specs below exist.
 */

// The locale drives BOTH the arrow-key mapping and which caret glyph lands on
// which side, and `/en` is genuinely LTR (layout.js:201). Mutable so the same
// component can be exercised in both worlds without a second mock module.
const intl = vi.hoisted(() => ({ locale: "he" }));

vi.mock("next-intl", () => ({
  useLocale: () => intl.locale,
  useTranslations: (ns) => (key, vars) => {
    const full = ns ? `${ns}.${key}` : key;
    if (full === "whatsapp.question_chips.source_line") return "הגעתי דרך מהמקור";
    if (full === "producer.detail.sections.products.sheet_wa_prefill") {
      return `היי, ראיתי את ״${vars?.name ?? ""}״ בעמוד שלכם במהמקור ואשמח לשמוע פרטים`;
    }
    if (full === "producer.detail.sections.products.sheet_prev_aria") return "המוצר הקודם";
    if (full === "producer.detail.sections.products.sheet_next_aria") return "המוצר הבא";
    if (full === "producer.detail.sections.products.sheet_counter_aria") {
      return `מוצר ${vars?.current} מתוך ${vars?.total}`;
    }
    if (full === "producer.detail.sections.products.sheet_close_aria") return "סגירת פרטי המוצר";
    if (full === "producer.card.aria.image_missing") return `${vars?.name ?? ""} — תמונה חסרה`;
    return full;
  },
}));

vi.mock("next/image", () => ({
  default: (props) => <img data-testid="sheet-image" src={props.src} alt={props.alt} />,
}));

// The two carets carry a testid EACH — several specs below ask which glyph
// landed on which side, and a shared stub would erase the answer.
vi.mock("@phosphor-icons/react", () => ({
  WhatsappLogo: () => <span data-testid="wa-logo" />,
  X: () => <span data-testid="x-icon" />,
  Phone: () => <span data-testid="icon-phone" />,
  Globe: () => <span data-testid="icon-globe" />,
  EnvelopeSimple: () => <span data-testid="icon-email" />,
  InstagramLogo: () => <span data-testid="icon-instagram" />,
  FacebookLogo: () => <span data-testid="icon-facebook" />,
  Receipt: () => <span data-testid="icon-receipt" />,
  CaretLeft: () => <span data-testid="caret-left" />,
  CaretRight: () => <span data-testid="caret-right" />,
}));

vi.mock("@/lib/contact-tracking", () => ({
  pingWhatsAppBeacon: vi.fn(),
  markWhatsAppClickedLocal: vi.fn(),
}));

import ProductSheet from "@/components/public/ProductSheet";

const producer = { id: 7, name: "טבע פור", phone: "0501234567" };
const products = [
  { id: 11, name: "גרנולה ביתית" },
  { id: 12, name: "מארז לחמים" },
  { id: 13, name: "ריבת תאנים" },
];

/** Renders the sheet at `index` of the 3-product list with paging wired. */
function renderAt(index, overrides = {}) {
  const onPrev = vi.fn();
  const onNext = vi.fn();
  const onClose = vi.fn();
  const props = {
    product: products[index],
    producer,
    index,
    total: products.length,
    onPrev,
    onNext,
    onClose,
    ...overrides,
  };
  const utils = render(<ProductSheet {...props} />);
  return { ...utils, onPrev, onNext, onClose, props };
}

beforeEach(() => {
  intl.locale = "he";
});

afterEach(() => {
  document.body.style.overflow = "";
});

describe("MEH-2045 — the controls appear only when there is somewhere to page to", () => {
  it("3 products → both chevrons and the counter render", () => {
    renderAt(1);
    expect(screen.getByTestId("product-sheet-prev")).toBeInTheDocument();
    expect(screen.getByTestId("product-sheet-next")).toBeInTheDocument();
    expect(screen.getByTestId("product-sheet-counter")).toBeInTheDocument();
  });

  it("total === 1 → NO arrows and NO counter (renders exactly as MEH-1901 did)", () => {
    render(
      <ProductSheet
        product={products[0]}
        producer={producer}
        index={0}
        total={1}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("product-sheet-prev")).not.toBeInTheDocument();
    expect(screen.queryByTestId("product-sheet-next")).not.toBeInTheDocument();
    expect(screen.queryByTestId("product-sheet-counter")).not.toBeInTheDocument();
  });

  it("a caller that passes no paging props at all gets the pre-MEH-2045 sheet", () => {
    // The defaults are the compatibility contract: `index = 0, total = 1`.
    render(<ProductSheet product={products[0]} producer={producer} onClose={vi.fn()} />);
    expect(screen.queryByTestId("product-sheet-prev")).not.toBeInTheDocument();
    expect(screen.queryByTestId("product-sheet-counter")).not.toBeInTheDocument();
    // …and the sheet itself is still there — this is not an "everything
    // vanished" green.
    expect(screen.getByTestId("product-sheet")).toBeInTheDocument();
  });

  it("total > 1 but no handlers → no chevrons, rather than two dead controls", () => {
    render(
      <ProductSheet
        product={products[0]}
        producer={producer}
        index={0}
        total={3}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("product-sheet-prev")).not.toBeInTheDocument();
    expect(screen.queryByTestId("product-sheet-next")).not.toBeInTheDocument();
  });
});

describe("MEH-2045 — counter", () => {
  it('reads "{current} / {total}" with the digits bidi-isolated (MEH-1933)', () => {
    renderAt(1);
    const counter = screen.getByTestId("product-sheet-counter");
    const span = counter.querySelector("span[dir='ltr']");
    // The pair is the fix: tabular-nums alone does NOT stop UBA rule N1 from
    // reversing "2 / 3" inside an RTL paragraph.
    expect(span).not.toBeNull();
    expect(span.textContent.replace(/\s+/g, " ").trim()).toBe("2 / 3");
  });

  it("is a polite live region whose accessible name is the Hebrew sentence", () => {
    renderAt(2);
    const counter = screen.getByTestId("product-sheet-counter");
    expect(counter).toHaveAttribute("aria-live", "polite");
    expect(counter).toHaveAttribute("aria-label", "מוצר 3 מתוך 3");
  });
});

describe("MEH-2045 — the list does not loop", () => {
  it("first product: prev is aria-disabled + dimmed and clicking it does nothing", () => {
    const { onPrev, onNext } = renderAt(0);
    const prev = screen.getByTestId("product-sheet-prev");
    expect(prev).toHaveAttribute("aria-disabled", "true");
    expect(prev.className).toContain("opacity-40");
    fireEvent.click(prev);
    expect(onPrev).not.toHaveBeenCalled();

    // …while next is live. Asserting the live half in the same spec is what
    // stops "nothing is clickable" from passing as "the ends are guarded".
    const next = screen.getByTestId("product-sheet-next");
    expect(next).toHaveAttribute("aria-disabled", "false");
    expect(next.className).not.toContain("opacity-40");
    fireEvent.click(next);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("last product: next is aria-disabled + dimmed and clicking it does nothing", () => {
    const { onPrev, onNext } = renderAt(2);
    const next = screen.getByTestId("product-sheet-next");
    expect(next).toHaveAttribute("aria-disabled", "true");
    expect(next.className).toContain("opacity-40");
    fireEvent.click(next);
    expect(onNext).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("product-sheet-prev"));
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it("middle product: both live, each fires its own handler exactly once", () => {
    const { onPrev, onNext } = renderAt(1);
    fireEvent.click(screen.getByTestId("product-sheet-prev"));
    fireEvent.click(screen.getByTestId("product-sheet-next"));
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("both chevrons keep the 44px tap target and stay in the tab order when dimmed", () => {
    renderAt(0);
    const prev = screen.getByTestId("product-sheet-prev");
    // `disabled` would drop it out of the Tab cycle and change the focus
    // trap's first/last pair as the reader pages — aria-disabled does not.
    expect(prev).not.toBeDisabled();
    for (const el of [prev, screen.getByTestId("product-sheet-next")]) {
      expect(el.className).toContain("h-11");
      expect(el.className).toContain("w-11");
    }
  });
});

describe("MEH-2045 — keyboard, mapped to the writing direction", () => {
  it("RTL: ArrowLeft advances, ArrowRight goes back", () => {
    const { onPrev, onNext } = renderAt(1);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrev).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("LTR (/en): the mapping mirrors — ArrowRight advances, ArrowLeft goes back", () => {
    intl.locale = "en";
    const { onPrev, onNext } = renderAt(1);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrev).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it("the ends are dead for the keyboard too, in both directions", () => {
    const first = renderAt(0);
    fireEvent.keyDown(window, { key: "ArrowRight" }); // = previous in RTL
    expect(first.onPrev).not.toHaveBeenCalled();
    first.unmount();

    const last = renderAt(2);
    fireEvent.keyDown(window, { key: "ArrowLeft" }); // = next in RTL
    expect(last.onNext).not.toHaveBeenCalled();
  });

  it("a single-product sheet does not answer the arrow keys at all", () => {
    const onNext = vi.fn();
    render(
      <ProductSheet
        product={products[0]}
        producer={producer}
        index={0}
        total={1}
        onPrev={vi.fn()}
        onNext={onNext}
        onClose={vi.fn()}
      />,
    );
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(onNext).not.toHaveBeenCalled();
  });

  it("Escape still closes while paging is wired (MEH-1901 contract intact)", () => {
    const { onClose, onNext, onPrev } = renderAt(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onNext).not.toHaveBeenCalled();
    expect(onPrev).not.toHaveBeenCalled();
  });
});

describe("MEH-2045 — the glyph follows the direction, the position follows the logical axis", () => {
  it("RTL: previous shows CaretRight (visual right), next shows CaretLeft", () => {
    renderAt(1);
    expect(
      screen.getByTestId("product-sheet-prev").querySelector("[data-testid='caret-right']"),
    ).not.toBeNull();
    expect(
      screen.getByTestId("product-sheet-next").querySelector("[data-testid='caret-left']"),
    ).not.toBeNull();
  });

  it("LTR: the glyphs swap", () => {
    intl.locale = "en";
    renderAt(1);
    expect(
      screen.getByTestId("product-sheet-prev").querySelector("[data-testid='caret-left']"),
    ).not.toBeNull();
    expect(
      screen.getByTestId("product-sheet-next").querySelector("[data-testid='caret-right']"),
    ).not.toBeNull();
  });

  it("positions are logical (start-/end-), so a bidi sweep cannot invert /en", () => {
    renderAt(1);
    const prev = screen.getByTestId("product-sheet-prev");
    const next = screen.getByTestId("product-sheet-next");
    expect(prev.className).toContain("start-2");
    expect(next.className).toContain("end-2");
    // The physical forms are what would break the LTR locale — assert their
    // ABSENCE too, or a stray physical class added alongside the logical one
    // would still pass.
    for (const el of [prev, next]) {
      expect(el.className).not.toMatch(/\b(left|right)-\d/);
    }
  });
});

describe("MEH-2045 — the no-photo band collision, and the animation that hid it", () => {
  // Both of these were found by MEASURING the rendered page at 375 and 1440,
  // not by reading the JSX. They are asserted here because the QA harness that
  // caught them is not a CI gate, and a later refactor would put them back.
  it("with a photo the chevrons are vertically centred on the square", () => {
    renderAt(1, { product: { ...products[1], image_url: "https://res.cloudinary.com/demo/image/upload/x.jpg" } });
    for (const id of ["product-sheet-prev", "product-sheet-next"]) {
      const el = screen.getByTestId(id);
      expect(el.className).toContain("top-1/2");
      expect(el.className).toContain("-translate-y-1/2");
    }
  });

  it("on the no-photo h-28 band they drop to the bottom, clear of the close button", () => {
    // Measured before this fork existed: the close button occupies y 12–56 of
    // the same box at the same inline edge, and a 44px control centred in
    // 112px spans 34–78 — a 22px overlap, at BOTH viewports. Bottom-anchored
    // it spans 66–110 and clears by 10px.
    renderAt(1, { product: { ...products[1], image_url: null } });
    for (const id of ["product-sheet-prev", "product-sheet-next"]) {
      const el = screen.getByTestId(id);
      expect(el.className).toContain("bottom-2");
      expect(el.className).not.toContain("-translate-y-1/2");
    }
  });

  it("overlay controls transition COLOURS only — a bare `transition` animates the slide", () => {
    // Tailwind's `transition` covers `transform`, so with it the fork above
    // becomes a 22px vertical slide on every crossing into a no-photo product.
    // The close button carried the bare form and now shares this string.
    renderAt(1);
    for (const id of ["product-sheet-prev", "product-sheet-next", "product-sheet-close"]) {
      const cls = screen.getByTestId(id).className;
      expect(cls).toContain("transition-colors");
      expect(cls).not.toMatch(/(^|\s)transition(\s|$)/);
    }
  });

  it("the close button kept its position and its 44px target through that refactor", () => {
    renderAt(1);
    const close = screen.getByTestId("product-sheet-close");
    expect(close.className).toContain("top-3");
    expect(close.className).toContain("end-3");
    expect(close.className).toContain("h-11");
    expect(close.className).toContain("w-11");
  });
});

describe("MEH-2045 — changing product re-derives the sheet", () => {
  it("resets the scroll container to the top", () => {
    const { rerender, props } = renderAt(0);
    const scroller = screen.getByTestId("product-sheet-scroll");

    // jsdom has no layout, so a plain `scroller.scrollTop = 500` is not a
    // reliable round-trip. Trap the write instead: `written` stays null unless
    // the component actually assigns to it.
    let written = null;
    Object.defineProperty(scroller, "scrollTop", {
      configurable: true,
      get: () => written ?? 500,
      set: (v) => {
        written = v;
      },
    });
    expect(written).toBeNull();

    rerender(<ProductSheet {...props} product={products[1]} index={1} />);
    expect(written).toBe(0);
  });

  it("title, description and the WhatsApp prefill all follow the new product", () => {
    const { rerender, props } = renderAt(0, {
      product: { ...products[0], description: "גרנולה של הבית" },
    });
    expect(screen.getByTestId("product-sheet")).toHaveAttribute("aria-label", "גרנולה ביתית");
    expect(screen.getByTestId("product-sheet-description")).toHaveTextContent("גרנולה של הבית");
    expect(screen.getByTestId("product-sheet-wa-cta").getAttribute("href")).toContain(
      encodeURIComponent("גרנולה ביתית"),
    );

    rerender(
      <ProductSheet
        {...props}
        product={{ ...products[1], description: "לחם מחמצת" }}
        index={1}
      />,
    );
    expect(screen.getByTestId("product-sheet")).toHaveAttribute("aria-label", "מארז לחמים");
    expect(screen.getByTestId("product-sheet-description")).toHaveTextContent("לחם מחמצת");
    const href = screen.getByTestId("product-sheet-wa-cta").getAttribute("href");
    expect(href).toContain(encodeURIComponent("מארז לחמים"));
    // The stale name is GONE, not merely joined by the new one — this is the
    // half that would catch a memoised prefill.
    expect(href).not.toContain(encodeURIComponent("גרנולה ביתית"));
  });

  it("the counter follows the index", () => {
    const { rerender, props } = renderAt(0);
    expect(screen.getByTestId("product-sheet-counter")).toHaveAttribute(
      "aria-label",
      "מוצר 1 מתוך 3",
    );
    rerender(<ProductSheet {...props} product={products[2]} index={2} />);
    expect(screen.getByTestId("product-sheet-counter")).toHaveAttribute(
      "aria-label",
      "מוצר 3 מתוך 3",
    );
  });

  it("a no-photo product mid-list keeps the MEH-1901 h-28 band and still pages", () => {
    const { onNext } = renderAt(1, { product: { ...products[1], image_url: null } });
    // The fork is unchanged: no next/image, the short band instead of a square.
    expect(screen.queryByTestId("sheet-image")).not.toBeInTheDocument();
    const band = screen.getByTestId("product-sheet-prev").parentElement;
    expect(band.className).toContain("h-28");
    expect(band.className).not.toContain("aspect-square");
    // …and the controls still work while sitting on it.
    fireEvent.click(screen.getByTestId("product-sheet-next"));
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
