/**
 * MEH-3194 item 4 — a WhatsApp tap from an event / workshop sign-up block is
 * reported to PostHog as `item_whatsapp_click` (surface, item, business,
 * which link), so off-site bookings can be read against the on-site ones.
 * Nothing is blocked: the link still opens, the business still counts it.
 * A call, an external link and the on-site form send no such event.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import RegistrationCta from "@/components/RegistrationCta";
import { trackChannelClick } from "@/lib/contact-tracking";
import { trackEvent } from "@/lib/analytics";

vi.mock("@/lib/api", () => ({ default: { post: vi.fn() } }));
vi.mock("@/lib/auth-context", () => ({ useOptionalAuth: () => null }));
vi.mock("@/lib/contact-tracking", () => ({ trackChannelClick: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

const BIZ = "11111111-2222-3333-4444-555555555555";

function cta(props) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <RegistrationCta itemId="x1" title="סדנת מחמצת" isFull={false} producerId={BIZ} kind="experiences" {...props} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("MEH-3194 — off-site WhatsApp taps reach PostHog", () => {
  it("workshop, WhatsApp sign-up → one event with the workshop, business and link", () => {
    cta({ method: "whatsapp", phone: "050-1234567" });
    const link = screen.getByTestId("registration-whatsapp");
    fireEvent.click(link);
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith("item_whatsapp_click", {
      surface: "experience",
      item_id: "x1",
      producer_id: BIZ,
      placement: "action",
    });
    // Not blocked: the business still counts it, and the link still points at WhatsApp.
    expect(trackChannelClick).toHaveBeenCalledWith(BIZ, "whatsapp");
    expect(link.getAttribute("href")).toMatch(/wa\.me/);
  });

  it("event page → surface is event", () => {
    cta({ kind: "events", method: "whatsapp", phone: "050-1234567" });
    fireEvent.click(screen.getByTestId("registration-whatsapp"));
    expect(trackEvent.mock.calls[0][1].surface).toBe("event");
  });

  it("the question link with a mobile → placement question; with a landline → nothing", () => {
    const { unmount } = cta({ method: "site_form", phone: "050-1234567" });
    fireEvent.click(screen.getByTestId("registration-question"));
    expect(trackEvent).toHaveBeenLastCalledWith("item_whatsapp_click", expect.objectContaining({ placement: "question" }));
    unmount();
    vi.clearAllMocks();
    cta({ method: "site_form", phone: "04-6543210" });
    fireEvent.click(screen.getByTestId("registration-question"));
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("the WhatsApp waitlist link → placement waitlist, and the caller's counter still runs", () => {
    const onWaitlistClick = vi.fn();
    cta({ method: "whatsapp", phone: "050-1234567", isFull: true, waitlistHref: "https://wa.me/972501234567", waitlistLabel: "w", onWaitlistClick });
    fireEvent.click(screen.getByTestId("registration-waitlist"));
    expect(onWaitlistClick).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith("item_whatsapp_click", expect.objectContaining({ placement: "waitlist" }));
  });

  it("a call or an external sign-up link sends no event", () => {
    const { unmount } = cta({ method: "phone", phone: "04-6543210" });
    fireEvent.click(screen.getByTestId("registration-phone"));
    unmount();
    cta({ method: "external_url", url: "https://example.com/t" });
    fireEvent.click(screen.getByTestId("registration-external"));
    expect(trackEvent).not.toHaveBeenCalled();
  });
});

describe("MEH-3194 — the sticky phone bar's WhatsApp tap counts too", () => {
  // REUSES: frontend/__tests__/RegistrationCta.test.jsx «MEH-3043 — sticky phone bar»
  let fire;
  beforeEach(() => {
    window.IntersectionObserver = class {
      constructor(cb) { fire = (isIntersecting) => act(() => cb([{ isIntersecting }])); }
      observe() {}
      disconnect() {}
    };
  });
  afterEach(() => { delete window.IntersectionObserver; });

  it("bar action → one event, placement action", () => {
    cta({ method: "whatsapp", phone: "050-1234567" });
    fire(false);
    fireEvent.click(screen.getByTestId("registration-bar-action"));
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith("item_whatsapp_click", expect.objectContaining({ placement: "action" }));
  });
});
