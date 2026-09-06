/**
 * MEH-2274 (MEH-1494 chunk B, frontend half) — the editor's reason is
 * writable AND readable, and `recommended_at` reports the annual-review state
 * instead of a blank date.
 *
 * The half this closes: since #3446 the backend accepted `recommended_note`
 * and stamped `recommended_at` on the transition, and the admin form offered
 * neither — a value she could write once and never see again.
 *
 * DISCRIMINATION, stated precisely rather than as "10/10 red". Run against the
 * pre-MEH-2274 form all ten go red, but they do NOT all discriminate, and
 * claiming they do would be the failure testing.md names as "a control that
 * fails for the wrong reason":
 *
 *   EIGHT discriminate on their own assertion — no textarea, no hydration key,
 *   no payload key, neither `recommended_at` string rendered.
 *
 *   TWO do not, and cannot: the last two matrix cells assert that NOTHING is
 *   rendered, which is trivially true of a form that renders nothing. They go
 *   red only because their SETUP line cannot find the textarea. They earn
 *   their place as matrix completeness — they fail if a future change starts
 *   showing a stale date on an un-picked business — not as evidence for this
 *   change.
 *
 * THE STATE MATRIX (CLAUDE.md 5-state rule). `recommended_at`'s line is a
 * conditional render over TWO axes, so it is four cells and not two lists:
 *
 *                    | recommended_at set | recommended_at NULL
 *   is_recommended   | the date           | the review string
 *   not recommended  | nothing            | nothing
 *
 * The NULL-and-picked cell is the one that matters and the one an
 * implementation is most likely to get wrong: NULL there is not missing data,
 * it means the pick predates the column, and admin.py's review-due clause
 * counts exactly that row as due. Rendering a blank date would hide a business
 * that IS in the queue.
 *
 * Same harness as AdminProducerForm.test.jsx (real component under
 * NextIntlClientProvider + he.json).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ProducerForm from "@/components/admin/ProducerForm";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const FIELDS = he.admin.producers.form.fields;

/** Minimum a ProducerAdminOut needs for the form to hydrate from it. */
function producer(overrides = {}) {
  return {
    id: "p1",
    name: "מאפיית הגליל",
    city: "צפת",
    categories: [],
    images: [],
    delivery_areas: [],
    is_recommended: false,
    recommended_note: null,
    recommended_at: null,
    ...overrides,
  };
}

function renderForm(initial = null) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ProducerForm initial={initial} producerId={initial ? initial.id : null} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [] }); // GET /categories
  api.put.mockResolvedValue({ data: {} });
});

describe("the note is writable and readable (MEH-2274)", () => {
  it("renders the textarea with its hint and placeholder", async () => {
    renderForm();
    const box = await screen.findByLabelText(FIELDS.recommended_note);
    expect(box.tagName).toBe("TEXTAREA");
    expect(box).toHaveAttribute(
      "placeholder",
      FIELDS.recommended_note_placeholder,
    );
    expect(screen.getByText(FIELDS.recommended_note_hint)).toBeInTheDocument();
  });

  it("caps input at the server's 500 (a 422 after typing is not a UX)", async () => {
    renderForm();
    const box = await screen.findByLabelText(FIELDS.recommended_note);
    expect(box).toHaveAttribute("maxLength", "500");
  });

  it("READS BACK a saved note — the half that was missing", async () => {
    renderForm(producer({ recommended_note: "ראיון 03/2026, טוחנת קמח בעצמה" }));
    const box = await screen.findByLabelText(FIELDS.recommended_note);
    expect(box).toHaveValue("ראיון 03/2026, טוחנת קמח בעצמה");
  });

  it("sends the typed note on save", async () => {
    renderForm(producer());
    const box = await screen.findByLabelText(FIELDS.recommended_note);
    fireEvent.change(box, { target: { value: "בחירה של העורכת, ביקור 09/2026" } });
    fireEvent.submit(box.closest("form"));

    await waitFor(() => expect(api.put).toHaveBeenCalled());
    const [, payload] = api.put.mock.calls[0];
    expect(payload.recommended_note).toBe("בחירה של העורכת, ביקור 09/2026");
    // recommended_at is stamped server-side from the transition; sending it
    // would be a second authority over the same clock.
    expect(payload).not.toHaveProperty("recommended_at");
  });

  it("sends null, not \"\", when the note is cleared", async () => {
    renderForm(producer({ recommended_note: "ישן" }));
    const box = await screen.findByLabelText(FIELDS.recommended_note);
    fireEvent.change(box, { target: { value: "" } });
    fireEvent.submit(box.closest("form"));

    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect(api.put.mock.calls[0][1].recommended_note).toBeNull();
  });

  it("stays visible on an UNPICKED business — the note survives an un-pick", async () => {
    // admin.py does not clear the note on un-pick: it is the record of why.
    // Gating the field on the toggle would make that record unreachable.
    renderForm(producer({ is_recommended: false, recommended_note: "נבחרה ב-2025" }));
    const box = await screen.findByLabelText(FIELDS.recommended_note);
    expect(box).toHaveValue("נבחרה ב-2025");
  });
});

describe("recommended_at — all four cells of the state matrix", () => {
  it("picked + stamped -> the date, not the review string", async () => {
    renderForm(
      producer({ is_recommended: true, recommended_at: "2026-03-14T09:00:00Z" }),
    );
    await screen.findByLabelText(FIELDS.recommended_note);
    expect(
      screen.getByText(new RegExp(FIELDS.recommended_at)),
    ).toBeInTheDocument();
    expect(screen.queryByText(FIELDS.recommended_at_never)).toBeNull();
  });

  it("picked + NULL -> the review string, and NO blank date", async () => {
    // The load-bearing cell. NULL on a picked row is "picked before there was
    // a clock", which admin.py counts as review-due — not missing data.
    renderForm(producer({ is_recommended: true, recommended_at: null }));
    await screen.findByLabelText(FIELDS.recommended_note);
    expect(screen.getByText(FIELDS.recommended_at_never)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(`^${FIELDS.recommended_at}\\s*$`))).toBeNull();
  });

  it("not picked + stamped -> nothing (a stale date is not a claim)", async () => {
    renderForm(
      producer({ is_recommended: false, recommended_at: "2026-03-14T09:00:00Z" }),
    );
    await screen.findByLabelText(FIELDS.recommended_note);
    expect(screen.queryByText(new RegExp(FIELDS.recommended_at))).toBeNull();
    expect(screen.queryByText(FIELDS.recommended_at_never)).toBeNull();
  });

  it("not picked + NULL -> nothing", async () => {
    renderForm(producer({ is_recommended: false, recommended_at: null }));
    await screen.findByLabelText(FIELDS.recommended_note);
    expect(screen.queryByText(FIELDS.recommended_at_never)).toBeNull();
  });
});
