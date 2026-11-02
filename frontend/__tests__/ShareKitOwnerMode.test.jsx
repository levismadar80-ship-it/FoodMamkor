import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import StoryCardCanvas from "@/components/StoryCardCanvas";

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
