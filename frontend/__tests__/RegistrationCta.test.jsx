/**
 * MEH-2768 — the public sign-up CTA, one cell per «איך נרשמים?» method, plus
 * the channel-missing cells (the recipient-less wa.me that started MEH-2762)
 * and the on-site form's submit / 409 / 422 paths.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import RegistrationCta from "@/components/RegistrationCta";

vi.mock("@/lib/api", () => ({ default: { post: vi.fn() } }));

const C = he.registration.cta;
const S = he.registration.signup;

function cta(props) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <RegistrationCta kind="experiences" itemId="x1" title="סדנת מחמצת" isFull={false} {...props} />
    </NextIntlClientProvider>,
  );
}
const anyCta = () => document.querySelector('[data-testid^="registration-"]');

beforeEach(() => vi.clearAllMocks());

describe("RegistrationCta — by method", () => {
  it("whatsapp + mobile → «הרשמה בוואטסאפ» to that number", () => {
    cta({ method: "whatsapp", phone: "050-1234567" });
    const a = screen.getByTestId("registration-whatsapp");
    expect(a.textContent).toBe(C.whatsapp);
    expect(a.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/972501234567\?text=/);
  });

  it("whatsapp + landline → a call, never a recipient-less wa.me", () => {
    cta({ method: "whatsapp", phone: "04-6543210" });
    expect(document.querySelector('a[href*="wa.me"]')).toBeNull();
    expect(screen.getByTestId("registration-phone").getAttribute("href")).toBe("tel:046543210");
  });

  it("whatsapp + no phone → nothing", () => {
    cta({ method: "whatsapp", phone: null });
    expect(anyCta()).toBeNull();
  });

  it("phone → «התקשרות להרשמה» (tel:)", () => {
    cta({ method: "phone", phone: "04-6543210" });
    const a = screen.getByTestId("registration-phone");
    expect(a.textContent).toBe(C.phone);
  });

  it("external_url → «להרשמה ←» to the owner's link; none without a link", () => {
    const { unmount } = cta({ method: "external_url", url: "https://example.com/t" });
    const a = screen.getByTestId("registration-external");
    expect(a.textContent).toBe(C.external);
    expect(a.getAttribute("href")).toBe("https://example.com/t");
    unmount();
    cta({ method: "external_url", url: null });
    expect(anyCta()).toBeNull();
  });

  it("site_form → the sign-up button + «או שאלה למארחת» via WhatsApp", () => {
    cta({ method: "site_form", phone: "050-1234567" });
    expect(screen.getByTestId("registration-open").textContent).toBe(C.signup_experience);
    expect(screen.getByTestId("registration-question").textContent).toBe(C.question);
    expect(screen.getByTestId("registration-question").getAttribute("href")).toMatch(/wa\.me\/972501234567/);
    expect(screen.queryByTestId("registration-form")).toBeNull();
  });

  it("site_form on an event says «הרשמה לאירוע»; no phone → no question link", () => {
    cta({ kind: "events", method: "site_form", phone: null });
    expect(screen.getByTestId("registration-open").textContent).toBe(C.signup_event);
    expect(screen.queryByTestId("registration-question")).toBeNull();
  });

  it("full → the waitlist link when given, else «אין יותר מקומות»", () => {
    const { unmount } = cta({ method: "site_form", isFull: true, waitlistHref: "https://wa.me/972501234567?text=x", waitlistLabel: "ww" });
    expect(screen.getByTestId("registration-waitlist").textContent).toBe("ww");
    expect(screen.queryByTestId("registration-open")).toBeNull();
    unmount();
    cta({ method: "site_form", isFull: true });
    expect(screen.getByTestId("registration-full").textContent).toBe(C.full);
  });
});

describe("RegistrationCta — the on-site form", () => {
  function openForm() {
    cta({ method: "site_form", phone: "050-1234567" });
    fireEvent.click(screen.getByTestId("registration-open"));
  }
  const fill = (name, phone, email) => {
    fireEvent.change(document.getElementById("signup-name"), { target: { value: name } });
    fireEvent.change(document.getElementById("signup-phone"), { target: { value: phone } });
    fireEvent.change(document.getElementById("signup-email"), { target: { value: email } });
  };
  const send = () => fireEvent.click(screen.getByTestId("registration-submit"));

  it("opens with the approved fields and privacy line, focus on the name", () => {
    openForm();
    for (const k of ["name", "phone", "email", "submit", "privacy"]) expect(screen.getByText(S[k], { exact: false })).toBeInTheDocument();
    expect(document.activeElement.id).toBe("signup-name");
  });

  // MEH-2777 — the notice-at-collection half. The approved sentence was
  // already here as a bare <p>; what it lacked is the link, which is the
  // thing MEH-1981's component exists to add. The assertion below is what
  // separates the two: the old <p> passed the "privacy line" case above and
  // would fail every line of this one.
  it("the privacy line is the notice-at-collection component, with a /privacy link", () => {
    openForm();
    const notice = screen.getByTestId("registration-collection-notice");
    expect(notice).toHaveTextContent(S.privacy);

    const link = screen.getByTestId("registration-collection-notice-link");
    // No «/he» prefix, for two reasons that both hold: routing.js is
    // localePrefix "as-needed" with he as the default, AND next-intl's Link
    // needs a Next router context jsdom does not provide, so it emits the
    // bare path in either locale here. So this does NOT prove the link is
    // locale-aware — an /en case was written, measured, and deleted because it
    // reads "/privacy" too. Same limit CollectionNoticeApprovedCopy.test.jsx:141
    // records for the eight other notices; the locale prefix is an e2e claim.
    // What this DOES prove, which is the point of the change, is that a link
    // to the policy exists at all — the old bare <p> had none.
    expect(link).toHaveAttribute("href", "/privacy");
    expect(link).toHaveTextContent(he.auth.register.consumer.terms.privacy_link);
    // MEH-1981 a11y: underlined at rest, not on hover — the link sits inside a
    // block of body copy and does not carry 3:1 against it.
    expect(link.className).toContain("underline");
  });

  it("the notice carries a REAL colour token", () => {
    // MEH-2777 pinned `text-fg-muted` at this call site because
    // CollectionNotice's default tone was `text-muted-foreground`, which is
    // not in tailwind.tokens.json and emits no CSS. MEH-2798 fixed the
    // component, so the class now arrives from its default and the explicit
    // prop is gone — this assertion is unchanged and still passes, which is
    // what makes it the check that the surface never lost its colour.
    openForm();
    const notice = screen.getByTestId("registration-collection-notice");
    expect(notice.className).toContain("text-fg-muted");
  });

  it("the notice says nothing new — the message is the approved string, untouched", () => {
    // Guards against the copy drifting during the swap. rule 22: new
    // user-facing text needs Sapir's approval, and this change deliberately
    // introduced none.
    expect(S.privacy).toBe(
      "הפרטים עוברים למארחת רק לצורך ההרשמה, ונמחקים 30 יום אחרי המועד.",
    );
  });

  it("empty submit → every field says so, nothing sent", () => {
    openForm();
    send();
    expect(screen.getAllByText(S.required)).toHaveLength(3);
    expect(api.post).not.toHaveBeenCalled();
  });

  it("a bad email is caught before sending", () => {
    openForm();
    fill("נועה כהן", "050-1112233", "noa@");
    send();
    expect(screen.getByText(S.email_invalid)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("success → posts trimmed values and shows the approved confirmation", async () => {
    api.post.mockResolvedValue({ data: { status: "registered" } });
    openForm();
    fill("  נועה כהן ", "050-1112233", " noa@example.com ");
    send();
    await waitFor(() => expect(screen.getByTestId("registration-success").textContent).toBe(S.success));
    expect(api.post).toHaveBeenCalledWith("/experiences/x1/registrations", {
      name: "נועה כהן",
      phone: "050-1112233",
      email: "noa@example.com",
    });
  });

  it("409 → the server's own message in the banner", async () => {
    api.post.mockRejectedValue({ response: { status: 409, data: { detail: { code: "registration_full", message: "אין יותר מקומות" } } } });
    openForm();
    fill("נועה כהן", "050-1112233", "noa@example.com");
    send();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("אין יותר מקומות"));
  });

  it("a one-letter name is caught before sending", () => {
    openForm();
    fill("א1", "050-1112233", "noa@example.com");
    send();
    expect(screen.getByText(S.name_short)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("422 → the page's own message on that field, not the server's Hebrew text", async () => {
    api.post.mockRejectedValue({
      response: { status: 422, data: { detail: [{ loc: ["body", "phone"], msg: "Value error, SERVER-TEXT" }] } },
    });
    openForm();
    fill("נועה כהן", "050-1112233", "noa@example.com");
    send();
    await waitFor(() => expect(screen.getByText(S.phone_invalid)).toBeInTheDocument());
    expect(screen.queryByText(/SERVER-TEXT/)).toBeNull();
  });

  it("422 naming no form field → the generic banner, never silence", async () => {
    api.post.mockRejectedValue({ response: { status: 422, data: { detail: [{ loc: ["body"], msg: "bad body" }] } } });
    openForm();
    fill("נועה כהן", "050-1112233", "noa@example.com");
    send();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(S.generic));
  });
});

/**
 * MEH-3040 — the form could be opened and never closed again (Sapir's
 * screenshot, 13/11). Option ב: × in the card on a desktop width, a
 * full-screen sheet with × on a phone, and a sticky phone bar while the
 * inline action is off screen.
 */
describe("MEH-3040 — open and close", () => {
  // The window width the sheet decision reads (matchMedia "(min-width: 1024px)").
  const realMm = window.matchMedia;
  const width = (desktop) => {
    window.matchMedia = (q) => ({ matches: desktop, media: q, addEventListener() {}, removeEventListener() {} });
  };
  const phoneWidth = () => width(false);
  beforeEach(() => width(true));
  afterEach(() => { window.matchMedia = realMm; });

  it("desktop: × closes the form and brings the button back, focused", async () => {
    cta({ method: "site_form", phone: null });
    fireEvent.click(screen.getByTestId("registration-open"));
    expect(screen.getByTestId("registration-form")).toBeInTheDocument();
    expect(screen.queryByTestId("registration-sheet")).toBeNull();
    const close = screen.getByTestId("registration-close");
    expect(close.getAttribute("aria-label")).toBe(he.common.aria.close);
    fireEvent.click(close);
    expect(screen.queryByTestId("registration-form")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("registration-open")));
  });

  it("phone: the form opens in a full-screen dialog; × closes it and unlocks the page", () => {
    phoneWidth();
    cta({ method: "site_form", phone: "050-1234567" });
    fireEvent.click(screen.getByTestId("registration-open"));
    const sheet = screen.getByTestId("registration-sheet");
    expect(sheet.getAttribute("role")).toBe("dialog");
    expect(sheet.getAttribute("aria-modal")).toBe("true");
    expect(sheet.querySelector('[data-testid="registration-form"]')).not.toBeNull();
    expect(sheet.querySelector('[data-testid="registration-question"]')).not.toBeNull();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByTestId("registration-sheet-close"));
    expect(screen.queryByTestId("registration-sheet")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("phone: Escape closes the sheet", () => {
    phoneWidth();
    cta({ method: "site_form", phone: null });
    fireEvent.click(screen.getByTestId("registration-open"));
    expect(screen.getByTestId("registration-sheet")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("registration-sheet")).toBeNull();
  });

  it("phone: a sign-up inside the sheet confirms there, and the card keeps it after closing", async () => {
    phoneWidth();
    api.post.mockResolvedValueOnce({ data: {} });
    cta({ method: "site_form", phone: null });
    fireEvent.click(screen.getByTestId("registration-open"));
    fireEvent.change(document.getElementById("signup-name"), { target: { value: "נועה" } });
    fireEvent.change(document.getElementById("signup-phone"), { target: { value: "0521234567" } });
    fireEvent.change(document.getElementById("signup-email"), { target: { value: "a@example.com" } });
    fireEvent.click(screen.getByTestId("registration-submit"));
    const ok = await screen.findByTestId("registration-success");
    expect(screen.getByTestId("registration-sheet").contains(ok)).toBe(true);
    fireEvent.click(screen.getByTestId("registration-sheet-close"));
    expect(screen.getAllByTestId("registration-success")).toHaveLength(1);
    expect(screen.queryByTestId("registration-open")).toBeNull();
  });
});

describe("MEH-3040 — sticky phone bar", () => {
  let fire;
  beforeEach(() => {
    window.IntersectionObserver = class {
      constructor(cb) { fire = (isIntersecting) => act(() => cb([{ isIntersecting }])); }
      observe() {}
      disconnect() {}
    };
  });
  afterEach(() => { delete window.IntersectionObserver; });

  it("shows only while the inline action is off screen, with the date note", () => {
    cta({ method: "site_form", phone: null, barNote: "ו׳, 21.11 · 10:00" });
    expect(screen.queryByTestId("registration-bar")).toBeNull();
    fire(false);
    const bar = screen.getByTestId("registration-bar");
    expect(bar.textContent).toContain("ו׳, 21.11 · 10:00");
    expect(screen.getByTestId("registration-bar-action").textContent).toBe(C.signup_experience);
    fire(true);
    expect(screen.queryByTestId("registration-bar")).toBeNull();
  });

  it("site_form: the bar's button opens the sheet", () => {
    cta({ method: "site_form", phone: null });
    fire(false);
    fireEvent.click(screen.getByTestId("registration-bar-action"));
    expect(screen.getByTestId("registration-sheet")).toBeInTheDocument();
    expect(screen.queryByTestId("registration-bar")).toBeNull();
  });

  it("whatsapp: the bar carries the same link as the card", () => {
    cta({ method: "whatsapp", phone: "050-1234567" });
    fire(false);
    expect(screen.getByTestId("registration-bar-action").getAttribute("href")).toBe(
      screen.getByTestId("registration-whatsapp").getAttribute("href"),
    );
  });

  it("full with no waitlist, or no channel at all → no bar", () => {
    const { unmount } = cta({ method: "site_form", phone: null, isFull: true });
    fire(false);
    expect(screen.queryByTestId("registration-bar")).toBeNull();
    unmount();
    cta({ method: "whatsapp", phone: null });
    expect(screen.queryByTestId("registration-bar")).toBeNull();
  });
});
