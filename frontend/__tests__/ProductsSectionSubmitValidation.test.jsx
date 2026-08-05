/**
 * MEH-1809 — ProductsSection submit validation.
 *
 * The locked behaviour is the DIFFERENCE from the old setError chain, so each
 * assertion is written to fail against it:
 *   - the old code returned after the FIRST failing check, so only ONE message
 *     could ever be on screen. Asserting name AND price simultaneously reds it.
 *   - the old code never called focus(), so asserting activeElement reds it.
 *   - the old message rendered in the card-level banner, detached from the
 *     field; asserting aria-describedby wiring on the input reds it too.
 *
 * REUSES: __tests__/EditTabProductsSection.test.jsx (render harness — real
 * NextIntlClientProvider + he.json, api mocked).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ProductsSection from "@/components/ProductsSection";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const P = he.settings.products;
const E = P.errors;

function renderSection() {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ProductsSection />
    </NextIntlClientProvider>,
  );
}

async function openAddForm() {
  api.get.mockResolvedValue({ data: [] });
  renderSection();
  fireEvent.click(await screen.findByText(P.empty.cta));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProductsSection — submit validation (MEH-1809)", () => {
  it("empty submit shows the name AND price errors together, not one at a time", async () => {
    await openAddForm();

    fireEvent.click(screen.getByText(P.add_submit_cta));

    // BOTH visible in the same render — the whole point of the change.
    expect(screen.getByText(E.name_required)).toBeInTheDocument();
    expect(screen.getByText(E.price_required)).toBeInTheDocument();
    // Nothing was sent.
    expect(api.post).not.toHaveBeenCalled();
  });

  it("empty submit moves focus to the first invalid field (name)", async () => {
    await openAddForm();

    fireEvent.click(screen.getByText(P.add_submit_cta));

    expect(document.activeElement).toBe(document.getElementById("new-product-name"));
  });

  it("each error is wired to its own field, not to a detached banner", async () => {
    await openAddForm();

    fireEvent.click(screen.getByText(P.add_submit_cta));

    const nameInput = document.getElementById("new-product-name");
    expect(nameInput).toHaveAttribute("aria-invalid", "true");
    // the message the input points at is the name error, not the price one
    const describedBy = nameInput.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy)).toHaveTextContent(E.name_required);
  });

  it("fixing a field clears only that field's error; the other one stays", async () => {
    await openAddForm();

    fireEvent.click(screen.getByText(P.add_submit_cta));
    expect(screen.getByText(E.name_required)).toBeInTheDocument();

    fireEvent.change(document.getElementById("new-product-name"), {
      target: { value: "לחם מחמצת" },
    });

    expect(screen.queryByText(E.name_required)).not.toBeInTheDocument();
    // the untouched field keeps its error — it was not silently cleared
    expect(screen.getByText(E.price_required)).toBeInTheDocument();
  });

  it("a valid submit passes validation and posts", async () => {
    await openAddForm();
    api.post.mockResolvedValue({ data: { id: 1, name: "לחם מחמצת", price_min: 20 } });

    fireEvent.change(document.getElementById("new-product-name"), {
      target: { value: "לחם מחמצת" },
    });
    fireEvent.change(document.getElementById("new-product-price-min"), {
      target: { value: "20" },
    });
    fireEvent.click(screen.getByText(P.add_submit_cta));

    expect(api.post).toHaveBeenCalledWith(
      "/producers/me/products",
      expect.objectContaining({ name: "לחם מחמצת", price_min: 20 }),
    );
  });
});
