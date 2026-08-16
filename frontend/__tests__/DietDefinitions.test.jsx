/**
 * MEH-2047 — "מה הסימונים אומרים?" disclosure in the owner product form.
 *
 * The locked behaviour is what an owner can find out at the moment she marks a
 * tag, so every assertion here is written to fail against the pre-MEH-2047
 * form, which had no disclosure at all: the trigger did not exist, so the
 * queries throw; and the definition strings appeared nowhere in the bundle, so
 * the body assertions cannot pass by accident on the old markup.
 *
 * Both forms are covered on purpose. They are two separate JSX blocks in
 * ProductsSection (add ~:670, edit ~:500) rather than one shared subtree, so a
 * disclosure mounted in one and forgotten in the other is a live failure mode
 * — and it is exactly the kind a single-form test reports as green.
 *
 * ── What this file does NOT claim ──────────────────────────────────────────
 * jsdom loads no Tailwind, so nothing here verifies that the collapsed panel is
 * visually hidden or that the trigger reads as a muted link. Collapse is
 * asserted structurally instead — the panel is absent from the DOM, not merely
 * styled away — which is the stronger property and the one this implementation
 * actually provides.
 *
 * REUSES: __tests__/ProductsSectionSubmitValidation.test.jsx (render harness —
 * real NextIntlClientProvider + he.json, api mocked, same openAddForm idiom).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";
import api from "@/lib/api";
import ProductsSection from "@/components/ProductsSection";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const P = he.settings.products;
const F = P.form;

// The five tags that carry a definition. Read from the message file rather than
// retyped, so a copy edit cannot leave this test asserting a string the product
// no longer renders.
const DEFINED = ["gluten_free", "vegan", "vegetarian", "lactose_free", "no_added_sugar"];

const PRODUCT = {
  id: 7,
  name: "לחם מחמצת",
  price_min: 30,
  price_max: null,
  image_url: "",
  is_gluten_free: false,
  is_vegan: false,
  is_vegetarian: false,
  is_lactose_free: false,
  is_no_added_sugar: false,
};

function renderSection(messages = he, locale = "he") {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages} onError={() => {}}>
      <ProductsSection />
    </NextIntlClientProvider>,
  );
}

async function openAddForm() {
  api.get.mockResolvedValue({ data: [] });
  renderSection();
  fireEvent.click(await screen.findByText(P.empty.cta));
}

async function openEditForm() {
  api.get.mockResolvedValue({ data: [PRODUCT] });
  renderSection();
  fireEvent.click(
    await screen.findByLabelText(P.card.edit_aria_template.replace("{name}", PRODUCT.name)),
  );
}

const trigger = () => screen.getByRole("button", { name: new RegExp(F.diet_definitions_cta) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe.each([
  ["add-product form", openAddForm],
  ["edit-product form", openEditForm],
])("MEH-2047 diet definitions — %s", (_name, openForm) => {
  it("renders a collapsed disclosure: the trigger is a button with aria-expanded=false", async () => {
    await openForm();

    const btn = trigger();
    expect(btn.tagName).toBe("BUTTON");
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("collapsed means ABSENT from the DOM, not merely styled away", async () => {
    await openForm();

    // The panel the trigger points at does not exist yet...
    expect(document.getElementById(trigger().getAttribute("aria-controls"))).toBeNull();
    // ...and neither does any definition body.
    for (const key of DEFINED) {
      expect(screen.queryByText(F[`diet_def_${key}`])).toBeNull();
    }
  });

  it("opening reveals every definition, verbatim, and flips aria-expanded", async () => {
    await openForm();

    fireEvent.click(trigger());

    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    for (const key of DEFINED) {
      expect(screen.getByText(F[`diet_def_${key}`])).toBeInTheDocument();
    }
  });

  it("each definition is labelled by its own chip's term — one owner for the label", async () => {
    await openForm();
    fireEvent.click(trigger());

    const panel = document.getElementById(trigger().getAttribute("aria-controls"));
    expect(panel).not.toBeNull();

    for (const key of DEFINED) {
      const dt = [...panel.querySelectorAll("dt")].find(
        (el) => el.textContent.replace(/:$/, "") === F[`diet_${key}`],
      );
      expect(dt, `no <dt> for ${key}`).toBeTruthy();
      expect(dt.nextElementSibling.textContent).toBe(F[`diet_def_${key}`]);
    }
    // The count is DERIVED from the panel, not restated: adding a sixth
    // definition without adding it to DEFINED moves this number and reds the
    // test, which a literal `toBe(5)` written beside a 5-item array could not.
    expect(panel.querySelectorAll("dt")).toHaveLength(DEFINED.length);
  });

  it("closing again removes the panel", async () => {
    await openForm();

    fireEvent.click(trigger());
    expect(trigger()).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(trigger());
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById(trigger().getAttribute("aria-controls"))).toBeNull();
  });

  it("no definition for דל פחמימות — the claim MEH-2047 withdraws", async () => {
    await openForm();
    fireEvent.click(trigger());

    const panel = document.getElementById(trigger().getAttribute("aria-controls"));
    expect(panel.textContent).not.toContain("פחמימות");
    // and no orphan key was left in the message file for one
    expect(F.diet_def_low_carb).toBeUndefined();
  });

  it("the MEH-1439 helper line survives — effect and meaning are both on screen", async () => {
    await openForm();

    expect(screen.getByText(F.diet_helper)).toBeInTheDocument();
  });
});

describe("MEH-2047 diet definitions — en parity (MEH-978)", () => {
  it("every he key has an en counterpart and neither side is empty", () => {
    const heF = he.settings.products.form;
    const enF = en.settings.products.form;
    for (const key of ["diet_definitions_cta", ...DEFINED.map((k) => `diet_def_${k}`)]) {
      expect(heF[key], `he missing ${key}`).toBeTruthy();
      expect(enF[key], `en missing ${key}`).toBeTruthy();
    }
  });

  it("renders the English copy under locale=en", async () => {
    api.get.mockResolvedValue({ data: [] });
    renderSection(en, "en");
    fireEvent.click(await screen.findByText(en.settings.products.empty.cta));

    const btn = screen.getByRole("button", {
      name: new RegExp(en.settings.products.form.diet_definitions_cta),
    });
    fireEvent.click(btn);
    expect(
      screen.getByText(en.settings.products.form.diet_def_lactose_free),
    ).toBeInTheDocument();
  });
});
