/**
 * MEH-3302 (D14): WhatsApp alerts go only to a verified phone. With WhatsApp
 * on and the number unverified, the panel says the updates are paused
 * (approved string 19) and offers the code inline (string 13), posting to
 * the USER route — never the business one. Verified → no notice.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import AlertPrefsPanel from "@/components/AlertPrefsPanel";

const auth = vi.hoisted(() => ({ user: null }));
const post = vi.hoisted(() => vi.fn(() => Promise.resolve({ data: {} })));
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(() =>
      Promise.resolve({
        data: { enabled: true, notify_new_product: true, whatsapp_opt_in: true },
      }),
    ),
    put: vi.fn(() => Promise.resolve({})),
    post: (...a) => post(...a),
  },
}));
vi.mock("@/lib/toast", () => ({ showToast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: auth.user, updateProfile: vi.fn(), refreshUser: vi.fn() }),
}));

function renderPanel() {
  return render(
    <NextIntlClientProvider locale="he" messages={he}>
      <AlertPrefsPanel producerId="p1" producerName="עסק" onClose={() => {}} />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);
beforeEach(() => {
  post.mockClear();
  try {
    sessionStorage.clear();
  } catch {
    /* jsdom */
  }
});

describe("AlertPrefsPanel — WhatsApp paused until the phone is verified (MEH-3302)", () => {
  it("unverified: shows strings 19 and 13, and the code goes to the user route", async () => {
    auth.user = { id: 1, phone: "0501234567", phone_verified: false };
    renderPanel();
    const box = await screen.findByTestId("whatsapp-paused");
    expect(box.textContent).toContain("העדכונים בוואטסאפ מושהים עד שתאמתי את המספר.");
    expect(box.textContent).toContain(
      "נשלח קוד בן 6 ספרות לוואטסאפ של המספר הזה. אחרי האימות נשלח לשם עדכונים מבתי העסק ששמרת. אפשר להפסיק בכל רגע: משיבים «הסר».",
    );
    fireEvent.click(screen.getByText(he.dashboard.producer.phone_verify.send_cta));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/users/me/verify-phone"));
  });

  it("verified: no paused notice", async () => {
    auth.user = { id: 1, phone: "0501234567", phone_verified: true };
    renderPanel();
    await screen.findByRole("group");
    await waitFor(() => expect(screen.queryByTestId("whatsapp-paused")).toBeNull());
  });
});
