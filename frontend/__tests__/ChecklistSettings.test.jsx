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

  it("blocks saving while any item has an empty label", async () => {
    render(<ChecklistSettings />);
    await screen.findByDisplayValue("תמונות");
    fireEvent.change(screen.getByDisplayValue("תמונות"), {
      target: { value: "   " },
    });
    expect(screen.getByText(SAVE_BUTTON)).toBeDisabled();
    expect(screen.getByText("לכל סעיף חייב להיות טקסט.")).toBeInTheDocument();
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
