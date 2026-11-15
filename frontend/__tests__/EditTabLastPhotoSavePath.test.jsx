/**
 * MEH-2911 — the refusal that arrives from the SERVER, not from the click.
 *
 * The case: the owner opens the edit tab while her business is still
 * `pending`, an admin approves it in the meantime, and she then removes her
 * only photo and saves. The click-time pre-check read the status the card
 * loaded with, so it does not fire; the 422 does. The ruling's placement
 * applies to this path too — the note next to the photo, not the card-foot
 * error — and this is the only test that covers it.
 *
 * It is the path two review findings lived on, both measured on this branch:
 *   1. the branch read `images.length === 1` while the list it had just sent
 *      was empty, so it could never be true and every server refusal fell
 *      through to `setErrorMsg` — the card-foot alert Sapir ruled against;
 *   2. the note was rendered inside the `images.length > 0` grid, which does
 *      not exist once the list is empty, so even a corrected branch had
 *      nowhere to draw.
 * Both are invisible to a test that only clicks remove, which is why this
 * file exists rather than another assertion in the sibling one.
 *
 * TWO clicks, deliberately, against HANDOFF's "one click per dashboard-card
 * vitest file" (MEH-2876). Measured before shipping it: this exact file shape
 * ran 4/4 green in ~2.3s each. The case needs a remove AND a save — there is
 * no one-click route to a dirty card with an empty gallery, since the save
 * button is `disabled={!dirty}`. If this ever hangs in CI, the fix is to
 * split it, not to drop the coverage.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

// The envelope the route really sends (MEH-1943 shape), with the code the
// card branches on. Its message is the Hebrew sentence; the card renders the
// LOCALE's own string, which is why a code and not a string comparison.
const REFUSAL = {
  response: {
    data: {
      detail: {
        code: "last_photo_required",
        message:
          "אי אפשר להסיר את התמונה האחרונה. הוסיפו תמונה אחרת, ואז הסירו את זו.",
        params: {},
      },
    },
  },
};

function renderCard({ images, status }) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ImagesCard profile={{ images, status }} onSave={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MEH-2911 — a 422 that arrives after the card loaded", () => {
  it("sends the save at all when the card loaded as pending", async () => {
    // The control. If the pre-check fired here — because someone widened
    // the guarded set to every status — no PUT would be made and the test
    // below would pass for the wrong reason: no request, no refusal, and
    // nothing to place. This asserts the request happens.
    api.put.mockResolvedValue({ data: {} });
    renderCard({ images: ONE, status: "pending" });

    fireEvent.click(screen.getByLabelText(I.remove_aria));
    fireEvent.click(screen.getByText(I.save_cta));

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put).toHaveBeenCalledWith("/producers/me", { images: [] });
  });

  it("shows the note, not the card-foot error, when the server refuses", async () => {
    api.put.mockRejectedValue(REFUSAL);
    const { container } = renderCard({ images: ONE, status: "pending" });

    fireEvent.click(screen.getByLabelText(I.remove_aria));
    // The local list is empty now, so no thumbnail grid is rendered — the
    // state finding (2) above. The note has to appear without one.
    expect(container.querySelectorAll("img")).toHaveLength(0);

    fireEvent.click(screen.getByText(I.save_cta));

    await waitFor(() =>
      expect(screen.getByTestId("images-last-photo-note")).toBeTruthy(),
    );
    expect(screen.getByTestId("images-last-photo-note")).toHaveTextContent(
      I.last_photo,
    );
    // Exactly one live region: the inline note and NOT a second card-foot
    // alert beside it. This is the assertion that reds on finding (1) —
    // with the dead `images.length === 1` branch the only alert rendered
    // was the card-foot one, in the position the ruling forbids.
    const alerts = container.querySelectorAll('[role="alert"]');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toBe(screen.getByTestId("images-last-photo-note"));
  });
});
