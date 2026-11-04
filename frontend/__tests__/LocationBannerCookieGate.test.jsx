/**
 * MEH-2394 — the city banner waits for cookie consent. On a first visit the
 * cookie banner and the city banner both opened within 3 s, two green boxes
 * asking for a decision before any content. One prompt at a time: the reveal
 * timer is armed only once consent exists (stored, or the "cookie-consent"
 * event CookieBanner.jsx dispatches on accept).
 *
 * Three cells on the SAME timer budget, so the negative cannot pass by the
 * clock not having run: cell 1 is the gate, cells 2–3 are the two ways consent
 * arrives and prove the banner still appears.
 *
 * MEH-2634: the budget is DERIVED from the component's own REVEAL_DELAY_MS
 * (3 s → 8 s there) rather than restated. A hardcoded 3500 ms against an
 * 8000 ms reveal turns cells 2–3 green-for-nothing — the banner is absent
 * because the timer never fired, which is indistinguishable from the gate
 * holding, i.e. exactly what cell 1 asserts.
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

import LocationBanner, { REVEAL_DELAY_MS } from "@/components/LocationBanner";

// Past the reveal, with room to spare — never a literal (see the header note).
const BUDGET_MS = REVEAL_DELAY_MS + 500;

const shown = () => screen.queryByText("location.banner.choose_city") !== null;

async function mountAndWait() {
  await act(async () => {
    render(<LocationBanner hasCity={false} onOpenModal={() => {}} />);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(BUDGET_MS);
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
  it("stays hidden while there is no consent, even past the reveal delay", async () => {
    await mountAndWait();
    expect(shown()).toBe(false);
  });

  it("appears after the delay when consent is already stored", async () => {
    localStorage.setItem("cookieConsent", "essential");
    await mountAndWait();
    expect(shown()).toBe(true);
  });

  it("appears one reveal delay after the cookie-consent event when consent arrives later", async () => {
    await mountAndWait();
    expect(shown()).toBe(false); // control: the gate held first
    await act(async () => {
      window.dispatchEvent(new CustomEvent("cookie-consent"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BUDGET_MS);
    });
    expect(shown()).toBe(true);
  });
});
