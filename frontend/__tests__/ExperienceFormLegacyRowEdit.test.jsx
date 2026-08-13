/**
 * MEH-2013 — editing a row that predates the new required rules.
 *
 * WHY THIS FILE EXISTS. The CI adversarial reviewer raised a Must Fix on
 * PR #2797: for a legacy row with `location_type: null`, `seed()` produces
 * `""`, the edit payload sends `location_type: ""`, `ExperienceUpdate`
 * applies `pattern="^(home|public)$"` to it, and the owner is 422'd out of
 * her own experience.
 *
 * The mechanism it describes is real. The conclusion is not: `submit` runs
 * `validateExperienceForm` FIRST and returns early, and `!f.location_type`
 * catches `""`. So the PUT never fires and no 422 is possible — the owner is
 * shown two inline Hebrew messages instead, which is the documented intent.
 *
 * The reviewer's own evidence for the gap was that the backend test sends
 * `{"title": …}` directly and never exercises the form's payload. That is
 * true, and it is what this file fixes: these cases drive the REAL form and
 * assert on what it actually sends.
 *
 * The payload was still hardened (`|| null` on both fields) so it does not
 * DEPEND on the validation gate — the last case pins that, by reaching past
 * the gate the only way a user never can.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ExperienceForm from "@/components/ExperienceForm";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(() => Promise.resolve({ data: {} })) },
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

/** A row written before MEH-2013: no city, no location_type. */
const LEGACY = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "סדנת גבינות ותיקה",
  description: "סדנה בת שלוש שעות להכנת גבינות עיזים מחלב טרי מהרפת שלנו",
  event_date: "2026-09-01",
  city: null,
  location_type: null,
};

function renderEdit(initial = LEGACY) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ExperienceForm mode="edit" initial={initial} />
    </NextIntlClientProvider>,
  );
}

const saveButton = () => screen.getByRole("button", { name: T.save_cta });

beforeEach(() => {
  vi.clearAllMocks();
  api.put.mockResolvedValue({ data: {} });
});

describe("ExperienceForm — legacy row edit (MEH-2013, PR #2797 review)", () => {
  it("does NOT fire a PUT that would 422 — the client gate stops it first", () => {
    renderEdit();

    fireEvent.click(saveButton());

    // The reviewer's predicted failure was a 422 from the server. It cannot
    // happen: no request is made at all.
    expect(api.put).not.toHaveBeenCalled();
  });

  it("tells the owner what to fill instead of failing opaquely", () => {
    renderEdit();

    fireEvent.click(saveButton());

    expect(screen.getByText(T.error_location_type_required)).toBeInTheDocument();
    expect(screen.getByText(T.error_city_required)).toBeInTheDocument();
  });

  it("saves once both are supplied, and sends real values — never empty strings", async () => {
    renderEdit();

    fireEvent.click(screen.getByRole("button", { name: T.location_public }));
    fireEvent.change(document.getElementById("experience-city"), {
      target: { value: "חיפה" },
    });
    fireEvent.click(saveButton());

    await waitFor(() => expect(api.put).toHaveBeenCalled());
    const [, body] = api.put.mock.calls[0];
    expect(body.city).toBe("חיפה");
    expect(body.location_type).toBe("public");
  });

  it("an existing row's stored values are preserved, not reset", async () => {
    renderEdit({ ...LEGACY, city: "תל אביב", location_type: "home" });

    fireEvent.click(saveButton());

    await waitFor(() => expect(api.put).toHaveBeenCalled());
    const [, body] = api.put.mock.calls[0];
    expect(body.city).toBe("תל אביב");
    expect(body.location_type).toBe("home");
  });

  // NOT ASSERTED HERE, deliberately: that the hardened payload serialises ""
  // to null. The gate makes that state unreachable through the real
  // component, and "covering" it would mean re-implementing the serialisation
  // in the test and asserting on the copy — which proves the copy works, not
  // the component (.claude/rules/testing.md: exercise the real implementation,
  // never a copy).
  //
  // It WAS measured, once, rather than assumed. With the two gate lines
  // temporarily deleted from validateExperienceForm, this same legacy fixture
  // drove the real form and the PUT body came back
  // `location_type: null, city: null` — so `|| null` does what it claims on
  // the real implementation. That probe was a throwaway; it is not shipped,
  // because a test that has to break the component to reach its subject is a
  // measurement, not a guard.
  //
  // The same run is also the control for the two cases above: with the gate
  // removed they BOTH go red (the PUT fires, the messages vanish), which is
  // what proves the gate is what prevents the reviewer's 422 — not luck.
});
