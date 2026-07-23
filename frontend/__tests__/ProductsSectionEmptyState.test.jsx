/**
 * MEH-1172 — products empty state: the example card is the visual (no floating
 * decorative icon), and the title/description use the locked positive copy.
 *
 * REUSES: __tests__/ProductsSectionLoadError.test.jsx (render harness — real
 * NextIntlClientProvider + he.json, api mocked).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ProductsSection from "@/components/ProductsSection";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const P = he.settings.products;

function renderSection() {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ProductsSection />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProductsSection empty state (MEH-1172)", () => {
  it("renders the locked positive title + description on an empty catalog", async () => {
    api.get.mockResolvedValue({ data: [] });
    renderSection();

    expect(
      await screen.findByRole("heading", { level: 3, name: P.empty.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(P.empty.description)).toBeInTheDocument();
  });

  it("promotes the example card as the visual — full opacity (no opacity-70), wider max-w-sm", async () => {
    api.get.mockResolvedValue({ data: [] });
    renderSection();

    // the sample card carries the locked sample name and is the visual anchor
    const sample = await screen.findByText(P.empty.sample_name);
    const exampleWrap = sample.closest('[class*="max-w-sm"]');
    expect(exampleWrap).not.toBeNull();
    expect(exampleWrap.className).not.toMatch(/opacity-70/);
    // the old max-w-xs width must be gone
    expect(exampleWrap.className).not.toMatch(/max-w-xs/);
  });
});
