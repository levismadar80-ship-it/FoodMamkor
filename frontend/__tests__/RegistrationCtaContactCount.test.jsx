/**
 * MEH-2991 — a WhatsApp / call tap in the sign-up block of an event or
 * workshop page is a contact with the business, so it is counted for that
 * business (trackChannelClick), as on the business's own page. The waitlist
 * link keeps the caller's counter (never counted twice); an external sign-up
 * link is not a contact channel and is not counted.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import RegistrationCta from "@/components/RegistrationCta";
import { trackChannelClick } from "@/lib/contact-tracking";

vi.mock("@/lib/api", () => ({ default: { post: vi.fn() } }));
vi.mock("@/lib/auth-context", () => ({ useOptionalAuth: () => null }));
vi.mock("@/lib/contact-tracking", () => ({ trackChannelClick: vi.fn() }));

const BIZ = "11111111-2222-3333-4444-555555555555";

function cta(props) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <RegistrationCta kind="experiences" itemId="x1" title="סדנת מחמצת" isFull={false} producerId={BIZ} {...props} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("MEH-2991 — sign-up taps are counted for the business", () => {
  it("whatsapp method → counted as whatsapp", () => {
    cta({ method: "whatsapp", phone: "050-1234567" });
    fireEvent.click(screen.getByTestId("registration-whatsapp"));
    expect(trackChannelClick).toHaveBeenCalledTimes(1);
    expect(trackChannelClick).toHaveBeenCalledWith(BIZ, "whatsapp");
  });

  it("phone method → counted as phone", () => {
    cta({ method: "phone", phone: "04-6543210" });
    fireEvent.click(screen.getByTestId("registration-phone"));
    expect(trackChannelClick).toHaveBeenCalledWith(BIZ, "phone");
  });

  it("whatsapp method with only a landline → the call is counted as phone", () => {
    cta({ method: "whatsapp", phone: "04-6543210" });
    fireEvent.click(screen.getByTestId("registration-phone"));
    expect(trackChannelClick).toHaveBeenCalledWith(BIZ, "phone");
  });

  it("site_form question link → whatsapp with a mobile, phone with a landline", () => {
    const { unmount } = cta({ method: "site_form", phone: "050-1234567" });
    fireEvent.click(screen.getByTestId("registration-question"));
    expect(trackChannelClick).toHaveBeenLastCalledWith(BIZ, "whatsapp");
    unmount();
    cta({ method: "site_form", phone: "04-6543210" });
    fireEvent.click(screen.getByTestId("registration-question"));
    expect(trackChannelClick).toHaveBeenLastCalledWith(BIZ, "phone");
  });

  it("external sign-up link → not counted", () => {
    cta({ method: "external_url", url: "https://example.com/t" });
    fireEvent.click(screen.getByTestId("registration-external"));
    expect(trackChannelClick).not.toHaveBeenCalled();
  });

  it("waitlist link → only the caller's counter, never a second count", () => {
    const onWaitlistClick = vi.fn();
    cta({ method: "whatsapp", phone: "050-1234567", isFull: true, waitlistHref: "https://wa.me/972501234567", waitlistLabel: "w", onWaitlistClick });
    fireEvent.click(screen.getByTestId("registration-waitlist"));
    expect(onWaitlistClick).toHaveBeenCalledTimes(1);
    expect(trackChannelClick).not.toHaveBeenCalled();
  });
});
