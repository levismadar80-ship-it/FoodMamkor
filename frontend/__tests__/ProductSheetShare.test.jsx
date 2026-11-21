/**
 * MEH-3621 — the product sheet shares THIS product: the page's own address
 * plus `?product=<id>`, the deep link the page already opens (PR #3972).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

vi.mock("next/image", () => ({ default: (props) => <img src={props.src} alt={props.alt} /> }));

import ProductSheet, { productShareUrl } from "@/components/public/ProductSheet";

const product = { id: "p-17", name: "עוגת גבינה", description: "", image_url: null };
const producer = { id: "b-1", name: "המאפייה של רותי", slug: "ruti", phone: "0501234567" };

afterEach(() => vi.unstubAllGlobals());

describe("product share link (MEH-3621)", () => {
  it("keeps the visitor's route and locale and adds ?product=<id>", () => {
    window.history.replaceState(null, "", "/en/ruti?utm_source=x#reviews");
    expect(productShareUrl("p 17")).toBe(`${window.location.origin}/en/ruti?product=p%2017`);
  });

  it("the sheet's share button hands the phone's share sheet that link", async () => {
    window.history.replaceState(null, "", "/ruti");
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, share });
    render(
      <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
        <ProductSheet product={product} producer={producer} index={0} total={1} onClose={() => {}} />
      </NextIntlClientProvider>,
    );
    const button = screen.getByTestId("product-sheet-share").querySelector("button");
    expect(button.getAttribute("aria-label")).toBe("שתפו את המוצר");
    fireEvent.click(button);
    await vi.waitFor(() => expect(share).toHaveBeenCalled());
    expect(share.mock.calls[0][0].url).toBe(`${window.location.origin}/ruti?product=p-17`);
  });
});
