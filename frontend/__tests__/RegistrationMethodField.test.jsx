/**
 * MEH-2766 — «איך נרשמים?» in the owner's event / workshop forms.
 *
 * What these pin, each against the behaviour the server enforces
 * (backend/app/services/registrations.py::method_problem):
 *   - a new item starts on «טופס הרשמה באתר» (the approved default);
 *   - WhatsApp can't be picked without an Israeli MOBILE (a landline opened
 *     wa.me with no recipient — the bug that started MEH-2762);
 *   - phone can't be picked with no phone at all;
 *   - nothing is disabled before /producers/me answers (no flash-off);
 *   - the URL box exists only for the external link, an empty one blocks
 *     submit, and a stale URL is never sent with another method.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import RegistrationMethodField from "@/components/RegistrationMethodField";
import EventForm from "@/components/EventForm";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));
vi.mock("@/components/CitySearch", () => ({
  default: ({ id, value, onChange }) => (
    <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock("@/components/AddressSearch", () => ({
  default: ({ id, value, onChange }) => (
    <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const R = he.registration.form;

function wrap(ui) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function field(props = {}) {
  return wrap(
    <RegistrationMethodField
      value="site_form"
      onChange={() => {}}
      url=""
      onUrlChange={() => {}}
      {...props}
    />,
  );
}

const radio = (key) => document.getElementById(`registration_method_${key}`);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RegistrationMethodField", () => {
  it("shows the four approved options under «איך נרשמים?»", async () => {
    api.get.mockResolvedValue({ data: { phone: "050-1234567" } });
    field();
    expect(screen.getByText(R.legend)).toBeInTheDocument();
    for (const k of ["site_form", "whatsapp", "phone", "external_url"]) {
      expect(screen.getByText(R[k])).toBeInTheDocument();
    }
    expect(screen.getByText(R.site_form_hint)).toBeInTheDocument();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/producers/me"));
  });

  it("a mobile number enables WhatsApp and phone", async () => {
    api.get.mockResolvedValue({ data: { phone: "050-1234567" } });
    field();
    await waitFor(() => expect(screen.getByText(R.whatsapp_hint)).toBeInTheDocument());
    expect(radio("whatsapp")).not.toBeDisabled();
    expect(radio("phone")).not.toBeDisabled();
  });

  it("a landline disables WhatsApp, keeps phone, and says why", async () => {
    api.get.mockResolvedValue({ data: { phone: "04-6543210" } });
    field();
    await waitFor(() => expect(radio("whatsapp")).toBeDisabled());
    expect(screen.getByText(R.whatsapp_needs_mobile)).toBeInTheDocument();
    expect(radio("phone")).not.toBeDisabled();
  });

  it("no phone at all disables both and says why", async () => {
    api.get.mockResolvedValue({ data: { phone: null } });
    field();
    await waitFor(() => expect(radio("phone")).toBeDisabled());
    expect(radio("whatsapp")).toBeDisabled();
    expect(screen.getByText(R.phone_needs_phone)).toBeInTheDocument();
  });

  it("nothing is disabled while /producers/me is still loading or the network failed", async () => {
    let reject;
    api.get.mockReturnValue(new Promise((_, r) => (reject = r)));
    field();
    expect(radio("whatsapp")).not.toBeDisabled();
    expect(radio("phone")).not.toBeDisabled();
    await act(async () => reject(new Error("Network Error")));
    expect(radio("whatsapp")).not.toBeDisabled();
    expect(radio("phone")).not.toBeDisabled();
  });

  it("an account with no business (404) disables WhatsApp and phone and says why", async () => {
    api.get.mockRejectedValue({ response: { status: 404 } });
    field();
    await waitFor(() => expect(radio("phone")).toBeDisabled());
    expect(radio("whatsapp")).toBeDisabled();
    expect(screen.getByText(R.phone_needs_phone)).toBeInTheDocument();
  });

  it("the URL box shows only for the external link", () => {
    api.get.mockResolvedValue({ data: { phone: "" } });
    const { unmount } = field({ value: "site_form" });
    expect(document.getElementById("registration_url")).toBeNull();
    unmount();
    field({ value: "external_url" });
    expect(document.getElementById("registration_url")).not.toBeNull();
  });
});

describe("EventForm × «איך נרשמים?»", () => {
  function fillRequired() {
    fireEvent.change(document.getElementById("title"), { target: { value: "יום פתוח" } });
    fireEvent.change(document.getElementById("event_date"), { target: { value: "2026-12-01" } });
    fireEvent.change(document.getElementById("category"), { target: { value: "שוק" } });
    fireEvent.change(document.getElementById("city"), { target: { value: "תל אביב" } });
  }
  const submit = () => fireEvent.click(screen.getByText(he.sweep_tail.event_new.submit));

  it("a new event starts on the on-site form and sends it", async () => {
    api.get.mockResolvedValue({ data: { phone: "050-1234567" } });
    api.post.mockResolvedValue({ data: { id: 1 } });
    wrap(<EventForm />);
    expect(radio("site_form")).toBeChecked();
    fillRequired();
    submit();
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const payload = api.post.mock.calls[0][1];
    expect(payload.registration_method).toBe("site_form");
    expect(payload.registration_url).toBeNull();
  });

  it("external link with no URL blocks submit with the approved message", () => {
    api.get.mockResolvedValue({ data: { phone: "" } });
    wrap(<EventForm />);
    fillRequired();
    fireEvent.click(radio("external_url"));
    submit();
    expect(screen.getByText(R.external_needs_url)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("switching away from the external link drops the old URL from the payload", async () => {
    api.get.mockResolvedValue({ data: { phone: "050-1234567" } });
    api.put.mockResolvedValue({ data: { id: 7 } });
    wrap(
      <EventForm
        mode="edit"
        initial={{
          id: 7,
          title: "יום פתוח",
          event_date: "2026-12-01",
          category: "שוק",
          city: "תל אביב",
          registration_method: "external_url",
          registration_url: "https://example.com/old",
        }}
      />,
    );
    expect(radio("external_url")).toBeChecked();
    fireEvent.click(radio("site_form"));
    fireEvent.click(screen.getByText(he.sweep_tail.event_new.save));
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    const payload = api.put.mock.calls[0][1];
    expect(payload.registration_method).toBe("site_form");
    expect(payload.registration_url).toBeNull();
  });
});
