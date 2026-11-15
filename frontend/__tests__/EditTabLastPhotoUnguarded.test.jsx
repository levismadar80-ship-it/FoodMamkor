/**
 * MEH-2911 — the boundary of the last-photo guard, from the other side.
 *
 * EditTabLastPhotoNote.test.jsx proves an APPROVED business is refused. This
 * file proves the guard does not fire where it must not: a `draft` business
 * removes its last photo normally, with no note. Without it, deleting the
 * status condition from `removeImage` leaves the whole frontend suite green —
 * measured on this branch (21 tests ran, 0 failed with `isGalleryLocked &&`
 * dropped), which is why it is a separate file rather than a line somewhere.
 *
 * Its own file because of the ONE-click-per-file limit on dashboard-card
 * vitest files (MEH-2876): the sibling file already spends its click on the
 * refusal.
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

describe("MEH-2911 — a business that was never live", () => {
  it("renders the thumbnail and its remove button for a draft business", () => {
    // The control for the click below: if the card rendered no remove
    // button for a draft, the click test would pass for the wrong reason.
    const { container } = renderCard({ images: ONE, status: "draft" });
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(screen.getByLabelText(I.remove_aria)).toBeTruthy();
  });

  it("removes the last photo of a draft business, with no note", () => {
    const { container } = renderCard({ images: ONE, status: "draft" });

    fireEvent.click(screen.getByLabelText(I.remove_aria));

    // The gallery really emptied — the guard did not fire.
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(screen.queryByTestId("images-last-photo-note")).toBeNull();
    // And nothing was turned into an error either: a draft emptying its
    // gallery is ordinary editing, caught later by the submit gate.
    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(0);
  });
});
