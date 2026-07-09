import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// MEH-1048 chunk 2: one short review quote above the fold. Shows the most-recent
// review WITH text (falls through rating-only ones), truncates ≤120, and makes
// no fetch at all when the producer has zero reviews.
const mockGet = vi.fn();
vi.mock("@/lib/api", () => ({ default: { get: (...args) => mockGet(...args) } }));

vi.mock("next-intl", () => ({ useTranslations: () => (key) => key }));
vi.mock("@phosphor-icons/react", () => ({ Quotes: () => <span data-testid="quotes-icon" /> }));

import ReviewExcerpt from "@/app/[locale]/producer/[id]/components/ReviewExcerpt";

const review = (body, i = 0) => ({ id: `r${i}`, stars: 5, body, created_at: "2026-07-01" });

beforeEach(() => mockGet.mockReset());

describe("ReviewExcerpt (MEH-1048 chunk 2)", () => {
  it("makes no fetch and renders nothing when reviews_count is 0", async () => {
    render(<ReviewExcerpt producerId="p1" reviewsCount={0} />);
    // give any (wrongly-scheduled) effect a tick
    await new Promise((r) => setTimeout(r, 10));
    expect(mockGet).not.toHaveBeenCalled();
    expect(screen.queryByTestId("review-excerpt")).not.toBeInTheDocument();
  });

  it("shows the newest review that has text", async () => {
    mockGet.mockResolvedValue({ data: { reviews: [review("הדבש מדהים, שירות מצוין", 1)] } });
    render(<ReviewExcerpt producerId="p1" reviewsCount={3} />);
    const el = await screen.findByTestId("review-excerpt");
    expect(el).toHaveTextContent("הדבש מדהים, שירות מצוין");
    expect(el).toHaveAttribute("href", "#reviews");
    // objectContaining tolerates the AbortController `signal` (a11y-followup).
    expect(mockGet).toHaveBeenCalledWith(
      "/producers/p1/reviews",
      expect.objectContaining({ params: { page: 1 } }),
    );
  });

  it("falls through a rating-only newest review to the most-recent one with text", async () => {
    mockGet.mockResolvedValue({
      data: { reviews: [review(null, 1), review("   ", 2), review("ביקורת עם טקסט", 3)] },
    });
    render(<ReviewExcerpt producerId="p1" reviewsCount={5} />);
    const el = await screen.findByTestId("review-excerpt");
    expect(el).toHaveTextContent("ביקורת עם טקסט");
  });

  it("renders nothing when reviews exist but none have text", async () => {
    mockGet.mockResolvedValue({ data: { reviews: [review(null, 1), review("", 2), review("  ", 3)] } });
    render(<ReviewExcerpt producerId="p1" reviewsCount={3} />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByTestId("review-excerpt")).not.toBeInTheDocument();
  });

  it("truncates a long body to 120 chars + ellipsis", async () => {
    const long = "א".repeat(200);
    mockGet.mockResolvedValue({ data: { reviews: [review(long, 1)] } });
    render(<ReviewExcerpt producerId="p1" reviewsCount={1} />);
    await screen.findByTestId("review-excerpt");
    // Assert on the quote span only (the link also holds an sr-only nav suffix).
    const text = screen.getByTestId("review-excerpt-text").textContent;
    expect(text.endsWith("…")).toBe(true);
    expect(text.length).toBeLessThanOrEqual(121); // 120 chars + ellipsis
  });
});
