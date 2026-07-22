import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// MEH-1426: clicking the WhatsApp CTA must fire BOTH shared helpers — attribution
// (pingWhatsAppBeacon) AND review-form unlock (markWhatsAppClickedLocal) — so the
// invariant "every WhatsApp click = attribution + unlock" holds and the private
// inline sendBeacon (MEH-271 duplicate) is gone.
const ping = vi.fn();
const mark = vi.fn();
vi.mock("@/lib/contact-tracking", () => ({
  pingWhatsAppBeacon: (...a) => ping(...a),
  markWhatsAppClickedLocal: (...a) => mark(...a),
  trackContactClick: vi.fn(),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (k) => k,
}));

import WhatsAppButton from "@/components/WhatsAppButton";

const PID = "22222222-2222-2222-2222-222222222222";

describe("WhatsAppButton attribution+unlock (MEH-1426)", () => {
  beforeEach(() => {
    ping.mockClear();
    mark.mockClear();
  });

  it("click with producerId → ping + mark both fire once", () => {
    render(<WhatsAppButton phone="0501234567" producerId={PID} />);
    fireEvent.click(screen.getByTestId("whatsapp-cta"));
    expect(ping).toHaveBeenCalledTimes(1);
    expect(ping).toHaveBeenCalledWith(PID);
    expect(mark).toHaveBeenCalledTimes(1);
    expect(mark).toHaveBeenCalledWith(PID);
  });

  it("click without producerId → neither fires (no attribution/unlock)", () => {
    render(<WhatsAppButton phone="0501234567" />);
    fireEvent.click(screen.getByTestId("whatsapp-cta"));
    expect(ping).not.toHaveBeenCalled();
    expect(mark).not.toHaveBeenCalled();
  });
});
