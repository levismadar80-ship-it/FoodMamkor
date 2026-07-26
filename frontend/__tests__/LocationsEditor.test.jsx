import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LocationsEditor from "@/app/[locale]/producer/dashboard/edit/LocationsEditor";

// MEH-1421 (MEH-1388 chunk 4a): owner location CRUD editor. Verifies the
// Rule-19 safeParse gate (an out-of-bounds coord toasts + never POSTs) and the
// happy-path create.

const apiMock = vi.hoisted(() => ({
  get: vi.fn(() => Promise.resolve({ data: [] })),
  post: vi.fn(() => Promise.resolve({ data: {} })),
  put: vi.fn(() => Promise.resolve({ data: {} })),
  delete: vi.fn(() => Promise.resolve({})),
}));
vi.mock("@/lib/api", () => ({ default: apiMock }));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/lib/toast", () => ({ showToast: toastMock }));

vi.mock("next-intl", () => ({
  useTranslations: (scope) => (key) => (scope ? `${scope}.${key}` : key),
}));

beforeEach(() => {
  apiMock.get.mockClear();
  apiMock.post.mockClear();
  toastMock.info.mockClear();
  apiMock.get.mockResolvedValue({ data: [] });
});

async function openAddForm() {
  render(<LocationsEditor />);
  // Empty-state CTA opens the add form.
  await waitFor(() => screen.getByText("settings.locations.empty_cta"));
  fireEvent.click(screen.getByText("settings.locations.empty_cta"));
  await waitFor(() => screen.getByTestId("location-form"));
}

describe("LocationsEditor (MEH-1421)", () => {
  it("renders the empty state when there are no locations", async () => {
    render(<LocationsEditor />);
    await waitFor(() =>
      expect(screen.getByText("settings.locations.empty_title")).toBeTruthy(),
    );
    expect(apiMock.get).toHaveBeenCalledWith("/producers/me/locations");
  });

  it("blocks an out-of-bounds coordinate before POSTing (Rule 19 safeParse)", async () => {
    await openAddForm();
    fireEvent.change(screen.getByTestId("location-lat"), { target: { value: "200" } });
    fireEvent.click(screen.getByTestId("location-save"));

    await waitFor(() => expect(toastMock.info).toHaveBeenCalled());
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("POSTs a valid location and reloads the list", async () => {
    await openAddForm();
    // Default form (kind=branch, blank optional fields) is valid.
    fireEvent.click(screen.getByTestId("location-save"));

    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith(
        "/producers/me/locations",
        expect.objectContaining({ kind: "branch", is_primary: false }),
      ),
    );
    // One initial fetch + one reload after the successful create.
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledTimes(2));
  });
});

// MEH-1563: the coords disclosure is the only non-trivial logic in the
// field-guidance layer — a NEW location must not open on two unexplained
// numeric inputs, but editing a row that already carries coordinates must not
// hide a value the owner previously set.
describe("coords disclosure (MEH-1563)", () => {
  const detailsOf = () =>
    screen.getByTestId("location-coords-toggle").closest("details");

  it("starts closed on a new location", async () => {
    await openAddForm();
    expect(detailsOf().open).toBe(false);
  });

  it("starts open when the edited location already has coordinates", async () => {
    apiMock.get.mockResolvedValue({
      data: [{ id: 5, kind: "branch", lat: 32.818, lng: 34.999 }],
    });
    render(<LocationsEditor />);

    await waitFor(() => screen.getByLabelText("settings.locations.edit_aria"));
    fireEvent.click(screen.getByLabelText("settings.locations.edit_aria"));

    await waitFor(() => screen.getByTestId("location-form"));
    expect(detailsOf().open).toBe(true);
  });
});
