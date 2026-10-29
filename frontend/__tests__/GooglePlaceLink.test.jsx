import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import GooglePlaceLink from "@/app/[locale]/admin/producers/GooglePlaceLink";
import AdminReviewChecklist from "@/app/[locale]/admin/producers/AdminReviewChecklist";
import api from "@/lib/api";

/**
 * MEH-2582 — link a pending business to its Google profile from the approval
 * row. The Google rating line on the public page (MEH-1490) renders only for a
 * mapped place_id, and the only way to map one used to be the edit form, so
 * nobody did. States are a matrix (CLAUDE.md 5-state rule):
 *   linked / not linked × before search / 0 / 1 / many candidates,
 *   plus search error, saving, save error.
 */

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn() },
}));

const CANDIDATES = [
  { place_id: "ChIJ_a", display_name: "מאפיית הכפר", formatted_address: "בנימינה", user_rating_count: 57 },
  { place_id: "ChIJ_b", display_name: "מאפיית הכפר 2", formatted_address: null, user_rating_count: 4 },
  { place_id: "ChIJ_c", display_name: "כפר אחר", formatted_address: "חדרה", user_rating_count: 20 },
];

function mockSearch(candidates) {
  api.get.mockResolvedValue(
    candidates === null
      ? { status: 204, data: "" }
      : { status: 200, data: { candidates } },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GooglePlaceLink (MEH-2582)", () => {
  it("not linked: says why it matters and offers the search", () => {
    render(<GooglePlaceLink producerId="p1" placeId={null} />);
    expect(screen.getByText("פרופיל Google")).toBeInTheDocument();
    expect(
      screen.getByText("לא מקושר — בלי קישור, הדירוג מגוגל לא יופיע בדף העסק."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "חפשי בגוגל" })).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("linked: shows linked + a replace button, no search until replace", () => {
    render(<GooglePlaceLink producerId="p1" placeId="ChIJ_x" />);
    expect(screen.getByText("מקושר ✓")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "חפשי בגוגל" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "החלפה" }));
    expect(screen.getByRole("button", { name: "חפשי בגוגל" })).toBeInTheDocument();
  });

  it("search with 0 results says so", async () => {
    mockSearch(null);
    render(<GooglePlaceLink producerId="p1" placeId={null} />);
    fireEvent.click(screen.getByRole("button", { name: "חפשי בגוגל" }));
    expect(await screen.findByText("לא נמצאו תוצאות בגוגל")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/admin/producers/p1/google-place-candidates");
  });

  it("search with 1 result shows exactly one candidate", async () => {
    mockSearch(CANDIDATES.slice(0, 1));
    render(<GooglePlaceLink producerId="p1" placeId={null} />);
    fireEvent.click(screen.getByRole("button", { name: "חפשי בגוגל" }));
    expect(await screen.findByText("מאפיית הכפר")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("57 ביקורות")).toBeInTheDocument();
  });

  it("search with many results flags the ones under 20 reviews only", async () => {
    mockSearch(CANDIDATES);
    render(<GooglePlaceLink producerId="p1" placeId={null} />);
    fireEvent.click(screen.getByRole("button", { name: "חפשי בגוגל" }));
    await screen.findByText("כפר אחר");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getAllByText("פחות מ-20 ביקורות — השורה לא תוצג")).toHaveLength(1);
  });

  it("search error says try again", async () => {
    api.get.mockRejectedValue(new Error("boom"));
    render(<GooglePlaceLink producerId="p1" placeId={null} />);
    fireEvent.click(screen.getByRole("button", { name: "חפשי בגוגל" }));
    expect(await screen.findByText("החיפוש נכשל, נסי שוב")).toBeInTheDocument();
  });

  it("picking a candidate saves only google_place_id and shows linked", async () => {
    mockSearch(CANDIDATES);
    let resolvePut;
    api.put.mockReturnValue(new Promise((r) => { resolvePut = r; }));
    render(<GooglePlaceLink producerId="p1" placeId={null} />);
    fireEvent.click(screen.getByRole("button", { name: "חפשי בגוגל" }));
    fireEvent.click(await screen.findByText("מאפיית הכפר"));
    expect(await screen.findByText("שומרת…")).toBeInTheDocument();
    expect(api.put).toHaveBeenCalledWith("/admin/producers/p1/google-place-id", { google_place_id: "ChIJ_a" });
    resolvePut({ data: {} });
    expect(await screen.findByText("מקושר ✓")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).toBeNull();
  });

  it("tells the row it is linked only after the save succeeds", async () => {
    mockSearch(CANDIDATES);
    api.put.mockResolvedValue({ data: {} });
    const onLinked = vi.fn();
    render(<GooglePlaceLink producerId="p1" placeId={null} onLinked={onLinked} />);
    fireEvent.click(screen.getByRole("button", { name: "חפשי בגוגל" }));
    fireEvent.click(await screen.findByText("מאפיית הכפר"));
    await screen.findByText("מקושר ✓");
    expect(onLinked).toHaveBeenCalledWith("ChIJ_a");
  });

  it("a failed save does not tell the row anything", async () => {
    mockSearch(CANDIDATES);
    api.put.mockRejectedValue(new Error("500"));
    const onLinked = vi.fn();
    render(<GooglePlaceLink producerId="p1" placeId={null} onLinked={onLinked} />);
    fireEvent.click(screen.getByRole("button", { name: "חפשי בגוגל" }));
    fireEvent.click(await screen.findByText("מאפיית הכפר"));
    await screen.findByText("השמירה נכשלה, נסי שוב");
    expect(onLinked).not.toHaveBeenCalled();
  });

  it("a failed save says so and leaves it unlinked", async () => {
    mockSearch(CANDIDATES);
    api.put.mockRejectedValue(new Error("500"));
    render(<GooglePlaceLink producerId="p1" placeId={null} />);
    fireEvent.click(screen.getByRole("button", { name: "חפשי בגוגל" }));
    fireEvent.click(await screen.findByText("מאפיית הכפר"));
    expect(await screen.findByText("השמירה נכשלה, נסי שוב")).toBeInTheDocument();
    expect(screen.queryByText("מקושר ✓")).toBeNull();
  });
});

describe("AdminReviewChecklist shows the Google link (MEH-2582)", () => {
  const base = {
    onToggleOpen: () => {},
    checkedIds: new Set(),
    onToggleItem: () => {},
    items: [],
    itemsError: null,
    onReloadItems: () => {},
    saving: false,
  };

  it("renders the Google block when the checklist is open", () => {
    render(<AdminReviewChecklist {...base} open producer={{ id: "p1", google_place_id: null }} />);
    expect(screen.getByText("פרופיל Google")).toBeInTheDocument();
  });

  it("does not render it when closed", () => {
    render(<AdminReviewChecklist {...base} open={false} producer={{ id: "p1", google_place_id: null }} />);
    expect(screen.queryByText("פרופיל Google")).toBeNull();
  });

  it("waits for the save before it says linked", async () => {
    // Guards against an optimistic flip: linked must follow the PUT, not the click.
    api.get.mockResolvedValue({ status: 200, data: { candidates: CANDIDATES } });
    api.put.mockRejectedValue(new Error("500"));
    render(<AdminReviewChecklist {...base} open producer={{ id: "p1", google_place_id: null }} />);
    fireEvent.click(screen.getByRole("button", { name: "חפשי בגוגל" }));
    fireEvent.click(await screen.findByText("מאפיית הכפר"));
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect(screen.queryByText("מקושר ✓")).toBeNull();
  });
});
