import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import GoogleRatingLine from "@/components/GoogleRatingLine";

// MEH-1490 — the quiet Google-rating SENTENCE: renders ONLY on a 200 with a
// rating; 204 / 404 / network error → renders nothing (no placeholder, no
// layout hole). Producer name (a prop, not from the endpoint) + attribution +
// the "לצפייה בהן ‹" out-link are asserted on the eligible render. No star glyph.

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: apiMock }));

// Key-path passthrough — assert on i18n KEYS + interpolation, not copy.
vi.mock("next-intl", () => ({
  useTranslations:
    (ns) =>
    (key, vals) =>
      (vals ? `${ns}.${key}:${JSON.stringify(vals)}` : `${ns}.${key}`),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GoogleRatingLine (MEH-1490)", () => {
  it("renders the sentence (name/count/rating) + out-link on a 200, no star", async () => {
    apiMock.get.mockResolvedValue({
      status: 200,
      data: {
        rating: 4.7,
        user_rating_count: 128,
        google_maps_uri: "https://maps.google.com/?cid=42",
      },
    });

    const { container } = render(
      <GoogleRatingLine producerId="p1" producerName="חוות השקמה" />,
    );

    // The out-link is the "לצפייה בהן ‹" CTA (cta key), pointing at the profile.
    const link = await screen.findByRole("link");
    expect(link).toHaveAttribute("href", "https://maps.google.com/?cid=42");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.textContent).toContain("producer.detail.google_rating.cta");

    // The sentence (name + count + rating, with "Google Maps" attribution) is
    // muted text OUTSIDE the link.
    expect(container.textContent).toContain(
      'producer.detail.google_rating.summary:{"name":"חוות השקמה","count":128,"rating":4.7}',
    );
    // No star glyph (nor any icon) — the component renders no SVGs.
    expect(container.querySelector("svg")).toBeNull();
    expect(apiMock.get).toHaveBeenCalledWith("/producers/p1/google-rating");
  });

  it("renders nothing on a 204 (below threshold / no key / API error)", async () => {
    apiMock.get.mockResolvedValue({ status: 204, data: "" });
    const { container } = render(<GoogleRatingLine producerId="p1" />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("renders nothing when the request rejects (404 / network)", async () => {
    apiMock.get.mockRejectedValue(new Error("Not Found"));
    const { container } = render(<GoogleRatingLine producerId="p1" />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    expect(container.querySelector("a")).toBeNull();
  });

  it("does not fetch when producerId is missing", () => {
    render(<GoogleRatingLine producerId={null} />);
    expect(apiMock.get).not.toHaveBeenCalled();
  });
});

// MEH-2581 — every fetch is one billed Google Enterprise call (nothing may be
// cached, ToS), so the line asks only once it nears the viewport. The
// IntersectionObserver is stubbed so each test decides WHEN it intersects.
describe("GoogleRatingLine lazy fetch (MEH-2581)", () => {
  let observers;
  let originalIO;

  beforeEach(() => {
    observers = [];
    originalIO = global.IntersectionObserver;
    global.IntersectionObserver = class {
      constructor(cb, opts) {
        this.cb = cb;
        this.opts = opts;
        this.disconnect = vi.fn();
        observers.push(this);
      }
      observe(el) {
        this.el = el;
      }
    };
    apiMock.get.mockResolvedValue({ status: 204, data: "" });
  });

  afterEach(() => {
    global.IntersectionObserver = originalIO;
  });

  it("does not call the API before the line scrolls near the viewport", () => {
    render(<GoogleRatingLine producerId="p1" producerName="x" />);
    expect(observers).toHaveLength(1);
    expect(observers[0].el).toBeTruthy();
    expect(apiMock.get).not.toHaveBeenCalled();
  });

  it("does not call the API on a non-intersecting callback", () => {
    render(<GoogleRatingLine producerId="p1" producerName="x" />);
    act(() => observers[0].cb([{ isIntersecting: false }]));
    expect(apiMock.get).not.toHaveBeenCalled();
  });

  it("calls the API exactly once when it intersects, then stops observing", async () => {
    render(<GoogleRatingLine producerId="p1" producerName="x" />);
    act(() => observers[0].cb([{ isIntersecting: true }]));
    act(() => observers[0].cb([{ isIntersecting: true }]));
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledTimes(1));
    expect(apiMock.get).toHaveBeenCalledWith("/producers/p1/google-rating");
    expect(observers[0].disconnect).toHaveBeenCalled();
  });

  it("fetches on mount when the browser has no IntersectionObserver", async () => {
    delete global.IntersectionObserver;
    render(<GoogleRatingLine producerId="p1" producerName="x" />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith("/producers/p1/google-rating"));
  });

  it("renders no visible box while waiting (the sentinel has no text, no classes)", () => {
    const { container } = render(<GoogleRatingLine producerId="p1" producerName="x" />);
    expect(container.textContent).toBe("");
    expect(container.querySelector("[class]")).toBeNull();
  });
});
