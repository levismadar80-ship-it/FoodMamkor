/**
 * MEH-3343 — two reservations that keep page load from shifting the layout.
 * Measured on staging before the fix: business page 1.58 CLS (phone), /login
 * 0.53, /favorites 0.87 — the footer sat in the first screen while a page
 * streamed, then jumped; and Google's late button pushed the form down 40px.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({ useTranslations: () => (k) => k }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ loginWithGoogle: vi.fn() }) }));
vi.mock("@/lib/use-google-sign-in", () => ({ useGoogleSignIn: () => {}, gsiLang: () => "he" }));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_GOOGLE_CLIENT_ID: "cid" } }));

describe("MEH-3343 layout-shift reservations", () => {
  it("<main> is at least one screen tall, so the footer never starts in view", () => {
    const src = readFileSync(join(__dirname, "../app/[locale]/layout.js"), "utf8");
    const main = src.match(/<main id="main-content"[^>]*className="([^"]*)"/);
    expect(main, "the <main id=main-content> element").not.toBeNull();
    expect(main[1].split(/\s+/)).toContain("min-h-screen");
  });

  it("the Google button slot reserves the 40px button before GSI paints it", async () => {
    const { default: GoogleAuthButton } = await import("@/components/GoogleAuthButton");
    render(<GoogleAuthButton />);
    expect(screen.getByTestId("google-auth-slot").className.split(/\s+/)).toContain("min-h-10");
  });
});
