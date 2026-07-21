/**
 * Edit-tab OwnerStoryCard isolation tests (MEH-1335 chunk 3).
 *
 * Renders the CARD directly under the REAL NextIntlClientProvider + he.json
 * (EditTabPricingCard harness). Covers: bio save payload (PUT /producers/me
 * with owner_bio only), empty-bio → null clear, not-dirty disabled state,
 * 300-char cap, and the photo upload path (POST /upload/owner-photo — the
 * endpoint persists owner_photo_url itself, so success only patches local
 * state via onSave, no PUT).
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

const O = he.dashboard.producer.owner_story;

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
  api.post.mockResolvedValue({ data: { url: "https://res.cloudinary.com/x/owner_9.jpg" } });
});

describe("Edit-tab OwnerStoryCard (isolation)", () => {
  it("saves owner_bio via PUT /producers/me (bio only — photo is not in the payload)", async () => {
    const { onSave } = renderCard();
    fireEvent.change(screen.getByTestId("owner-bio-input"), {
      target: { value: "גדלתי בין העיזים במשק המשפחתי." },
    });
    fireEvent.click(screen.getByRole("button", { name: O.save_cta }));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me", {
        owner_bio: "גדלתי בין העיזים במשק המשפחתי.",
      }),
    );
    expect(onSave).toHaveBeenCalledWith({ owner_bio: "גדלתי בין העיזים במשק המשפחתי." });
  });

  it("clearing the bio saves owner_bio: null", async () => {
    renderCard({ owner_bio: "טקסט ישן" });
    fireEvent.change(screen.getByTestId("owner-bio-input"), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: O.save_cta }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me", { owner_bio: null }),
    );
  });

  it("save button is disabled until the bio is dirty", () => {
    renderCard({ owner_bio: "כמו שנשמר" });
    expect(screen.getByRole("button", { name: O.save_cta })).toBeDisabled();
    fireEvent.change(screen.getByTestId("owner-bio-input"), { target: { value: "שונה" } });
    expect(screen.getByRole("button", { name: O.save_cta })).toBeEnabled();
  });

  it("caps the bio at 300 characters (server sanitize mirror)", () => {
    renderCard();
    fireEvent.change(screen.getByTestId("owner-bio-input"), {
      target: { value: "א".repeat(350) },
    });
    expect(screen.getByTestId("owner-bio-input").value).toHaveLength(300);
  });

  it("uploads the photo via POST /upload/owner-photo and patches owner_photo_url (no PUT)", async () => {
    const { onSave } = renderCard();
    const file = new File(["x"], "me.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByTestId("owner-photo-input"), { target: { files: [file] } });

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/upload/owner-photo", expect.any(FormData)),
    );
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        owner_photo_url: "https://res.cloudinary.com/x/owner_9.jpg",
      }),
    );
    // The endpoint persists the URL server-side — no PUT /producers/me here.
    expect(api.put).not.toHaveBeenCalled();
  });

  it("surfaces a backend Hebrew detail inline when the upload fails", async () => {
    api.post.mockRejectedValue({ response: { data: { detail: "קובץ לא נתמך" }, status: 415 } });
    renderCard();
    const file = new File(["x"], "me.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByTestId("owner-photo-input"), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("קובץ לא נתמך"));
  });
});
