import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// MEH-1334 chunk 3 — "מאחורי העסק" data-gated owner card. Live variant today
// is compact (contact_name + city); bio/photo variants stay dormant until the
// MEH-1335 optional fields exist on the payload. Never an empty card.
vi.mock("next-intl", () => ({
  useTranslations: () => (key) => (key === "heading" ? "מאחורי העסק" : key),
}));
vi.mock("@/components/ImageWithFallback", () => ({
  default: (props) => <img data-testid="owner-photo" alt={props.alt} />,
}));

import OwnerCard from "@/app/[locale]/producer/[id]/components/OwnerCard";

describe("OwnerCard (MEH-1334 chunk 3)", () => {
  it("compact variant: name + city + single-letter initials avatar", () => {
    render(<OwnerCard producer={{ contact_name: "נועה קרן", city: "קצרין" }} />);
    expect(screen.getByTestId("owner-card")).toBeInTheDocument();
    expect(screen.getByText("מאחורי העסק")).toBeInTheDocument();
    expect(screen.getByText("נועה קרן")).toBeInTheDocument();
    expect(screen.getByText("קצרין")).toBeInTheDocument();
    // single letter — never two (revision-2 #12)
    expect(screen.getByTestId("owner-initial").textContent).toBe("נ");
    expect(screen.queryByTestId("owner-photo")).not.toBeInTheDocument();
  });

  it("hidden entirely when contact_name is absent or blank", () => {
    const { unmount } = render(<OwnerCard producer={{ city: "קצרין" }} />);
    expect(screen.queryByTestId("owner-card")).not.toBeInTheDocument();
    unmount();
    render(<OwnerCard producer={{ contact_name: "   ", city: "קצרין" }} />);
    expect(screen.queryByTestId("owner-card")).not.toBeInTheDocument();
  });

  it("bio variant (dormant MEH-1335 field): renders the bio paragraph + initials", () => {
    render(
      <OwnerCard
        producer={{ contact_name: "נועה קרן", city: "קצרין", owner_bio: "גדלתי בין העיזים." }}
      />,
    );
    expect(screen.getByText("גדלתי בין העיזים.")).toBeInTheDocument();
    expect(screen.getByTestId("owner-initial")).toBeInTheDocument();
  });

  it("photo variant (dormant MEH-1335 field): renders the photo, no initials", () => {
    render(
      <OwnerCard
        producer={{
          contact_name: "נועה קרן",
          city: "קצרין",
          owner_bio: "ביו",
          owner_photo_url: "https://res.cloudinary.com/x/noa.jpg",
        }}
      />,
    );
    expect(screen.getByTestId("owner-photo")).toBeInTheDocument();
    expect(screen.queryByTestId("owner-initial")).not.toBeInTheDocument();
  });
});
