/**
 * MEH-2013 — the two fields ExperienceForm labelled `*` and enforced nowhere.
 *
 * Before this change the form shipped `EMPTY.location_type = "home"` and no
 * `city` rule at all, so:
 *   - "סוג מיקום *" passed without the owner ever choosing, always toward
 *     "בבית פרטי"
 *   - "עיר *" could be submitted empty, and the resulting experience never
 *     matched the /experiences city filter — invisible on the discovery axis
 *
 * Each assertion below is written to red against that shape, and the two
 * "still allowed" cases exist so the guard cannot pass by rejecting everything:
 *   - a preselected pill is detected via the selected *styling*, not via
 *     `aria-pressed` — the old markup had no aria-pressed at all, so an
 *     aria-only assertion would have gone red for the wrong reason (MEH-1619:
 *     the construction has to discriminate)
 *   - focus reaching the pill row / city input proves both keys landed in
 *     EXPERIENCE_FIELD_ORDER *and* EXPERIENCE_FIELD_ID; a missing entry makes
 *     `document.getElementById(undefined)` a no-op and focus stays on <body>
 *
 * REUSES: __tests__/ExperienceFormSubmitValidation.test.jsx (harness shape).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ExperienceForm from "@/components/ExperienceForm";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(() => new Promise(() => {})), put: vi.fn() },
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

const T = he.experiences.new;

function renderForm(props = {}) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ExperienceForm {...props} />
    </NextIntlClientProvider>,
  );
}

const submitButton = () => screen.getByRole("button", { name: T.submit_cta });
const pill = (name) => screen.getByRole("button", { name });

/** Everything required EXCEPT location_type and city. */
function fillEverythingElse() {
  fireEvent.change(document.getElementById("experience-title"), {
    target: { value: "סדנת גבינות" },
  });
  fireEvent.change(document.getElementById("experience-description"), {
    target: { value: "סדנה בת שלוש שעות להכנת גבינות עיזים מחלב טרי מהרפת שלנו" },
  });
  fireEvent.change(document.getElementById("experience-date"), {
    target: { value: "2026-09-01" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ExperienceForm — location_type is a real choice (MEH-2013)", () => {
  it("a fresh form preselects neither pill", () => {
    renderForm();

    // The selected pill is the one painted `bg-primary`. Asserting on the
    // styling (not on aria) is what makes this red against the old default.
    expect(pill(T.location_home).className).not.toMatch(/bg-primary/);
    expect(pill(T.location_public).className).not.toMatch(/bg-primary/);
    expect(pill(T.location_home)).toHaveAttribute("aria-pressed", "false");
    expect(pill(T.location_public)).toHaveAttribute("aria-pressed", "false");
  });

  it("submitting with no location type chosen is blocked with a Hebrew error", () => {
    renderForm();
    fillEverythingElse();
    fireEvent.change(document.getElementById("experience-city"), {
      target: { value: "תל אביב" },
    });

    fireEvent.click(submitButton());

    expect(screen.getByText(T.error_location_type_required)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalledWith("/experiences", expect.anything());
  });

  it("the pill row is reachable by first-invalid focus", () => {
    renderForm();
    fillEverythingElse();
    fireEvent.change(document.getElementById("experience-city"), {
      target: { value: "תל אביב" },
    });

    fireEvent.click(submitButton());

    // Not <body>: proves location_type is in BOTH the order list and the id map.
    expect(document.activeElement).toBe(
      document.getElementById("experience-location-type"),
    );
  });

  it("choosing a pill selects it and clears its error", () => {
    renderForm();
    fillEverythingElse();
    fireEvent.click(submitButton());
    expect(screen.getByText(T.error_location_type_required)).toBeInTheDocument();

    fireEvent.click(pill(T.location_public));

    expect(screen.queryByText(T.error_location_type_required)).not.toBeInTheDocument();
    expect(pill(T.location_public)).toHaveAttribute("aria-pressed", "true");
    expect(pill(T.location_home)).toHaveAttribute("aria-pressed", "false");
  });

  it("the location error is wired to the pill group, not left as loose text", () => {
    // MEH-1809's standard for this form: an error is announced with its
    // control, not merely rendered near it. Adversarial-review finding on
    // this PR — the first version rendered the message with nothing pointing
    // at it. The group is named by a <span>, never a <label htmlFor>: a
    // <button> is labelable, so a label would make a click on the words
    // "סוג מיקום" select the first pill.
    renderForm();
    fillEverythingElse();
    fireEvent.click(submitButton());

    const group = screen.getByRole("group", { name: T.field_location_type });
    const describedBy = group.getAttribute("aria-describedby");
    expect(document.getElementById(describedBy)).toHaveTextContent(
      T.error_location_type_required,
    );
    // The group's name must not come from a <label for> aimed at a pill.
    expect(document.querySelector('label[for="experience-location-type"]')).toBeNull();
  });

  it("edit mode seeds the stored choice — this is not a blanket reset", () => {
    renderForm({ mode: "edit", initial: { id: "x", location_type: "public", city: "חיפה" } });

    expect(pill(T.location_public)).toHaveAttribute("aria-pressed", "true");
  });
});

describe("ExperienceForm — the city asterisk is enforced (MEH-2013)", () => {
  it("submitting with an empty city is blocked with a Hebrew error", () => {
    renderForm();
    fillEverythingElse();
    fireEvent.click(pill(T.location_home));

    fireEvent.click(submitButton());

    expect(screen.getByText(T.error_city_required)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalledWith("/experiences", expect.anything());
  });

  it("a whitespace-only city does not satisfy the requirement", () => {
    renderForm();
    fillEverythingElse();
    fireEvent.click(pill(T.location_home));
    fireEvent.change(document.getElementById("experience-city"), {
      target: { value: "   " },
    });

    fireEvent.click(submitButton());

    expect(screen.getByText(T.error_city_required)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalledWith("/experiences", expect.anything());
  });

  it("the city input is reachable by first-invalid focus", () => {
    renderForm();
    fillEverythingElse();
    fireEvent.click(pill(T.location_home));

    fireEvent.click(submitButton());

    expect(document.activeElement).toBe(document.getElementById("experience-city"));
  });

  it("typing a city clears its error and leaves the others alone", () => {
    renderForm();
    fireEvent.click(submitButton());
    expect(screen.getByText(T.error_city_required)).toBeInTheDocument();

    fireEvent.change(document.getElementById("experience-city"), {
      target: { value: "תל אביב" },
    });

    expect(screen.queryByText(T.error_city_required)).not.toBeInTheDocument();
    expect(screen.getByText(T.error_title_short)).toBeInTheDocument();
  });

  it("a complete submit posts a trimmed city and the chosen location type", () => {
    renderForm();
    fillEverythingElse();
    fireEvent.click(pill(T.location_public));
    fireEvent.change(document.getElementById("experience-city"), {
      target: { value: "  תל אביב  " },
    });

    fireEvent.click(submitButton());

    expect(api.post).toHaveBeenCalledWith(
      "/experiences",
      expect.objectContaining({ city: "תל אביב", location_type: "public" }),
    );
  });
});

describe("ExperienceForm — price copy is neutral plural (ADR-024, MEH-2013)", () => {
  it("no longer addresses one woman", () => {
    // 'השאירי' was the only gendered verb in a form that says 'ספרו' / 'חפשו'.
    expect(T.field_price).not.toMatch(/השאירי/);
    expect(T.field_price).toMatch(/השאירו/);
  });
});
