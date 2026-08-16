/**
 * MEH-2022 — the city error both forms already RENDER is now ASSOCIATED:
 * CitySearch forwards aria-describedby / aria-invalid to its <input>, and
 * EventForm + ExperienceForm point them at their existing error spans.
 *
 * The absence half of every case is load-bearing (the card's own DoD): a
 * guard that only checks presence passes an implementation that always emits
 * the attributes, error or not — which would have the input referencing a
 * nonexistent id in the healthy state. So each form asserts the attributes
 * are ABSENT before the error exists, present while it does, and (EventForm)
 * absent again once the field is corrected.
 *
 * DISCRIMINATION (testing.md, MEH-1619): against the pre-change components —
 * CitySearch without the passthrough, forms without the props — the three
 * "associated while invalid" cases red on `aria-describedby` being null;
 * every absence case passes on both versions and is labelled a control.
 * The construction runs are in the PR body.
 *
 * Unlike EventFormSubmitValidation / EventFormImageAccessibility, CitySearch
 * is NOT mocked here — its forwarding is the subject under test.
 *
 * REUSES: __tests__/EventFormSubmitValidation.test.jsx (submit harness shape).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import CitySearch from "@/components/CitySearch";
import EventForm from "@/components/EventForm";
import ExperienceForm from "@/components/ExperienceForm";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));

vi.mock("@/components/AddressSearch", () => ({
  default: ({ id, value, onChange }) => (
    <input id={id} value={value || ""} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const T_EVENT = he.sweep_tail.event_new;

beforeEach(() => {
  vi.clearAllMocks();
  // The real CitySearch fetches GET /cities on mount; an unmocked vi.fn()
  // returns undefined and `.then` crashes the mount.
  api.get.mockResolvedValue({ data: [] });
});

function withIntl(ui) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("CitySearch passthrough (unit)", () => {
  it("forwards aria-describedby and aria-invalid to the input", () => {
    withIntl(
      <CitySearch
        id="cs"
        label="עיר"
        value=""
        onChange={() => {}}
        useBackend={false}
        aria-describedby="cs-error"
        aria-invalid={true}
      />,
    );
    const input = document.getElementById("cs");
    expect(input.getAttribute("aria-describedby")).toBe("cs-error");
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  it("omitting them emits NEITHER attribute — existing callers render unchanged (control)", () => {
    withIntl(
      <CitySearch id="cs" label="עיר" value="" onChange={() => {}} useBackend={false} />,
    );
    const input = document.getElementById("cs");
    expect(input.hasAttribute("aria-describedby")).toBe(false);
    expect(input.hasAttribute("aria-invalid")).toBe(false);
  });
});

describe("EventForm — the city error is associated only while it exists", () => {
  it("before submit: no association and no error element (control)", () => {
    withIntl(<EventForm />);
    const input = document.getElementById("city");
    expect(input.hasAttribute("aria-describedby")).toBe(false);
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(document.getElementById("city-error")).toBeNull();
  });

  it("empty submit: aria-describedby resolves to the rendered message text", () => {
    withIntl(<EventForm />);
    fireEvent.click(screen.getByText(T_EVENT.submit));

    const input = document.getElementById("city");
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBe("city-error");
    const message = document.getElementById(describedBy);
    expect(message).not.toBeNull();
    expect(message.textContent).toBe(T_EVENT.error_city_required);
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  it("typing a city clears the error AND the association together", () => {
    withIntl(<EventForm />);
    fireEvent.click(screen.getByText(T_EVENT.submit));
    const input = document.getElementById("city");
    expect(input.getAttribute("aria-describedby")).toBe("city-error");

    fireEvent.change(input, { target: { value: "חיפה" } });

    expect(input.hasAttribute("aria-describedby")).toBe(false);
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(document.getElementById("city-error")).toBeNull();
  });
});

describe("ExperienceForm — same association through the Field wrapper", () => {
  it("before submit: no association (control); empty submit associates the Field's error span", () => {
    withIntl(<ExperienceForm />);
    const input = document.getElementById("experience-city");
    expect(input.hasAttribute("aria-describedby")).toBe(false);

    fireEvent.click(screen.getByText(he.experiences.new.submit_cta));

    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBe("experience-city-error");
    const message = document.getElementById(describedBy);
    expect(message).not.toBeNull();
    expect(message.textContent).toBe(he.experiences.new.error_city_required);
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });
});
