import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ChecklistSettings from "@/app/[locale]/admin/settings/ChecklistSettings";
import api from "@/lib/api";

/**
 * MEH-1399 chunk 2 — the settings surface that makes the review checklist
 * editable without a deploy.
 *
 * The property under test is the one a plausible implementation gets wrong and
 * that a reviewer caught here: «נשמר ✓» is a claim about the list ON SCREEN,
 * not a receipt for a save that happened at some point in the past. Leaving it
 * up while the form is dirty shows an admin a confirmation for work that is
 * not saved — the same defect class as a DoD checkbox ticked for verification
 * nobody performed.
 */

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn() },
}));

const ITEMS = [
  { id: "11111111-1111-1111-1111-111111111111", label: "פרטים בסיסיים", hint: "שם, עיר", active: true },
  { id: "22222222-2222-2222-2222-222222222222", label: "תמונות", hint: null, active: true },
];

const SAVED = "נשמר ✓";
const SAVE_BUTTON = "שמירת הרשימה";
const TOO_SHORT = "תווית קצרה מדי — לפחות 3 אותיות";

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: ITEMS });
  api.put.mockResolvedValue({ data: ITEMS });
});

async function renderSaved() {
  render(<ChecklistSettings />);
  await screen.findByDisplayValue("פרטים בסיסיים");
  fireEvent.click(screen.getByText(SAVE_BUTTON));
  await screen.findByText(SAVED);
}

describe("ChecklistSettings", () => {
  it("loads the list including retired items", async () => {
    render(<ChecklistSettings />);
    await screen.findByDisplayValue("פרטים בסיסיים");
    // include_inactive: an item you cannot see is an item you cannot bring back.
    expect(api.get).toHaveBeenCalledWith(
      "/admin/checklist-items?include_inactive=true",
    );
  });

  it("shows the confirmation after a save", async () => {
    await renderSaved();
    expect(screen.getByText(SAVED)).toBeInTheDocument();
  });

  // The three mutation paths, one test each. Named after the input each
  // covers rather than after the class, so none can stand in for another —
  // the reviewer's finding named `update`, `move` and the add handler
  // separately because fixing one of three is not fixing the class.
  it("withdraws the confirmation when a field is edited", async () => {
    await renderSaved();
    fireEvent.change(screen.getByDisplayValue("פרטים בסיסיים"), {
      target: { value: "פרטים בסיסיים ועוד" },
    });
    expect(screen.queryByText(SAVED)).not.toBeInTheDocument();
  });

  it("withdraws the confirmation when an item is reordered", async () => {
    await renderSaved();
    fireEvent.click(screen.getByLabelText("הורידי את «פרטים בסיסיים»"));
    expect(screen.queryByText(SAVED)).not.toBeInTheDocument();
  });

  it("withdraws the confirmation when an item is added", async () => {
    await renderSaved();
    fireEvent.click(screen.getByText("הוספת סעיף"));
    expect(screen.queryByText(SAVED)).not.toBeInTheDocument();
  });

  // --- MEH-2177 -----------------------------------------------------------
  //
  // ONE EXISTING ASSERTION WAS REWRITTEN, NOT REPAIRED TO PASS. This case used
  // to end on `getByText("לכל סעיף חייב להיות טקסט.")` — a GLOBAL message under
  // the button. That message is deliberately gone: with up to a dozen rows it
  // said that something was wrong and never which row, which is the whole
  // complaint MEH-2177 files. The block below asserts the same gate (save
  // disabled) and the replacement signal (an error on the offending row).

  it("blocks saving while any item has an empty label", async () => {
    render(<ChecklistSettings />);
    await screen.findByDisplayValue("תמונות");
    fireEvent.change(screen.getByDisplayValue("תמונות"), {
      target: { value: "   " },
    });
    expect(screen.getByText(SAVE_BUTTON)).toBeDisabled();
    expect(screen.getByText(TOO_SHORT)).toBeInTheDocument();
  });

  it("blocks a 2-letter label — the server rule is >=3 LETTERS, not >0 chars", async () => {
    // The discriminating case. `"אב"` is non-empty, so the old
    // `label.trim().length > 0` guard enabled the button and the admin got a
    // 422 rendered as the generic «השמירה נכשלה» naming no item. Shown red
    // against the pre-fix component on both assertions.
    render(<ChecklistSettings />);
    await screen.findByDisplayValue("תמונות");
    fireEvent.change(screen.getByDisplayValue("תמונות"), {
      target: { value: "אב" },
    });

    expect(screen.getByText(SAVE_BUTTON)).toBeDisabled();
    expect(screen.getByText(TOO_SHORT)).toBeInTheDocument();
  });

  it("counts LETTERS, so digits and punctuation do not satisfy the floor", async () => {
    // `_LETTER_REGEX` (schemas.py:21) strips everything outside [א-תa-zA-Z]
    // before counting, so "א1234!" carries ONE letter. A client that mirrored
    // the rule as "length >= 3" would pass this and still 422.
    render(<ChecklistSettings />);
    await screen.findByDisplayValue("תמונות");
    fireEvent.change(screen.getByDisplayValue("תמונות"), {
      target: { value: "א1234!" },
    });

    expect(screen.getByText(SAVE_BUTTON)).toBeDisabled();
    expect(screen.getByText(TOO_SHORT)).toBeInTheDocument();
  });

  it("names the offending item rather than reporting a global failure", async () => {
    // The point of the ticket: with two rows and one bad label, exactly ONE
    // error is on screen, and it belongs to the row the admin broke. A global
    // message passes "an error is shown" while failing this.
    render(<ChecklistSettings />);
    await screen.findByDisplayValue("תמונות");
    fireEvent.change(screen.getByDisplayValue("תמונות"), {
      target: { value: "אב" },
    });

    expect(screen.getAllByText(TOO_SHORT)).toHaveLength(1);
    // aria-invalid is on the broken field and NOT on its neighbour.
    expect(screen.getByDisplayValue("אב")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByDisplayValue("פרטים בסיסיים")).not.toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("accepts a 3-letter label — the floor is met, not exceeded", async () => {
    // The other side of the boundary. Without this, a guard that rejected
    // everything would pass every case above.
    render(<ChecklistSettings />);
    await screen.findByDisplayValue("תמונות");
    fireEvent.change(screen.getByDisplayValue("תמונות"), {
      target: { value: "אבג" },
    });

    expect(screen.getByText(SAVE_BUTTON)).not.toBeDisabled();
    expect(screen.queryByText(TOO_SHORT)).toBeNull();
  });

  it("tells the admin to refresh when the server 404s a retired item", async () => {
    api.put.mockRejectedValue({ response: { status: 404 } });
    render(<ChecklistSettings />);
    await screen.findByDisplayValue("תמונות");
    fireEvent.click(screen.getByText(SAVE_BUTTON));
    // Surfaced, not swallowed: a silent reload would discard what was typed.
    await screen.findByText("אחד הסעיפים כבר לא קיים — רענני את העמוד");
    expect(screen.queryByText(SAVED)).not.toBeInTheDocument();
  });

  it("offers a retry when the list fails to load", async () => {
    api.get.mockRejectedValueOnce(new Error("boom"));
    render(<ChecklistSettings />);
    await screen.findByText("טעינת הרשימה נכשלה.");

    api.get.mockResolvedValue({ data: ITEMS });
    fireEvent.click(screen.getByText("נסי שוב"));
    await waitFor(() =>
      expect(screen.getByDisplayValue("פרטים בסיסיים")).toBeInTheDocument(),
    );
  });
});
