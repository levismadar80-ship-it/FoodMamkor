import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import StoryCardCanvas from "@/components/StoryCardCanvas";
import ReviewCardCanvas from "@/components/ReviewCardCanvas";

// MEH-1428 "ערכת שיתוף" — the two gates this feature rests on, and the review
// block's count states.
//
// GATE 1 (chunk A): the Cloudinary upload button must NOT exist in owner mode.
// POST /admin/producers/{id}/story-card is behind require_admin, so an owner who
// could press it would get a 403; the story_card_url it writes is an
// admin-curated field. The admin table's own flow must be untouched.
//
// GATE 2 (chunk B): no reviewer identity anywhere in the review block — not on
// the canvas (ReviewCardLayout.test.jsx covers the canvas), and not in the
// picker's option text, which is the one place a name would read as helpful.
//
// COUNTS: 0 reviews / exactly 1 / several. There is no reveal in the section —
// both cards are always open — so the (count x open/closed) matrix collapses to
// the count axis, and these are all of it.

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(() => Promise.resolve({ data: {} })),
}));
vi.mock("@/lib/api", () => ({ default: apiMock }));
vi.mock("@/lib/toast", () => ({
  showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Keys resolve to their own path, so an assertion names the key it depends on
// and a renamed key fails loudly instead of matching a Hebrew literal.
vi.mock("next-intl", () => ({
  useTranslations: (ns) => {
    const t = (k) => (ns ? `${ns}.${k}` : k);
    t.rich = (k, values) => {
      const full = ns ? `${ns}.${k}` : k;
      return values?.link ? values.link(full) : full;
    };
    return t;
  },
}));

beforeAll(() => {
  const ctxStub = {
    fillRect: () => {}, beginPath: () => {}, arc: () => {}, fill: () => {},
    save: () => {}, clip: () => {}, drawImage: () => {}, restore: () => {},
    stroke: () => {}, moveTo: () => {}, lineTo: () => {}, closePath: () => {},
    fillText: () => {}, measureText: () => ({ width: 0 }), arcTo: () => {},
    ellipse: () => {}, translate: () => {}, scale: () => {}, rotate: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
  };
  HTMLCanvasElement.prototype.getContext = () => ctxStub;
  HTMLCanvasElement.prototype.toDataURL = () => "data:image/jpeg;base64,AAAA";
});

const producer = {
  id: "p1",
  name: "מאפיית טסט",
  city: "חיפה",
  slug: "test-bakery",
  images: [],
  categories: [],
};

const reviewsPayload = (reviews) => ({ data: { reviews, total: reviews.length, page: 1, pages: 1 } });

describe("StoryCardCanvas owner mode — the Cloudinary upload gate (MEH-1428 chunk A)", () => {
  beforeEach(() => {
    apiMock.post.mockClear();
    apiMock.get.mockReset();
  });

  it("renders NO upload button in owner mode, and still offers download + caption", () => {
    render(<StoryCardCanvas producer={producer} mode="owner" />);
    expect(screen.queryByTestId("story-card-upload")).not.toBeInTheDocument();
    expect(screen.getByTestId("story-card-download")).toBeInTheDocument();
    expect(screen.getByTestId("story-card-copy-caption")).toBeInTheDocument();
  });

  it("uses the owner's feminine labels in owner mode", () => {
    render(<StoryCardCanvas producer={producer} mode="owner" />);
    expect(screen.getByTestId("story-card-download")).toHaveTextContent(
      "story.canvas.owner.download_story",
    );
    expect(screen.getByTestId("story-card-copy-caption")).toHaveTextContent(
      "story.canvas.owner.copy_caption",
    );
  });

  // Discriminator for the gate above: the SAME component, default mode, must
  // still carry the upload button — otherwise the owner-mode assertion would
  // pass against a component that simply lost the button for everyone.
  it("keeps the upload button in the default (admin) mode", () => {
    render(<StoryCardCanvas producer={producer} />);
    expect(screen.getByTestId("story-card-upload")).toBeInTheDocument();
    expect(screen.getByTestId("story-card-download")).toHaveTextContent("story.canvas.download");
  });

  it("never POSTs to the admin story-card route from owner mode", () => {
    render(<StoryCardCanvas producer={producer} mode="owner" />);
    expect(apiMock.post).not.toHaveBeenCalled();
  });
});

describe("ReviewCardCanvas — review counts and the reviewer-privacy gate (MEH-1428 chunk B)", () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.post.mockClear();
  });

  it("0 reviews → empty state pointing at the existing request-review surface", async () => {
    apiMock.get.mockResolvedValue(reviewsPayload([]));
    render(<ReviewCardCanvas producer={producer} />);
    const empty = await screen.findByTestId("review-card-empty");
    expect(empty).toHaveTextContent("story.canvas.owner.reviews_empty");
    expect(screen.getByTestId("review-card-empty-cta")).toHaveAttribute(
      "href",
      "/producer/dashboard/tools",
    );
    expect(screen.queryByTestId("review-card-canvas")).not.toBeInTheDocument();
    expect(screen.queryByTestId("review-card-pick")).not.toBeInTheDocument();
  });

  it("rating-only reviews count as nothing to share", async () => {
    apiMock.get.mockResolvedValue(
      reviewsPayload([
        { id: "r1", stars: 5, body: null },
        { id: "r2", stars: 4, body: "   " },
      ]),
    );
    render(<ReviewCardCanvas producer={producer} />);
    expect(await screen.findByTestId("review-card-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("review-card-canvas")).not.toBeInTheDocument();
  });

  it("exactly 1 review → the card, and NO picker (a one-option select does nothing)", async () => {
    apiMock.get.mockResolvedValue(reviewsPayload([{ id: "r1", stars: 5, body: "מעולה" }]));
    render(<ReviewCardCanvas producer={producer} />);
    expect(await screen.findByTestId("review-card-canvas")).toBeInTheDocument();
    expect(screen.queryByTestId("review-card-pick")).not.toBeInTheDocument();
    expect(screen.queryByTestId("review-card-empty")).not.toBeInTheDocument();
    expect(screen.getByTestId("review-card-download")).toBeInTheDocument();
    expect(screen.getByTestId("review-card-copy-caption")).toBeInTheDocument();
  });

  it("several reviews → a picker with one option per review", async () => {
    apiMock.get.mockResolvedValue(
      reviewsPayload([
        { id: "r1", stars: 5, body: "הלחם מושלם" },
        { id: "r2", stars: 4, body: "שירות נהדר" },
        { id: "r3", stars: 5, body: "חוזרת כל שבוע" },
      ]),
    );
    render(<ReviewCardCanvas producer={producer} />);
    const pick = await screen.findByTestId("review-card-pick");
    // Derived from the DOM, not stated: a hardcoded 3 would pass against a
    // picker that renders a fixed number of options.
    expect(pick.querySelectorAll("option")).toHaveLength(3);
    expect(screen.getByTestId("review-card-canvas")).toBeInTheDocument();
  });

  it("prints no reviewer name or id anywhere in the block, including the picker", async () => {
    apiMock.get.mockResolvedValue(
      reviewsPayload([
        { id: "r1", stars: 5, body: "הלחם מושלם", user_name: "רונית לוי", user_id: "u-77" },
        { id: "r2", stars: 4, body: "שירות נהדר", user_name: "דנה כהן", user_id: "u-78" },
      ]),
    );
    const { container } = render(<ReviewCardCanvas producer={producer} />);
    await screen.findByTestId("review-card-pick");
    for (const leak of ["רונית", "לוי", "דנה", "כהן", "u-77", "u-78"]) {
      expect(container.textContent, `leaked ${leak}`).not.toContain(leak);
    }
  });

  it("a failed fetch shows an error, not an empty state that reads as zero reviews", async () => {
    apiMock.get.mockRejectedValue(new Error("boom"));
    render(<ReviewCardCanvas producer={producer} />);
    expect(await screen.findByTestId("review-card-error")).toBeInTheDocument();
    expect(screen.queryByTestId("review-card-empty")).not.toBeInTheDocument();
    expect(screen.queryByTestId("review-card-canvas")).not.toBeInTheDocument();
  });

  it("a malformed payload is an error, never a half-drawn card (rule 19)", async () => {
    apiMock.get.mockResolvedValue({ data: { reviews: [{ id: "r1", stars: "five" }] } });
    render(<ReviewCardCanvas producer={producer} />);
    expect(await screen.findByTestId("review-card-error")).toBeInTheDocument();
    expect(screen.queryByTestId("review-card-canvas")).not.toBeInTheDocument();
  });

  it("reads page 1 of the public nested reviews route for this producer", async () => {
    apiMock.get.mockResolvedValue(reviewsPayload([{ id: "r1", stars: 5, body: "טעים" }]));
    render(<ReviewCardCanvas producer={producer} />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    const [url, config] = apiMock.get.mock.calls[0];
    expect(url).toBe("/producers/p1/reviews");
    expect(config.params).toEqual({ page: 1 });
  });
});
