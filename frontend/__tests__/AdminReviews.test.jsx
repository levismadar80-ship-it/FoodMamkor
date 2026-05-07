import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AdminReviewsPage from "@/app/[locale]/admin/reviews/page";

// Mock Phosphor icons — spans so we can assert presence
vi.mock("@phosphor-icons/react", () => ({
  Star: (props) => <span data-testid="star-icon" {...props} />,
  Trash: (props) => <span data-testid="trash-icon" {...props} />,
}));

// Mock API — mutable default response
const mockResponse = { current: { data: [] } };
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(() => Promise.resolve(mockResponse.current)),
    delete: vi.fn(() => Promise.resolve({})),
  },
}));

// Mock toast
vi.mock("@/lib/toast", () => ({
  showToast: vi.fn(),
}));

const sampleReviews = [
  {
    id: "r1",
    producer_id: "p1",
    producer_name: "חוות השקמה",
    user_id: "u1",
    user_name: "דנה כהן",
    user_email: "dana@example.com",
    stars: 5,
    title: "מעולה",
    body: "הכי טעים",
    created_at: "2026-04-01T10:00:00",
  },
  {
    id: "r2",
    producer_id: "p2",
    producer_name: "מאפיית אביב",
    user_id: "u2",
    user_name: "רוני לוי",
    user_email: "roni@example.com",
    stars: 2,
    title: null,
    body: "לא התאים לי",
    created_at: "2026-04-02T10:00:00",
  },
];

describe("AdminReviewsPage", () => {
  beforeEach(() => {
    mockResponse.current = { data: sampleReviews };
  });

  it("loads reviews and renders rows", async () => {
    render(<AdminReviewsPage />);
    await waitFor(() => expect(screen.getByText("חוות השקמה")).toBeInTheDocument());
    expect(screen.getByText("מאפיית אביב")).toBeInTheDocument();
    expect(screen.getByText("דנה כהן")).toBeInTheDocument();
    expect(screen.getByText("רוני לוי")).toBeInTheDocument();
  });

  it("shows count badge", async () => {
    render(<AdminReviewsPage />);
    await waitFor(() => expect(screen.getByText("2 מתוך 2")).toBeInTheDocument());
  });

  it("renders empty state when no reviews", async () => {
    mockResponse.current = { data: [] };
    render(<AdminReviewsPage />);
    await waitFor(() =>
      expect(screen.getByText("אין ביקורות להצגה")).toBeInTheDocument(),
    );
  });

  it("filters by free-text search across producer, user, title, body", async () => {
    render(<AdminReviewsPage />);
    await waitFor(() => expect(screen.getByText("חוות השקמה")).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText(
      "חיפוש לפי עסק, משתמש, כותרת או טקסט...",
    );
    fireEvent.change(searchInput, { target: { value: "מאפיית" } });

    await waitFor(() => {
      expect(screen.queryByText("חוות השקמה")).not.toBeInTheDocument();
      expect(screen.getByText("מאפיית אביב")).toBeInTheDocument();
    });
  });

  it("filters by star rating", async () => {
    render(<AdminReviewsPage />);
    await waitFor(() => expect(screen.getByText("חוות השקמה")).toBeInTheDocument());

    const select = screen.getByLabelText("סינון לפי דירוג");
    fireEvent.change(select, { target: { value: "5" } });

    await waitFor(() => {
      expect(screen.getByText("חוות השקמה")).toBeInTheDocument();
      expect(screen.queryByText("מאפיית אביב")).not.toBeInTheDocument();
    });
  });

  it("deletes a review after confirm + removes the row optimistically", async () => {
    const api = (await import("@/lib/api")).default;
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<AdminReviewsPage />);
    await waitFor(() => expect(screen.getByText("חוות השקמה")).toBeInTheDocument());

    // Delete button for the first row (דנה כהן)
    const deleteBtn = screen.getByLabelText("מחקי ביקורת של דנה כהן");
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith("/reviews/r1");
    });
    await waitFor(() => {
      expect(screen.queryByText("חוות השקמה")).not.toBeInTheDocument();
    });
    expect(screen.getByText("מאפיית אביב")).toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it("does NOT delete when user cancels confirm", async () => {
    const api = (await import("@/lib/api")).default;
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    api.delete.mockClear();

    render(<AdminReviewsPage />);
    await waitFor(() => expect(screen.getByText("חוות השקמה")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("מחקי ביקורת של דנה כהן"));
    // No delete call, row still there
    expect(api.delete).not.toHaveBeenCalled();
    expect(screen.getByText("חוות השקמה")).toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it("renders placeholder when title and body are both missing", async () => {
    mockResponse.current = {
      data: [
        {
          ...sampleReviews[0],
          title: null,
          body: null,
        },
      ],
    };
    render(<AdminReviewsPage />);
    await waitFor(() => expect(screen.getByText("חוות השקמה")).toBeInTheDocument());
    // 3 emdashes: producer_email-is-present row shows only the content em-dash
    const emdashes = screen.getAllByText("—");
    expect(emdashes.length).toBeGreaterThan(0);
  });
});
