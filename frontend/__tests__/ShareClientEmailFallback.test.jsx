import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ShareClient from "@/app/[locale]/share/ShareClient";

// MEH-1220: the /share email action is a real <a href="mailto:…">. On desktops
// with no mail handler, mailto: fails silently (no error, no navigation), so
// ShareClient races a 1200ms timer against window "blur" / visibilitychange.
// Timer wins → no handler → copy the full share message + error toast.

// vi.mock factories are hoisted above module scope — shared constants they
// reference must be hoisted too.
const { SHARE_MESSAGE, SITE, FALLBACK_TOAST } = vi.hoisted(() => ({
  SHARE_MESSAGE: "הכירו את מהמקור {url}",
  SITE: "https://mehamakor.co.il",
  FALLBACK_TOAST:
    "לא הצלחנו לפתוח אפליקציית מייל — ההודעה הועתקה, הדביקו אותה במייל",
}));

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const flat = {
      h1: "ספרו עלינו",
      intro: "intro",
      whatsapp: "wa",
      copy: "copy",
      copy_toast: "copied",
      native: "native",
      email: "email",
      email_subject: "subject",
      email_fallback_toast: FALLBACK_TOAST,
      copy_failed_toast: "copy failed — select and copy manually",
      email_copy_failed_toast: "mail + copy failed — try again",
      message: SHARE_MESSAGE,
    };
    return (key, vars) => {
      let s = flat[key] ?? key;
      if (vars) for (const k of Object.keys(vars)) s = s.replace(`{${k}}`, vars[k]);
      return s;
    };
  },
}));

vi.mock("@phosphor-icons/react", () => {
  const Stub = (props) => <span {...props} />;
  return {
    WhatsappLogo: Stub,
    LinkSimple: Stub,
    ShareNetwork: Stub,
    EnvelopeSimple: Stub,
    Check: Stub,
  };
});

const { errorToast, successToast } = vi.hoisted(() => ({
  errorToast: vi.fn(),
  successToast: vi.fn(),
}));
vi.mock("@/lib/toast", () => ({
  showToast: {
    success: (...a) => successToast(...a),
    error: (...a) => errorToast(...a),
    info: vi.fn(),
  },
}));

vi.mock("@/lib/env", () => ({ SITE_URL: SITE }));
vi.mock("@/lib/constants", () => ({ BRAND_NAME: "מהמקור" }));

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  errorToast.mockClear();
  successToast.mockClear();
  writeText.mockClear();
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  delete document.execCommand;
});

describe("ShareClient — silent-mailto fallback (MEH-1220)", () => {
  it("no handler: after 1200ms copies the share message + shows the toast", async () => {
    render(<ShareClient />);
    fireEvent.click(screen.getByTestId("share-email"));

    await vi.runAllTimersAsync();

    expect(writeText).toHaveBeenCalledWith(SHARE_MESSAGE.replace("{url}", SITE));
    expect(errorToast).toHaveBeenCalledWith(FALLBACK_TOAST);
  });

  it("handler present (window blur): timer is cancelled — no copy, no toast", async () => {
    render(<ShareClient />);
    fireEvent.click(screen.getByTestId("share-email"));

    // A real handler grabs focus within the window → blur fires → cancel.
    window.dispatchEvent(new Event("blur"));
    await vi.runAllTimersAsync();

    expect(writeText).not.toHaveBeenCalled();
    expect(errorToast).not.toHaveBeenCalled();
  });

  it("second click does not double-toast (listeners cleaned up per click)", async () => {
    render(<ShareClient />);
    const link = screen.getByTestId("share-email");

    fireEvent.click(link);
    await vi.runAllTimersAsync();
    fireEvent.click(link);
    await vi.runAllTimersAsync();

    // One toast per fallback firing — not 1 + N leaked listeners.
    expect(errorToast).toHaveBeenCalledTimes(2);
    expect(writeText).toHaveBeenCalledTimes(2);
  });
});

describe("ShareClient — copy double-failure (MEH-1223)", () => {
  it("copy link: clipboard rejects AND execCommand fails → failure toast, not הועתק", async () => {
    // Both paths fail: navigator.clipboard.writeText rejects, execCommand
    // returns false. The old code showed the success toast unconditionally.
    // jsdom has no document.execCommand — assign a mock directly.
    writeText.mockRejectedValueOnce(new Error("denied"));
    const execCommand = vi.fn().mockReturnValue(false);
    document.execCommand = execCommand;

    render(<ShareClient />);
    fireEvent.click(screen.getByTestId("share-copy"));

    // Let the async copyLink chain settle.
    await vi.runAllTimersAsync();

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(successToast).not.toHaveBeenCalled();
    expect(errorToast).toHaveBeenCalledWith("copy failed — select and copy manually");
  });

  it("email fallback: clipboard rejects AND execCommand fails → mail+copy failure toast", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    const execCommand = vi.fn().mockReturnValue(false);
    document.execCommand = execCommand;

    render(<ShareClient />);
    fireEvent.click(screen.getByTestId("share-email"));

    await vi.runAllTimersAsync();

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(errorToast).toHaveBeenCalledWith("mail + copy failed — try again");
    expect(errorToast).not.toHaveBeenCalledWith(FALLBACK_TOAST);
  });
});
