import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import StoryCardCanvas from "@/components/StoryCardCanvas";

// MEH-1267: the story panel gained a visible X close button (logical-start
// top corner) and Esc-to-close. Both invoke onClose so the parent kebab
// toggle can dismiss the panel; the kebab toggle behavior itself is unchanged.

const apiMock = vi.hoisted(() => ({ post: vi.fn(() => Promise.resolve({ data: {} })) }));
vi.mock("@/lib/api", () => ({ default: apiMock }));
vi.mock("@/lib/toast", () => ({ showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock("next-intl", () => {
  const flat = {
    "story.canvas.title": "כרטיס אינסטגרם מוכן",
    "story.canvas.close": "סגירת פאנל הסטורי",
    "story.canvas.footer_url": "גלי עוד בתי עסק ב mehamakor.co.il",
    "story.canvas.generating": "מייצר",
  };
  const resolve = (fullKey) => flat[fullKey] ?? fullKey;
  return { useTranslations: (scope) => (key) => resolve(scope ? `${scope}.${key}` : key) };
});

// jsdom has no real 2D canvas — stub getContext so drawCard() runs without
// throwing. The close-button wiring under test is independent of the canvas.
beforeAll(() => {
  const ctxStub = {
    fillRect: () => {}, beginPath: () => {}, arc: () => {}, fill: () => {},
    save: () => {}, clip: () => {}, drawImage: () => {}, restore: () => {},
    stroke: () => {}, moveTo: () => {}, lineTo: () => {}, closePath: () => {},
    fillText: () => {}, measureText: () => ({ width: 0 }),
  };
  HTMLCanvasElement.prototype.getContext = () => ctxStub;
});

const producer = { id: "p1", name: "מאפיית טסט", city: "חיפה", slug: "test-bakery", images: [], categories: [] };

describe("StoryCardCanvas — close button (MEH-1267)", () => {
  beforeEach(() => apiMock.post.mockClear());

  it("renders an X close button and invokes onClose when clicked", async () => {
    const onClose = vi.fn();
    render(<StoryCardCanvas producer={producer} onClose={onClose} />);
    const closeBtn = screen.getByLabelText("סגירת פאנל הסטורי");
    expect(closeBtn).toBeInTheDocument();
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<StoryCardCanvas producer={producer} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("renders no close button when onClose is absent", async () => {
    render(<StoryCardCanvas producer={producer} />);
    expect(screen.queryByLabelText("סגירת פאנל הסטורי")).not.toBeInTheDocument();
  });
});
