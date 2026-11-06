/**
 * MEH-2768 — the public sign-up CTA, one cell per «איך נרשמים?» method, plus
 * the channel-missing cells (the recipient-less wa.me that started MEH-2762)
 * and the on-site form's submit / 409 / 422 paths.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
  it("whatsapp + mobile → «הרשמה ב-WhatsApp» to that number", () => {
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

  it("422 → the message lands on its own field", async () => {
    api.post.mockRejectedValue({
      response: { status: 422, data: { detail: [{ loc: ["body", "name"], msg: "Value error, שדה זה חייב להכיל לפחות 2 אותיות" }] } },
    });
    openForm();
    fill("א1", "050-1112233", "noa@example.com");
    send();
    await waitFor(() => expect(screen.getByText("שדה זה חייב להכיל לפחות 2 אותיות")).toBeInTheDocument());
  });
});
