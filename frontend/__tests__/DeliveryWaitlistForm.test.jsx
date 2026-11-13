import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// MEH-2618: «תודיעו לי כשתגיעו ל{עיר}». Like CoverageRequestCta.test.jsx, the
// form lives on ONE state only — the checker's negative verdict — so most
// cases drive DeliveryChecker and assert the form follows the verdict.
// States: absent (yes / no verdict yet) · idle · open (guest, empty email) ·
// open (signed-in, prefilled) · done after 201 · done after 200 "exists" ·
// error keeps the form · city change resets the form.

vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key, vars) => {
    const city = vars?.city ?? "";
    if (ns === "group_buys.delivery.waitlist") {
      const map = {
        cta: "תודיעו לי כשתגיעו",
        email_label: "המייל שלך",
        email_placeholder: "name@example.com",
        submit: "עדכנו אותי",
        sending: "שולחים…",
        done: `נודיע לך כשיגיעו ל${city}`,
        error: "משהו השתבש, אפשר לנסות שוב",
        whatsapp_hint: "רוצים גם בוואטסאפ?",
        host_label: `אשמח לארח נקודת מסירה ב${city}`,
        host_hint: "נשלח לכם מייל לאישור, ורק אחרי האישור המייל שלכם יועבר לבית העסק.",
        host_sent: "שלחנו לכם מייל לאישור האירוח.",
        host_already_sent: "כבר שלחנו לכם מייל לאישור האירוח. בדקו בתיבת הדואר (גם בספאם).",
        host_limit_reached: "נשלחו היום כבר כמה מיילים לכתובת הזאת. אפשר לנסות שוב מחר.",
      };
      return map[key] ?? key;
    }
    if (ns === "whatsapp.question_chips") return key;
    if (key === "checker.yes") return `כן, מגיעים ל${city}`;
    if (key === "checker.no") return `עדיין לא מגיעים ל${city}`;
    const map = {
      "checker.label": "מגיעים אלייך?",
      "checker.placeholder": "הקלידי עיר",
      placeholder: "עיר",
      clear_aria: "ניקוי",
    };
    return map[key] ?? key;
  },
}));

vi.mock("@phosphor-icons/react", () => {
  const Stub = () => <span />;
  return {
    CheckCircle: Stub,
    XCircle: Stub,
    ChatCircle: Stub,
    BellRinging: Stub,
    X: Stub,
  };
});

const post = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: (...a) => post(...a),
  },
}));
vi.mock("@/lib/contact-tracking", () => ({ pingWhatsAppBeacon: vi.fn() }));

const authState = vi.hoisted(() => ({ value: null }));
vi.mock("@/lib/auth-context", () => ({
  useOptionalAuth: () => authState.value,
}));

import DeliveryChecker from "@/components/DeliveryChecker";
import DeliveryWaitlistForm from "@/components/DeliveryWaitlistForm";

const PRODUCER = {
  id: "11111111-1111-1111-1111-111111111111",
  phone: "050-1234567",
};
const AREAS = [{ id: 1, city: "חיפה" }];

function setup(props) {
  return render(
    <DeliveryChecker
      offersDelivery
      nationwide={false}
      excluded={[]}
      areas={AREAS}
      producer={PRODUCER}
      {...props}
    />,
  );
}

function commitCity(value) {
  fireEvent.change(screen.getByRole("combobox"), { target: { value } });
  fireEvent.mouseDown(screen.getByRole("option", { name: value }));
}

const form = () => screen.queryByTestId("delivery-waitlist");

beforeEach(() => {
  localStorage.clear();
  post.mockReset();
  authState.value = null;
});

describe("DeliveryWaitlistForm on the checker's negative verdict (MEH-2618)", () => {
  it("is absent before a city is committed and on a YES", async () => {
    setup();
    expect(form()).toBeNull();
    commitCity("חיפה");
    await waitFor(() =>
      expect(screen.getByText("כן, מגיעים לחיפה")).toBeTruthy(),
    );
    expect(form()).toBeNull();
  });

  // MEH-2709: the chip no longer repeats the city — the verdict right above
  // it already names it, and saying it twice was the complaint.
  it("offers «תודיעו לי» under the verdict, which alone names the city", async () => {
    setup();
    commitCity("נתניה");
    await waitFor(() => expect(form()).toBeTruthy());
    expect(form().dataset.phase).toBe("idle");
    expect(screen.getByTestId("delivery-waitlist-cta").textContent).toBe(
      "תודיעו לי כשתגיעו",
    );
    const box = screen.getByTestId("delivery-checker-result").textContent;
    expect(box.split("נתניה").length - 1).toBe(1);
  });

  // MEH-2709: the chips are ordered in the DOM (not with CSS `order`), so
  // the tab / screen-reader order is the order seen: waitlist, then WhatsApp.
  it("puts the waitlist chip before the WhatsApp chip in DOM order", async () => {
    setup();
    commitCity("נתניה");
    await waitFor(() => expect(form()).toBeTruthy());
    const row = screen.getByTestId("delivery-checker-no-actions");
    const ids = [...row.children].map((el) => el.dataset.testid);
    expect(ids).toEqual(["delivery-waitlist", "coverage-request-cta"]);
  });

  // MEH-2709: the chips drop the city on screen, so each one is described by
  // the verdict line — a screen reader still hears "…לנתניה".
  it("describes both chips with the verdict line that names the city", async () => {
    setup();
    commitCity("נתניה");
    await waitFor(() => expect(form()).toBeTruthy());
    for (const id of ["delivery-waitlist-cta", "coverage-request-link"]) {
      const ref = screen.getByTestId(id).getAttribute("aria-describedby");
      expect(ref).toBeTruthy();
      expect(document.getElementById(ref).textContent).toContain("נתניה");
    }
  });

  it("guest: opens an empty email field and posts email + city, then confirms", async () => {
    post.mockResolvedValue({ status: 201, data: { status: "added" } });
    setup();
    commitCity("נתניה");
    await waitFor(() => expect(form()).toBeTruthy());
    fireEvent.click(screen.getByTestId("delivery-waitlist-cta"));
    const input = screen.getByTestId("delivery-waitlist-email");
    expect(input.value).toBe("");
    fireEvent.change(input, { target: { value: " Dana@Example.com " } });
    fireEvent.click(screen.getByTestId("delivery-waitlist-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("delivery-waitlist-done")).toBeTruthy(),
    );
    expect(post).toHaveBeenCalledWith(
      `/producers/${PRODUCER.id}/delivery-waitlist`,
      {
        email: "Dana@Example.com",
        city: "נתניה",
      },
    );
    expect(screen.getByTestId("delivery-waitlist-done").textContent).toContain(
      "נודיע לך כשיגיעו לנתניה",
    );
    // A guest has no favorite-alert panel to be pointed at.
    expect(screen.queryByTestId("delivery-waitlist-whatsapp-hint")).toBeNull();
  });

  it("signed-in: prefills her email and points at WhatsApp alerts after", async () => {
    authState.value = { user: { id: "u1", email: "member@example.com" } };
    post.mockResolvedValue({ status: 201, data: { status: "added" } });
    setup();
    commitCity("נתניה");
    await waitFor(() => expect(form()).toBeTruthy());
    fireEvent.click(screen.getByTestId("delivery-waitlist-cta"));
    expect(screen.getByTestId("delivery-waitlist-email").value).toBe(
      "member@example.com",
    );
    fireEvent.click(screen.getByTestId("delivery-waitlist-submit"));
    await waitFor(() =>
      expect(
        screen.getByTestId("delivery-waitlist-whatsapp-hint"),
      ).toBeTruthy(),
    );
  });

  it("'exists' (200) lands on the same confirmation as a new entry", async () => {
    post.mockResolvedValue({ status: 200, data: { status: "exists" } });
    render(<DeliveryWaitlistForm producer={PRODUCER} city="נתניה" />);
    fireEvent.click(screen.getByTestId("delivery-waitlist-cta"));
    fireEvent.change(screen.getByTestId("delivery-waitlist-email"), {
      target: { value: "a@b.co" },
    });
    fireEvent.click(screen.getByTestId("delivery-waitlist-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("delivery-waitlist-done")).toBeTruthy(),
    );
  });

  it("a failed post keeps the form open with the error line", async () => {
    post.mockRejectedValue(new Error("network"));
    render(<DeliveryWaitlistForm producer={PRODUCER} city="נתניה" />);
    fireEvent.click(screen.getByTestId("delivery-waitlist-cta"));
    fireEvent.change(screen.getByTestId("delivery-waitlist-email"), {
      target: { value: "a@b.co" },
    });
    fireEvent.click(screen.getByTestId("delivery-waitlist-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("delivery-waitlist-error")).toBeTruthy(),
    );
    expect(screen.getByTestId("delivery-waitlist-email").value).toBe("a@b.co");
    expect(screen.queryByTestId("delivery-waitlist-done")).toBeNull();
  });

  it("renders nothing without a producer id or a city", () => {
    const { container } = render(
      <DeliveryWaitlistForm producer={null} city="נתניה" />,
    );
    expect(container.innerHTML).toBe("");
    const second = render(
      <DeliveryWaitlistForm producer={PRODUCER} city="  " />,
    );
    expect(second.container.innerHTML).toBe("");
  });

  it("a new negative verdict for another city resets the form", async () => {
    post.mockResolvedValue({ status: 201, data: { status: "added" } });
    setup();
    commitCity("נתניה");
    await waitFor(() => expect(form()).toBeTruthy());
    fireEvent.click(screen.getByTestId("delivery-waitlist-cta"));
    fireEvent.change(screen.getByTestId("delivery-waitlist-email"), {
      target: { value: "a@b.co" },
    });
    fireEvent.click(screen.getByTestId("delivery-waitlist-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("delivery-waitlist-done")).toBeTruthy(),
    );
    commitCity("אשדוד");
    await waitFor(() =>
      expect(screen.getByTestId("delivery-waitlist-cta")).toBeTruthy(),
    );
    expect(form().dataset.phase).toBe("idle");
    expect(screen.getByTestId("delivery-checker-result").textContent).toContain(
      "עדיין לא מגיעים לאשדוד",
    );
  });
});

// MEH-2674: «אשמח לארח נקודת מסירה ב{עיר}». Box unticked by default and
// absent from the payload; ticked → wants_to_host: true and ONE extra line
// under «נודיע לך» chosen by the server's host_confirm. Each value is its own
// case (sent / already_sent / limit_reached / confirmed / absent).
describe("DeliveryWaitlistForm host checkbox (MEH-2674)", () => {
  function openForm() {
    render(<DeliveryWaitlistForm producer={PRODUCER} city="נתניה" />);
    fireEvent.click(screen.getByTestId("delivery-waitlist-cta"));
    fireEvent.change(screen.getByTestId("delivery-waitlist-email"), {
      target: { value: "a@b.co" },
    });
  }
  async function submitAndWaitDone() {
    fireEvent.click(screen.getByTestId("delivery-waitlist-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("delivery-waitlist-done")).toBeTruthy(),
    );
  }
  const hostLine = () => screen.queryByTestId("delivery-waitlist-host-status");

  it("unticked by default, names the city, says the mail step, sends no flag", async () => {
    post.mockResolvedValue({ status: 201, data: { status: "added", host_confirm: null } });
    openForm();
    const box = screen.getByTestId("delivery-waitlist-host");
    expect(box.checked).toBe(false);
    expect(screen.getByText("אשמח לארח נקודת מסירה בנתניה")).toBeTruthy();
    expect(screen.getByTestId("delivery-waitlist-host-hint").textContent).toBe(
      "נשלח לכם מייל לאישור, ורק אחרי האישור המייל שלכם יועבר לבית העסק.",
    );
    await submitAndWaitDone();
    expect(post.mock.calls[0][1]).toEqual({ email: "a@b.co", city: "נתניה" });
    expect(hostLine()).toBeNull();
  });

  it("ticked → wants_to_host:true; `sent` adds «שלחנו לכם מייל»", async () => {
    post.mockResolvedValue({ status: 201, data: { status: "added", host_confirm: "sent" } });
    openForm();
    fireEvent.click(screen.getByTestId("delivery-waitlist-host"));
    await submitAndWaitDone();
    expect(post.mock.calls[0][1]).toEqual({
      email: "a@b.co",
      city: "נתניה",
      wants_to_host: true,
    });
    expect(hostLine().textContent).toBe("שלחנו לכם מייל לאישור האירוח.");
    expect(hostLine().dataset.hostConfirm).toBe("sent");
  });

  it("`already_sent` → check your inbox, not «we sent»", async () => {
    post.mockResolvedValue({ status: 200, data: { status: "exists", host_confirm: "already_sent" } });
    openForm();
    fireEvent.click(screen.getByTestId("delivery-waitlist-host"));
    await submitAndWaitDone();
    expect(hostLine().textContent).toBe(
      "כבר שלחנו לכם מייל לאישור האירוח. בדקו בתיבת הדואר (גם בספאם).",
    );
  });

  it("`limit_reached` → try again tomorrow, never «check your inbox»", async () => {
    post.mockResolvedValue({ status: 201, data: { status: "added", host_confirm: "limit_reached" } });
    openForm();
    fireEvent.click(screen.getByTestId("delivery-waitlist-host"));
    await submitAndWaitDone();
    expect(hostLine().textContent).toBe(
      "נשלחו היום כבר כמה מיילים לכתובת הזאת. אפשר לנסות שוב מחר.",
    );
    expect(hostLine().textContent).not.toContain("בדקו");
  });

  it("`confirmed` and an unknown shape both add no line", async () => {
    post.mockResolvedValue({ status: 200, data: { status: "exists", host_confirm: "confirmed" } });
    openForm();
    fireEvent.click(screen.getByTestId("delivery-waitlist-host"));
    await submitAndWaitDone();
    expect(hostLine()).toBeNull();
    // Unknown value from a future backend → calm line alone, no crash.
    post.mockResolvedValue({ status: 200, data: { status: "exists", host_confirm: "something_new" } });
    const second = render(<DeliveryWaitlistForm producer={{ id: "22222222-2222-2222-2222-222222222222" }} city="חדרה" />);
    fireEvent.click(second.getByTestId("delivery-waitlist-cta"));
    fireEvent.change(second.getByTestId("delivery-waitlist-email"), { target: { value: "c@d.co" } });
    fireEvent.click(second.getByTestId("delivery-waitlist-host"));
    fireEvent.click(second.getByTestId("delivery-waitlist-submit"));
    await waitFor(() => expect(second.getByTestId("delivery-waitlist-done")).toBeTruthy());
    expect(second.queryByTestId("delivery-waitlist-host-status")).toBeNull();
  });
});

// MEH-3041 — the open form could not be closed (Sapir 13/11).
describe("MEH-3041 — × closes the open form", () => {
  it("open → × → back to the chip, focused, nothing sent", async () => {
    authState.value = null;
    render(<DeliveryWaitlistForm producer={PRODUCER} city="נתניה" />);
    fireEvent.click(screen.getByTestId("delivery-waitlist-cta"));
    expect(screen.getByTestId("delivery-waitlist").getAttribute("data-phase")).toBe("open");
    const close = screen.getByTestId("delivery-waitlist-close");
    expect(close.getAttribute("aria-label")).toBeTruthy();
    fireEvent.click(close);
    expect(screen.getByTestId("delivery-waitlist").getAttribute("data-phase")).toBe("idle");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("delivery-waitlist-cta")));
    expect(post).not.toHaveBeenCalled();
  });
});
