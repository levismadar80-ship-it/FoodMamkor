/**
 * Edit-tab — OwnerStoryCard isolation tests (MEH-1385).
 *
 * Renders the CARD directly under the real NextIntlClientProvider + he.json
 * (see EditTabCategoriesCard.test.jsx for why isolation, not the full page).
 * Covers the empty state, the hard 300-char cap, the bio save contract
 * (PUT /producers/me { owner_bio }), and the photo upload path
 * (POST /upload/owner-photo → auto-persist + onSave, mirroring ImagesCard).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import { OwnerStoryCard } from "@/app/[locale]/producer/dashboard/edit/cards";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const T = he.dashboard.producer.owner_story;

function renderCard(profile = {}) {
  const onSave = vi.fn();
  const utils = render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <OwnerStoryCard profile={profile} onSave={onSave} />
    </NextIntlClientProvider>,
  );
  return { onSave, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.put.mockResolvedValue({ data: {} });
  api.post.mockResolvedValue({ data: { url: "https://cdn/owner.jpg" } });
});

describe("Edit-tab OwnerStoryCard (isolation)", () => {
  it("empty state: placeholder (no img), upload CTA, 0/300 counter", () => {
    const { container } = renderCard({ id: "p1" });
    // No <img> when there is no photo — the UserCircle placeholder is an svg.
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText(T.photo_cta)).toBeInTheDocument();
    expect(container.textContent).toContain("0/300");
  });

  it("shows the photo + replace label + alt text when a photo exists", () => {
    const { container } = renderCard({ id: "p1", owner_photo_url: "https://cdn/me.jpg" });
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    // a11y: the owner photo carries meaning — alt must not be empty.
    expect(img.getAttribute("alt")).toBe(T.photo_alt);
    expect(screen.getByText(T.photo_replace)).toBeInTheDocument();
  });

  it("hard-caps the bio at 300 chars on input (not on save)", () => {
    const { container } = renderCard({ id: "p1" });
    const textarea = container.querySelector("textarea");
    fireEvent.change(textarea, { target: { value: "א".repeat(400) } });
    expect(textarea.value.length).toBe(300);
    expect(container.textContent).toContain("300/300");
  });

  it("saves the bio via PUT /producers/me { owner_bio } (trimmed)", async () => {
    const { onSave } = renderCard({ id: "p1" });
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "  שלום מהגליל  " } });
    fireEvent.click(screen.getByRole("button", { name: T.save_cta }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me", { owner_bio: "שלום מהגליל" }),
    );
    expect(onSave).toHaveBeenCalledWith({ owner_bio: "שלום מהגליל" });
  });

  it("blank bio clears the field (owner_bio: null)", async () => {
    // Seed a value so the field is dirty when cleared to empty.
    renderCard({ id: "p1", owner_bio: "טקסט קיים" });
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: T.save_cta }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me", { owner_bio: null }),
    );
  });

  it("uploads the photo to POST /upload/owner-photo and auto-persists via onSave", async () => {
    const { onSave, container } = renderCard({ id: "p1" });
    const input = container.querySelector('input[type="file"]');
    const file = new File(["x"], "me.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/upload/owner-photo", expect.anything()),
    );
    // The photo auto-persists (endpoint writes owner_photo_url server-side) —
    // no PUT, just the profile sync, like ImagesCard's upload.
    expect(api.put).not.toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledWith({ owner_photo_url: "https://cdn/owner.jpg" });
  });
});
