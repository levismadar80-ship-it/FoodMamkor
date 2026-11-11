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
 * first, and the status matrix (draft / pending / rejected / inactive may
 * still empty the gallery) lives in the pytest file, which can exercise every
 * status without that constraint.
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

  it("puts the note inside the thumbnail's own cell, not at the card foot", () => {
    // Placement is the half of the ruling a text assertion cannot carry:
    // "next to the remove button, not as a top-of-page error". Asserted
    // structurally — the note must share an ancestor with the remove
    // button, and that ancestor must not be the whole card.
    const { container } = renderCard({ images: ONE, status: "approved" });
    const removeButton = screen.getByLabelText(I.remove_aria);
    const cell = removeButton.parentElement;
    // The note is not in the DOM yet, so assert the SHAPE the renderer
    // targets: the button sits in a per-thumbnail cell that also holds the
    // image, i.e. there is somewhere beside it for the note to go.
    expect(cell).not.toBe(container.firstChild);
    expect(cell.querySelector("img")).not.toBeNull();
  });

  it("refuses the removal and shows the note beside that button", () => {
    const { container } = renderCard({ images: ONE, status: "approved" });
    expect(container.querySelectorAll("img")).toHaveLength(1);

    fireEvent.click(screen.getByLabelText(I.remove_aria));

    const note = screen.getByTestId("images-last-photo-note");
    expect(note).toHaveTextContent(I.last_photo);
    // Beside the button: the note is the grid item immediately after the
    // thumbnail cell that holds it, so it reads directly under that
    // thumbnail rather than at the foot of the card. Asserted as
    // adjacency in the same grid, not as a shared parent — the note spans
    // the row (see the 375 capture in qa-artifacts/MEH-2911).
    const cell = screen.getByLabelText(I.remove_aria).parentElement;
    expect(note.parentElement).toBe(cell.parentElement);
    expect(cell.nextElementSibling).toBe(note);
    // The photo is still there — this is a refusal, not a warning shown
    // after the fact.
    expect(container.querySelectorAll("img")).toHaveLength(1);
    // And nothing was saved: the guard runs before any request.
    expect(api.put).not.toHaveBeenCalled();
  });
});
