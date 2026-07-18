/**
 * Edit-tab chunk B — ImagesCard isolation tests.
 *
 * Renders the CARD directly under the real NextIntlClientProvider + he.json
 * (see EditTabCategoriesCard.test.jsx for why isolation, not the full page).
 * Covers upload-append, index-based remove (a duplicate URL must not delete
 * both), and save.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, createEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import { ImagesCard } from "@/app/[locale]/producer/dashboard/edit/cards";

// MEH-1306: cards.jsx now imports @/i18n/navigation (view-on-page link);
// mock it so createNavigation's next/navigation import never loads in jsdom.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const I = he.dashboard.producer.images;

function renderCard(images) {
  const onSave = vi.fn();
  const utils = render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ImagesCard profile={{ images }} onSave={onSave} />
    </NextIntlClientProvider>,
  );
  return { onSave, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.put.mockResolvedValue({ data: {} });
  api.post.mockResolvedValue({ data: { url: "https://cdn/new.jpg" } });
});

describe("Edit-tab ImagesCard (isolation)", () => {
  it("appends an uploaded image to the grid", async () => {
    // Thumbnails use alt="" (decorative) → no "img" ARIA role; query the DOM.
    const { container } = renderCard(["https://cdn/a.jpg"]);
    expect(container.querySelectorAll("img")).toHaveLength(1);

    const input = container.querySelector('input[type="file"]');
    const file = new File(["x"], "b.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(container.querySelectorAll("img")).toHaveLength(2));
    expect(api.post).toHaveBeenCalledWith("/upload/image", expect.anything());
  });

  // MEH-1099: drag-drop feeds the same uploadFiles → POST /upload/image path.
  it("uploads a dropped image file and filters out non-images", async () => {
    const { container } = renderCard(["https://cdn/a.jpg"]);
    const zone = screen.getByTestId("images-dropzone");

    // Drag-over flips to the drop-state label.
    fireEvent.dragOver(zone);
    expect(screen.getByText(I.drop_here)).toBeInTheDocument();

    // dragLeave onto a child node must NOT clear the drop state (flicker
    // guard) — only a true exit (relatedTarget outside the zone) clears it.
    // jsdom drops relatedTarget from drag-event init → set it explicitly.
    const leaveToChild = createEvent.dragLeave(zone);
    Object.defineProperty(leaveToChild, "relatedTarget", { value: zone.firstChild });
    fireEvent(zone, leaveToChild);
    expect(screen.getByText(I.drop_here)).toBeInTheDocument();
    const leaveOutside = createEvent.dragLeave(zone);
    Object.defineProperty(leaveOutside, "relatedTarget", { value: document.body });
    fireEvent(zone, leaveOutside);
    expect(screen.getByText(I.add_cta)).toBeInTheDocument();

    fireEvent.dragOver(zone);
    // Non-image drop → filtered silently, no upload call.
    fireEvent.drop(zone, {
      dataTransfer: { files: [new File(["%PDF"], "doc.pdf", { type: "application/pdf" })] },
    });
    expect(api.post).not.toHaveBeenCalled();

    // Image drop → uploads and joins the grid.
    fireEvent.dragOver(zone);
    fireEvent.drop(zone, {
      dataTransfer: { files: [new File(["x"], "drop.png", { type: "image/png" })] },
    });
    await waitFor(() => expect(container.querySelectorAll("img")).toHaveLength(2));
    expect(api.post).toHaveBeenCalledWith("/upload/image", expect.anything());
  });

  it("removes by index — a duplicate URL deletes only the clicked thumbnail", async () => {
    const { container } = renderCard(["https://cdn/dup.jpg", "https://cdn/dup.jpg"]);
    expect(container.querySelectorAll("img")).toHaveLength(2);

    fireEvent.click(screen.getAllByRole("button", { name: I.remove_aria })[0]);
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });

  // MEH-1236: uploading a photo auto-persists it (no manual Save click) so the
  // overview checklist reflects it immediately — kills the upload≠save trap.
  it("auto-saves the profile right after a successful upload", async () => {
    const { onSave, container } = renderCard(["https://cdn/a.jpg"]);
    const input = container.querySelector('input[type="file"]');
    const file = new File(["x"], "b.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me", {
        images: ["https://cdn/a.jpg", "https://cdn/new.jpg"],
      }),
    );
    expect(onSave).toHaveBeenCalledWith({
      images: ["https://cdn/a.jpg", "https://cdn/new.jpg"],
    });
  });

  // A removal must NOT auto-persist — the explicit Save intent guards against a
  // mis-click silently wiping a photo. api.put fires only on the Save click.
  it("does not auto-save on remove — only on the explicit Save click", async () => {
    renderCard(["https://cdn/a.jpg", "https://cdn/b.jpg"]);
    fireEvent.click(screen.getAllByRole("button", { name: I.remove_aria })[1]);
    expect(api.put).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: I.save_cta }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me", {
        images: ["https://cdn/a.jpg"],
      }),
    );
  });

  it("saves the current image list via PUT /producers/me", async () => {
    const { onSave } = renderCard(["https://cdn/a.jpg", "https://cdn/b.jpg"]);
    // Make the list dirty (remove one) so Save enables.
    fireEvent.click(screen.getAllByRole("button", { name: I.remove_aria })[1]);
    fireEvent.click(screen.getByRole("button", { name: I.save_cta }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me", {
        images: ["https://cdn/a.jpg"],
      }),
    );
    expect(onSave).toHaveBeenCalledWith({ images: ["https://cdn/a.jpg"] });
  });
});

// MEH-1352: free-plan cap surfaced in the UI (X/3 counter + full-state zone).
describe("ImagesCard free-plan cap UI (MEH-1352)", () => {
  it("shows the X/3 counter for a free-plan profile", () => {
    renderCard(["https://cdn/a.jpg"]);
    const counter = screen.getByTestId("images-cap-counter");
    expect(counter.textContent).toContain("1/3");
  });

  it("at 3/3 the zone reads full and the picker is disabled", () => {
    const { container } = renderCard([
      "https://cdn/a.jpg",
      "https://cdn/b.jpg",
      "https://cdn/c.jpg",
    ]);
    expect(screen.getByText(I.zone_full)).toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toBeDisabled();
  });

  it("below the cap the picker stays enabled with the formats line", () => {
    const { container } = renderCard(["https://cdn/a.jpg"]);
    expect(screen.getByText(I.add_cta)).toBeInTheDocument();
    expect(I.add_cta).toContain("HEIC");
    expect(container.querySelector('input[type="file"]')).not.toBeDisabled();
  });

  it("no counter and no cap gating on a non-free plan", () => {
    const onSave = vi.fn();
    const { container } = render(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <ImagesCard
          profile={{ images: ["a", "b", "c"], plan: "premium" }}
          onSave={onSave}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByTestId("images-cap-counter")).not.toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).not.toBeDisabled();
  });
});
