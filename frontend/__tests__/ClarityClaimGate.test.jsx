/**
 * MEH-2324 — Clarity records the page URL, so it must not load while the
 * address still holds the claim token. It loads normally everywhere else,
 * including /claim once the token has been moved into storage.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ClarityScript from "@/components/ClarityScript";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("next/script", () => ({ default: ({ id }) => <div data-testid={id} /> }));

beforeEach(() => {
  window.localStorage.setItem("cookieConsent", "all");
});

describe("ClarityScript on the claim link", () => {
  it.each([["/claim/abc.def.ghi"], ["/en/claim/abc.def.ghi"]])("%s: not loaded", (path) => {
    pathname = path;
    render(<ClarityScript projectId="p1" />);
    expect(screen.queryByTestId("ms-clarity")).not.toBeInTheDocument();
  });

  it.each([["/claim"], ["/"], ["/producer/dashboard"]])("%s: loaded", (path) => {
    pathname = path;
    render(<ClarityScript projectId="p1" />);
    expect(screen.getByTestId("ms-clarity")).toBeInTheDocument();
  });
});
