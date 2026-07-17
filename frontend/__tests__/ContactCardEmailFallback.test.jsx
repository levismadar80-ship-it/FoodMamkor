import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// MEH-1221: the producer-page email icon is a bare <a href="mailto:…"> and the
// address is not shown anywhere on the card. On desktops with no mail handler,
// mailto: fails silently — so ContactCard races a 1200ms timer against window
// "blur" / visibilitychange; timer wins → copy the address + toast. Clones the
// ShareClient MEH-1220/1223 pattern (incl. the real-success flag on double
// failure). Mirrors __tests__/ShareClientEmailFallback.test.jsx.

const { ADDR_COPIED, MAIL_COPY_FAILED } = vi.hoisted(() => ({
  ADDR_COPIED: "לא הצלחנו לפתוח אפליקציית מייל — הכתובת הועתקה",
  MAIL_COPY_FAILED: "לא הצלחנו לפתוח אפליקציית מייל ולא להעתיק — נסו שוב",
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key) => {
    const map = {
      "producer.detail.contact_card.status_open": "פתוח להזמנות",
      "producer.detail.contact_card.aria.email": "אימייל",
      "producer.detail.contact_card.email_fallback_toast": ADDR_COPIED,
      "producer.detail.contact_card.email_copy_failed_toast": MAIL_COPY_FAILED,
    };
    return map[key] ?? key;
  },
}));

const { trackContactClick } = vi.hoisted(() => ({ trackContactClick: vi.fn() }));
vi.mock("@/lib/contact-tracking", () => ({
  markWhatsAppClickedLocal: vi.fn(),
  pingWhatsAppBeacon: vi.fn(),
  trackContactClick: (...a) => trackContactClick(...a),
}));

const { errorToast, successToast } = vi.hoisted(() => ({
  errorToast: vi.fn(),
  successToast: vi.fn(),
}));
vi.mock("@/lib/toast", () => ({
  showToast: { success: (...a) => successToast(...a), error: (...a) => errorToast(...a), info: vi.fn() },
}));

vi.mock("@phosphor-icons/react", () => {
  const Stub = () => <span />;
  return {
    EnvelopeSimple: Stub, FacebookLogo: Stub, Globe: Stub,
    InstagramLogo: Stub, Phone: Stub, Receipt: Stub, WhatsappLogo: Stub, ChatCircle: Stub,
  };
});
// Focus the suite on the icon row — stub the heavy children.
vi.mock("@/components/FollowButton", () => ({ default: () => <button>follow</button> }));
vi.mock("@/components/ShareButton", () => ({ default: () => <button>share</button> }));
vi.mock("@/components/PrimaryContactButton", () => ({ default: () => <button>cta</button> }));
vi.mock("@/components/WhatsAppQuestionChips", () => ({ default: () => null }));

import ContactCard from "@/app/[locale]/producer/[id]/components/ContactCard";

const EMAIL = "hi@shikma.co.il";
const producer = { id: 7, name: "חוות השקמה", contact_email: EMAIL, primary_contact_method: "whatsapp" };
const renderCard = () =>
  render(<ContactCard producer={producer} isVacation={false} primaryCategory={null} shareUrl="x" />);

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  errorToast.mockClear();
  successToast.mockClear();
  trackContactClick.mockClear();
  writeText.mockClear();
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  delete document.execCommand;
});

describe("ContactCard email — silent-mailto fallback (MEH-1221)", () => {
  it("no handler: after 1200ms copies the address + shows the toast", async () => {
    renderCard();
    fireEvent.click(screen.getByLabelText("אימייל"));
    await vi.runAllTimersAsync();
    expect(writeText).toHaveBeenCalledWith(EMAIL);
    expect(errorToast).toHaveBeenCalledWith(ADDR_COPIED);
  });

  it("handler present (window blur): timer cancelled — no copy, no toast", async () => {
    renderCard();
    fireEvent.click(screen.getByLabelText("אימייל"));
    window.dispatchEvent(new Event("blur"));
    await vi.runAllTimersAsync();
    expect(writeText).not.toHaveBeenCalled();
    expect(errorToast).not.toHaveBeenCalled();
  });

  it("double failure (clipboard rejects AND execCommand false) → failure toast, not הועתקה", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    document.execCommand = vi.fn().mockReturnValue(false);
    renderCard();
    fireEvent.click(screen.getByLabelText("אימייל"));
    await vi.runAllTimersAsync();
    expect(errorToast).toHaveBeenCalledWith(MAIL_COPY_FAILED);
    expect(errorToast).not.toHaveBeenCalledWith(ADDR_COPIED);
  });

  it("tracking fires exactly once per click", async () => {
    renderCard();
    fireEvent.click(screen.getByLabelText("אימייל"));
    await vi.runAllTimersAsync();
    expect(trackContactClick).toHaveBeenCalledTimes(1);
    expect(trackContactClick).toHaveBeenCalledWith(7, "email");
  });
});
