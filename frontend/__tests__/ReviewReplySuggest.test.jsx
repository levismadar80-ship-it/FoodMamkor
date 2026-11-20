/**
 * MEH-3480 — «הצעת תשובה» in the owner's reply editor: the draft lands in the
 * reply box only on «שימוש בטיוטה», and nothing is sent until «שמירה».
 * Closed / preview / use / cancel / 503 / 429.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import { ReviewReply } from "@/components/ReviewsSection";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));

const S = he.reviews.reply_suggest;
const review = { id: "r1", stars: 4, body: "היה טעים", reply: null };

function openEditor() {
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ReviewReply review={review} isOwner onSaved={vi.fn()} />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: he.reviews.reply_add }));
}
const box = () => /** @type {HTMLTextAreaElement} */ (document.getElementById("reply-r1"));

beforeEach(() => vi.clearAllMocks());

describe("ReviewReply AI draft (MEH-3480)", () => {
  it("closed: the button and its hint sit in the editor; nothing is asked", () => {
    openEditor();
    expect(screen.getByRole("button", { name: S.cta })).toHaveAttribute("aria-describedby", "reply-r1-ai-suggest-hint");
    expect(screen.getByText(S.hint)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("«שימוש בטיוטה» puts the EDITED draft in the reply box; nothing is sent", async () => {
    api.post.mockResolvedValue({ data: { reply: "תודה רבה על המילים החמות." } });
    openEditor();
    fireEvent.click(screen.getByRole("button", { name: S.cta }));
    const preview = await screen.findByLabelText(S.preview_label);
    expect(api.post).toHaveBeenCalledWith("/reviews/r1/reply/suggest");
    await waitFor(() => expect(preview).toHaveFocus());
    fireEvent.change(preview, { target: { value: "תודה רבה, שמחנו." } });
    fireEvent.click(screen.getByRole("button", { name: S.use }));
    expect(box().value).toBe("תודה רבה, שמחנו.");
    expect(api.put).not.toHaveBeenCalled();
  });

  it("«ביטול» leaves the reply box as it was", async () => {
    api.post.mockResolvedValue({ data: { reply: "טיוטה." } });
    openEditor();
    fireEvent.change(box(), { target: { value: "מה שכתבתי" } });
    fireEvent.click(screen.getByRole("button", { name: S.cta }));
    await screen.findByLabelText(S.preview_label);
    // Two «ביטול» on screen: the draft's, and the editor's own below it.
    fireEvent.click(within(screen.getByTestId("reply-suggestion")).getByRole("button", { name: S.cancel }));
    expect(box().value).toBe("מה שכתבתי");
    expect(screen.queryByTestId("reply-suggestion")).toBeNull();
  });

  it("a 503 shows the fallback line; a 429 the limit line", async () => {
    api.post.mockRejectedValueOnce({ response: { status: 503 } });
    openEditor();
    fireEvent.click(screen.getByRole("button", { name: S.cta }));
    expect(await screen.findByText(S.failed)).toBeInTheDocument();
    api.post.mockRejectedValueOnce({ response: { status: 429 } });
    fireEvent.click(screen.getByRole("button", { name: S.cta }));
    expect(await screen.findByText(S.limit)).toBeInTheDocument();
  });
});
