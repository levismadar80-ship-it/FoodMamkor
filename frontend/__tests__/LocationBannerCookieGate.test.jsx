/**
 * MEH-2394 — the city banner waits for cookie consent. On a first visit the
 * cookie banner and the city banner both opened within 3 s, two green boxes
 * asking for a decision before any content. One prompt at a time: the reveal
 * timer is armed only once consent exists (stored, or the "cookie-consent"
 * event CookieBanner.jsx dispatches on accept).
 *
 * Three cells on the SAME timer budget (3.5 s > the 3 s reveal), so the
 * negative cannot pass by the clock not having run: cell 1 is the gate, cells
 * 2–3 are the two ways consent arrives and prove the banner still appears.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key) => `location.banner.${key}`,
}));
vi.mock("@phosphor-icons/react", () => {
  const Stub = () => <span />;
  return { MapPin: Stub, X: Stub };
});

import LocationBanner from "@/components/LocationBanner";

const shown = () => screen.queryByText("location.banner.choose_city") !== null;

async function mountAndWait() {
  await act(async () => {
    render(<LocationBanner hasCity={false} onOpenModal={() => {}} />);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3500);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("MEH-2394 — LocationBanner waits for cookie consent", () => {
  it("stays hidden while there is no consent, even after the 3 s reveal delay", async () => {
    await mountAndWait();
    expect(shown()).toBe(false);
  });

  it("appears after the delay when consent is already stored", async () => {
    localStorage.setItem("cookieConsent", "essential");
    await mountAndWait();
    expect(shown()).toBe(true);
  });

  it("appears 3 s after the cookie-consent event when consent arrives later", async () => {
    await mountAndWait();
    expect(shown()).toBe(false); // control: the gate held first
    await act(async () => {
      window.dispatchEvent(new CustomEvent("cookie-consent"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });
    expect(shown()).toBe(true);
  });
});
