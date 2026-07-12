import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ReviewsSection from "@/components/ReviewsSection";

// MEH-1039: business-owner reply UI. These tests cover CHUNK C (display +
// owner affordance). The PUT endpoint lands in CHUNK B (reviews.py, blocked
// on MEH-1001); here api.put is mocked, so the UI contract is exercised
// independently of the backend.

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const flat = {
      reply_heading: "תגובת בית העסק",
      reply_add: "הוספת תגובה",
      reply_edit: "עריכת תגובה",
      reply_placeholder: "כתבו תגובה ללקוח…",
      reply_save: "שמירה",
      cancel: "ביטול",
      submit_saving: "בשמירה...",
      owner_only_eyebrow: "מוצג רק לך",
    };
    const t = (key) => flat[key] || key;
    t.rich = (key) => key; // guest login-prompt path
    return t;
  },
  useLocale: () => "he",
}));

const { apiMock, authState } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
  authState: { user: null },
}));

vi.mock("@/lib/api", () => ({ default: apiMock }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authState }));
vi.mock("@/lib/toast", () => ({ showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/errors", () => ({ detailToMessage: (d) => (typeof d === "string" ? d : null) }));
vi.mock("@/lib/format-date", () => ({ formatEventDate: () => "7.7.2026" }));
vi.mock("@/components/ui/EmptyState", () => ({ default: () => <div data-testid="empty-state" /> }));
vi.mock("@phosphor-icons/react", () => ({
  Star: (props) => <span data-testid="icon-star" {...props} />,
  Leaf: (props) => <span data-testid="icon-leaf" {...props} />,
  EyeSlash: (props) => <span data-testid="icon-eyeslash" {...props} />,
  ArrowLeft: (props) => <span {...props} />,
  ArrowRight: (props) => <span {...props} />,
}));

// Lazy-load gate: fire the IntersectionObserver callback immediately.
beforeEach(() => {
  authState.user = null;
  apiMock.get.mockReset();
  apiMock.put.mockReset();
  global.IntersectionObserver = class {
    constructor(cb) {
      this.cb = cb;
    }
    observe() {
      this.cb([{ isIntersecting: true }]);
    }
    disconnect() {}
  };
});

const withReply = {
  id: "rev-1",
  user_id: "u-1",
  user_name: "לקוחה טובה",
  stars: 5,
  body: "מוצרים מעולים",
  created_at: "2026-07-01T10:00:00",
  reply: "תודה רבה על המילים החמות!",
  reply_at: "2026-07-02T09:00:00",
};

const noReply = {
  id: "rev-2",
  user_id: "u-2",
  user_name: "לקוח נוסף",
  stars: 4,
  body: "טעים",
  created_at: "2026-07-01T11:00:00",
  reply: null,
  reply_at: null,
};

function mockReviews(reviews) {
  apiMock.get.mockResolvedValue({
    data: { reviews, total: reviews.length, page: 1, pages: 1 },
  });
}

describe("ReviewsSection — business reply (MEH-1039)", () => {
  it("renders the reply block + heading when review.reply is present", async () => {
    mockReviews([withReply]);
    render(<ReviewsSection producerId="p-1" isOwner={false} />);
    expect(await screen.findByText("תודה רבה על המילים החמות!")).toBeInTheDocument();
    expect(screen.getByText("תגובת בית העסק")).toBeInTheDocument();
  });

  it("renders nothing for an empty reply (no heading, no owner button as guest)", async () => {
    mockReviews([noReply]);
    render(<ReviewsSection producerId="p-1" isOwner={false} />);
    expect(await screen.findByText("טעים")).toBeInTheDocument();
    expect(screen.queryByText("תגובת בית העסק")).not.toBeInTheDocument();
    expect(screen.queryByText("הוספת תגובה")).not.toBeInTheDocument();
  });

  it("shows the owner affordance: edit for a replied review, add for an empty one", async () => {
    mockReviews([withReply, noReply]);
    render(<ReviewsSection producerId="p-1" isOwner={true} />);
    expect(await screen.findByText("עריכת תגובה")).toBeInTheDocument();
    expect(screen.getByText("הוספת תגובה")).toBeInTheDocument();
  });

  it("owner add flow: opens textarea and PUTs the reply", async () => {
    mockReviews([noReply]);
    apiMock.put.mockResolvedValue({ data: { ...noReply, reply: "שמחנו לשרת!", reply_at: "2026-07-07T00:00:00" } });
    render(<ReviewsSection producerId="p-1" isOwner={true} />);

    fireEvent.click(await screen.findByText("הוספת תגובה"));
    const textarea = screen.getByPlaceholderText("כתבו תגובה ללקוח…");
    fireEvent.change(textarea, { target: { value: "שמחנו לשרת!" } });
    fireEvent.click(screen.getByText("שמירה"));

    await waitFor(() =>
      expect(apiMock.put).toHaveBeenCalledWith("/reviews/rev-2/reply", { reply: "שמחנו לשרת!" }),
    );
  });

  it("disables Save until the draft has at least 2 chars", async () => {
    mockReviews([noReply]);
    render(<ReviewsSection producerId="p-1" isOwner={true} />);
    fireEvent.click(await screen.findByText("הוספת תגובה"));
    const saveBtn = screen.getByText("שמירה");
    expect(saveBtn).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("כתבו תגובה ללקוח…"), { target: { value: "ok" } });
    expect(saveBtn).not.toBeDisabled();
  });
});

describe("ReviewsSection — owner-only eyebrow (MEH-1114)", () => {
  it("shows the 'מוצג רק לך' eyebrow above the owner empty state", async () => {
    mockReviews([]);
    render(<ReviewsSection producerId="p-1" isOwner={true} />);
    expect(await screen.findByText("מוצג רק לך")).toBeInTheDocument();
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
  });

  it("does NOT show the owner eyebrow on the consumer empty state", async () => {
    mockReviews([]);
    render(<ReviewsSection producerId="p-1" isOwner={false} />);
    // consumer path renders the Leaf empty message, never the owner eyebrow
    await waitFor(() => expect(screen.queryByTestId("empty-state")).not.toBeInTheDocument());
    expect(screen.queryByText("מוצג רק לך")).not.toBeInTheDocument();
  });
});

describe("ReviewsSection — single empty-state box with merged gate hint (MEH-1139)", () => {
  // Unmapped keys fall through the next-intl mock as raw key strings, so
  // assertions below target key names (wa_gate_message / empty_message / …).
  it("empty + logged-in non-gated viewer: ONE box — gate box gone, hint merged into empty state", async () => {
    authState.user = { id: "u-9", producer_id: null };
    mockReviews([]);
    render(<ReviewsSection producerId="p-1" isOwner={false} />);
    expect(await screen.findByText(/empty_message/)).toBeInTheDocument();
    expect(screen.getByText(/empty_gate_hint/)).toBeInTheDocument();
    expect(screen.queryByText("wa_gate_message")).not.toBeInTheDocument();
  });

  it("reviews exist + logged-in non-gated viewer: standalone gate box still renders", async () => {
    authState.user = { id: "u-9", producer_id: null };
    mockReviews([
      {
        id: "rev-9", user_id: "u-2", user_name: "לקוח", stars: 4, body: "טעים",
        created_at: "2026-07-01T11:00:00", reply: null, reply_at: null,
      },
    ]);
    render(<ReviewsSection producerId="p-1" isOwner={false} />);
    expect(await screen.findByText("wa_gate_message")).toBeInTheDocument();
    expect(screen.queryByText(/empty_gate_hint/)).not.toBeInTheDocument();
  });

  it("empty + guest: empty message only, no gate hint", async () => {
    mockReviews([]);
    render(<ReviewsSection producerId="p-1" isOwner={false} />);
    expect(await screen.findByText(/empty_message/)).toBeInTheDocument();
    expect(screen.queryByText(/empty_gate_hint/)).not.toBeInTheDocument();
  });
});
