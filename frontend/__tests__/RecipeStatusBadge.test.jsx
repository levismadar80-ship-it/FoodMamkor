import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// MEH-475 PR-C1: mock next-intl per Wave 3 precedent (ProducerCard.test.jsx).
vi.mock("next-intl", () => ({
  useTranslations: () => (key) => {
    const flat = {
      pending: "ממתין לאישור",
      approved: "אושר ופורסם",
      rejected: "נדחה",
      needs_revision: "צריך תיקון",
    };
    return flat[key] ?? key;
  },
}));

import RecipeStatusBadge from "@/components/RecipeStatusBadge";

describe("RecipeStatusBadge", () => {
  it("renders the Hebrew label for `pending`", () => {
    render(<RecipeStatusBadge status="pending" />);
    expect(screen.getByText("ממתין לאישור")).toBeInTheDocument();
  });

  it("renders the Hebrew label for `approved`", () => {
    render(<RecipeStatusBadge status="approved" />);
    expect(screen.getByText("אושר ופורסם")).toBeInTheDocument();
  });

  it("renders the Hebrew label for `rejected`", () => {
    render(<RecipeStatusBadge status="rejected" />);
    expect(screen.getByText("נדחה")).toBeInTheDocument();
  });

  it("renders the Hebrew label for `needs_revision`", () => {
    render(<RecipeStatusBadge status="needs_revision" />);
    expect(screen.getByText("צריך תיקון")).toBeInTheDocument();
  });

  it("falls back gracefully on unknown status", () => {
    render(<RecipeStatusBadge status="something_new" />);
    // Unknown status echoes back the raw string so a future backend
    // state never silently renders as blank.
    expect(screen.getByText("something_new")).toBeInTheDocument();
  });

  it("renders a dash when status is missing", () => {
    render(<RecipeStatusBadge />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
