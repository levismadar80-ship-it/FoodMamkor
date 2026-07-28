import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { ShoppingCart, Lock } from "@phosphor-icons/react";
import EmptyState from "@/components/ui/EmptyState";

// MEH-1630 chunk 1 — EmptyState gains `circle` and `gated`. Additive only:
// zero call sites change in this chunk, so every one of the 20+ existing
// surfaces must render EXACTLY as it does today.
//
// The snapshots in the first block are the hard gate. They were generated
// against the component BEFORE the variants were added and committed in that
// state; the variants were then written and the same snapshots had to pass
// untouched. That ordering is what makes them evidence — a snapshot written
// after the change would only record the new behaviour and call it correct.
//
// If a future edit needs `-u` on the DEFAULT-RENDER block, that is a
// breaking change to 20+ surfaces, not a stale snapshot.

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));

describe("EmptyState — default render is unchanged by chunk 1 (hard gate)", () => {
  it("icon + title + description + CTA button", () => {
    const { container } = render(
      <EmptyState
        icon={ShoppingCart}
        title="עדיין אין קבוצות רכש"
        description="קבוצות רכש = מחיר סיטונאי ללקוחות שלך."
        ctaLabel="צרו קבוצה ראשונה"
        ctaOnClick={() => {}}
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it("icon + title + description + CTA link + secondary link", () => {
    const { container } = render(
      <EmptyState
        icon={ShoppingCart}
        title="עדיין אין מועדפים"
        description="לב על עסק שאהבתם."
        ctaLabel="גלו עסקים"
        ctaHref="/producers"
        secondaryLabel="למפה"
        secondaryHref="/map"
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it("legacy emoji prop (not yet migrated consumers)", () => {
    const { container } = render(
      <EmptyState emoji="🌱" title="אין תוצאות" description="נסו שוב." />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  // MEH-1172 guard: ProductsSection renders WITHOUT an icon on purpose — the
  // sample card is the visual. Consolidation must not make `icon` required.
  it("no icon at all, with the MEH-1097 F15 example card", () => {
    const { container } = render(
      <EmptyState
        title="עדיין אין מוצרים"
        description="הוסיפו את המוצר הראשון."
        example={<div data-testid="sample-card">דוגמה</div>}
        ctaLabel="הוספת מוצר"
        ctaOnClick={() => {}}
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it("title only — no description, no cta, no icon", () => {
    const { container } = render(<EmptyState title="ריק" />);
    expect(container.innerHTML).toMatchSnapshot();
  });

  // The CTA contract: a label without a handler renders NO button. This is
  // what MEH-1709 leans on for the gated group-buys state, so it has to
  // survive chunk 1 untouched.
  it("ctaLabel without ctaHref/ctaOnClick renders no button", () => {
    const { container } = render(
      <EmptyState icon={ShoppingCart} title="נעול" description="ממתין לאישור." ctaLabel="צרו" />,
    );
    expect(container.querySelectorAll("button, a")).toHaveLength(0);
    expect(container.innerHTML).toMatchSnapshot();
  });
});

describe("EmptyState — `circle` variant (MEH-1630 decision 2)", () => {
  it("wraps the icon in the green disc the 9 inline blocks hand-rolled", () => {
    const { container } = render(
      <EmptyState circle icon={ShoppingCart} title="עדיין אין קבוצות רכש" />,
    );
    const disc = container.querySelector(".rounded-full");
    expect(disc).toBeTruthy();
    expect(disc.className).toContain("bg-green-50");
    // The icon lives inside the disc, not beside it.
    expect(disc.querySelector("svg")).toBeTruthy();
    expect(disc.getAttribute("aria-hidden")).toBe("true");
  });

  it("is inert without an icon — no empty disc", () => {
    const { container } = render(<EmptyState circle title="ריק" />);
    expect(container.querySelector(".rounded-full")).toBeNull();
  });

  it("does not affect the default render when omitted", () => {
    const { container } = render(<EmptyState icon={ShoppingCart} title="ריק" />);
    expect(container.querySelector(".rounded-full")).toBeNull();
  });
});

describe("EmptyState — `size` variant (MEH-1630 decision 1)", () => {
  // Chunk 2 migrates each inline block at the geometry it already has, so the
  // disc/icon pairing per size value is the contract that makes that possible.
  // Normalization is chunk 3 and is blocked by MEH-1727.
  const CASES = [
    { size: "sm", disc: "w-16", icon: "28" },
    { size: "md", disc: "w-20", icon: "32" },
    { size: "lg", disc: "w-24", icon: "40" },
  ];

  for (const { size, disc, icon } of CASES) {
    it(`size="${size}" renders a ${disc} disc with a ${icon}px icon`, () => {
      const { container } = render(
        <EmptyState circle size={size} icon={ShoppingCart} title="ריק" />,
      );
      const el = container.querySelector(".rounded-full");
      expect(el.className).toContain(`${disc} `);
      expect(el.className).toContain("bg-green-50");
      // Phosphor maps `size` onto the svg's width/height attributes.
      expect(el.querySelector("svg").getAttribute("width")).toBe(icon);
    });
  }

  it("defaults to sm", () => {
    const { container } = render(<EmptyState circle icon={ShoppingCart} title="ריק" />);
    const el = container.querySelector(".rounded-full");
    expect(el.className).toContain("w-16 ");
    expect(el.querySelector("svg").getAttribute("width")).toBe("28");
  });

  // Adversarial review finding. "enormous" alone does NOT discriminate: it is
  // absent from the prototype chain too, so a broken `CIRCLE_SIZES[size] || …`
  // lookup passes it. The keys that expose the difference are the inherited
  // ones — `CIRCLE_SIZES["constructor"]` is truthy, so `||` never fires and the
  // disc renders `className="undefined …"` with an undefined icon size.
  for (const bad of ["enormous", "constructor", "toString", "valueOf", "__proto__"]) {
    it(`falls back to sm on size="${bad}" rather than rendering undefined`, () => {
      const { container } = render(
        <EmptyState circle size={bad} icon={ShoppingCart} title="ריק" />,
      );
      const el = container.querySelector(".rounded-full");
      expect(el.className).toContain("w-16 ");
      expect(el.className).not.toContain("undefined");
      expect(el.querySelector("svg").getAttribute("width")).toBe("28");
    });
  }

  it("is inert without `circle` — size alone changes nothing", () => {
    const { container } = render(
      <EmptyState size="lg" icon={ShoppingCart} title="ריק" />,
    );
    expect(container.querySelector(".rounded-full")).toBeNull();
    // Still the bare 56px icon every existing call site renders.
    expect(container.querySelector("svg").getAttribute("width")).toBe("56");
  });
});

describe("EmptyState — `gated` variant (MEH-1630 decision 4)", () => {
  // NN/g: a blocked action gets no control at all — not a disabled one.
  it("renders zero buttons even when a full CTA is passed", () => {
    const { container } = render(
      <EmptyState
        gated
        icon={Lock}
        title="פתיחת קבוצת רכש נעולה"
        description="תתאפשר לאחר אישור העסק."
        ctaLabel="צרו קבוצה"
        ctaOnClick={() => {}}
      />,
    );
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it("suppresses a CTA passed as an href too", () => {
    const { container } = render(
      <EmptyState gated icon={Lock} title="נעול" ctaLabel="צרו" ctaHref="/new" />,
    );
    expect(container.querySelector('a[href="/new"]')).toBeNull();
  });

  it("still surfaces the way out, as a text link and not a button", () => {
    const { container } = render(
      <EmptyState
        gated
        icon={Lock}
        title="נעול"
        description="תתאפשר לאחר אישור העסק."
        unblockLabel="מה נדרש לאישור"
        unblockHref="/producer/dashboard"
      />,
    );
    const link = container.querySelector('a[href="/producer/dashboard"]');
    expect(link).toBeTruthy();
    expect(link.textContent).toBe("מה נדרש לאישור");
    expect(container.querySelectorAll("button")).toHaveLength(0);
    // Not the bordered pill the ungated secondary uses.
    expect(link.className).not.toContain("rounded-full");
  });

  // Adversarial review finding. In a gated state this link is the ONLY control
  // on screen and it is the smallest — a bare text link is ~20px tall against
  // the repo's ≥44px floor (docs/DESIGN.md "Tap-target floor (reach)", WCAG
  // 2.5.5, IS 5568). Same shape, same fix as WhatsThis.jsx:29. jsdom computes
  // no geometry, so the assertion is on the class that creates the hit area.
  it("meets the 44px tap-target floor", () => {
    const { container } = render(
      <EmptyState
        gated
        icon={Lock}
        title="נעול"
        unblockLabel="מה נדרש לאישור"
        unblockHref="/producer/dashboard"
      />,
    );
    const link = container.querySelector('a[href="/producer/dashboard"]');
    expect(link.className).toContain("min-h-[44px]");
    // min-h alone does nothing on an inline element — the box has to be
    // inline-flex for the height to apply. Both cues are asserted separately
    // so a failure names which one went missing.
    expect(link.className).toContain("inline-flex");
  });

  // Decision 3: secondaryLabel/secondaryHref keep their meaning for the
  // NON-gated case ONLY. Without this, the rename would be cosmetic — the old
  // pair would still render the way-out link and both spellings would work.
  it("ignores secondaryLabel/secondaryHref when gated", () => {
    const { container } = render(
      <EmptyState
        gated
        icon={Lock}
        title="נעול"
        secondaryLabel="למפה"
        secondaryHref="/map"
      />,
    );
    expect(container.querySelector('a[href="/map"]')).toBeNull();
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });

  it("keeps the description — it is what carries the reason", () => {
    const { getByText } = render(
      <EmptyState gated icon={Lock} title="נעול" description="ממתין לאישור העסק." />,
    );
    expect(getByText("ממתין לאישור העסק.")).toBeTruthy();
  });

  it("composes with circle", () => {
    const { container } = render(
      <EmptyState gated circle icon={Lock} title="נעול" ctaLabel="צרו" ctaOnClick={() => {}} />,
    );
    const disc = container.querySelector(".rounded-full");
    expect(disc).toBeTruthy();
    expect(disc.querySelector("svg")).toBeTruthy();
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });
});
