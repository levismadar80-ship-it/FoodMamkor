/**
 * MEH-2911 — an approved business cannot remove its last gallery photo, and
 * the refusal appears NEXT TO the remove button.
 *
 * Sapir's ruling (10/11): refuse the removal, keep the gallery, do not demote
 * the business, and show the message beside the control — not as a card- or
 * page-level error. The backend half is
 * tests/test_meh2911_last_photo_guard.py; this file covers what the owner
 * sees at the moment she clicks.
 *
 * ONE click, in the LAST test, on purpose: two clicks in one dashboard-card
 * vitest file hang the run (MEH-2876, HANDOFF). The non-click assertions come
 * first. The second click the ruling needs — that an UNGUARDED status still
 * removes its last photo — therefore lives in its own file,
 * EditTabLastPhotoUnguarded.test.jsx; without it, dropping the status
 * condition from the card leaves this whole suite green (measured).
 *
 * The status set itself (approved + inactive guarded; draft / pending /
 * rejected not) is pinned in the pytest file, which reads the card's own
 * array and compares it with the backend's.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import { ImagesCard } from "@/app/[locale]/producer/dashboard/edit/cards";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const I = he.dashboard.producer.images;
const ONE = ["https://cdn/only.jpg"];

function renderCard({ images, status }) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ImagesCard profile={{ images, status }} onSave={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.put.mockResolvedValue({ data: {} });
});

describe("MEH-2911 — last gallery photo", () => {
  it("ships the approved sentence, verbatim", () => {
    // Rule 22: the copy is Sapir's. If someone rewords he.json, this reds
    // before any behaviour test does, and names the sentence that changed.
    expect(I.last_photo).toBe(
      "אי אפשר להסיר את התמונה האחרונה. הוסיפו תמונה אחרת, ואז הסירו את זו.",
    );
  });

  it("shows no note before anything is clicked", () => {
    // The control for the click test below: if the note were rendered
    // unconditionally, that test would pass without the guard existing.
    renderCard({ images: ONE, status: "approved" });
    expect(screen.queryByTestId("images-last-photo-note")).toBeNull();
  });

  it("keeps the thumbnail grid a direct child of the card, so a sibling note reads under it", () => {
    // Placement is the half of the ruling a text assertion cannot carry:
    // "next to the remove button, not as a top-of-page error". The note is
    // not in the DOM yet, so this asserts the SHAPE the renderer targets —
    // the remove button sits in a per-thumbnail cell inside a grid, and
    // that grid is a direct child of the card, so the element placed
    // immediately after it reads directly under the thumbnail.
    const { container } = renderCard({ images: ONE, status: "approved" });
    const cell = screen.getByLabelText(I.remove_aria).parentElement;
    const grid = cell.parentElement;
    expect(cell.querySelector("img")).not.toBeNull();
    expect(grid).not.toBe(container.firstChild);
    expect(grid.parentElement).toBe(container.firstChild);
  });

  it("refuses the removal and shows the note beside that button", () => {
    const { container } = renderCard({ images: ONE, status: "approved" });
    expect(container.querySelectorAll("img")).toHaveLength(1);

    fireEvent.click(screen.getByLabelText(I.remove_aria));

    const note = screen.getByTestId("images-last-photo-note");
    expect(note).toHaveTextContent(I.last_photo);
    // Beside the button: the note is the element immediately after the grid
    // that holds the thumbnail, so it reads directly under it rather than at
    // the foot of the card. It is NOT a grid child — the save-path refusal
    // arrives with the list already empty and no grid rendered, which is the
    // case the earlier nested version dropped (MEH-2911 review).
    const grid = screen.getByLabelText(I.remove_aria).parentElement.parentElement;
    expect(note.previousElementSibling).toBe(grid);
    // And the refusal produced exactly ONE live region: no card-foot error
    // alongside it. A second `role="alert"` here is the placement Sapir
    // ruled against sneaking back in beside the inline note.
    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1);
    // The photo is still there — this is a refusal, not a warning shown
    // after the fact.
    expect(container.querySelectorAll("img")).toHaveLength(1);
    // And nothing was saved: the guard runs before any request.
    expect(api.put).not.toHaveBeenCalled();
  });
});
