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
        cta: `תודיעו לי כשתגיעו ל${city}`,
        email_label: "המייל שלך",
        email_placeholder: "name@example.com",
        submit: "עדכנו אותי",
        sending: "שולחים…",
        done: `נודיע לך כשיגיעו ל${city}`,
        error: "משהו השתבש, נסי שוב",
        whatsapp_hint: "רוצה גם בוואטסאפ?",
      };
      return map[key] ?? key;
    }
    if (ns === "whatsapp.question_chips") return key;
    if (key === "checker.yes") return `כן, מגיעים ל${city}`;
    if (key === "checker.no") return `לצערנו לא מגיעים ל${city} כרגע`;
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

  it("offers «תודיעו לי» for the city the verdict names", async () => {
    setup();
    commitCity("נתניה");
    await waitFor(() => expect(form()).toBeTruthy());
    expect(form().dataset.phase).toBe("idle");
    expect(screen.getByTestId("delivery-waitlist-cta").textContent).toBe(
      "תודיעו לי כשתגיעו לנתניה",
    );
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
    expect(screen.getByTestId("delivery-waitlist-cta").textContent).toBe(
      "תודיעו לי כשתגיעו לאשדוד",
    );
  });
});
