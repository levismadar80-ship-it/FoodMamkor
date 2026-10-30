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

  // MEH-2471: self-registration never writes contact_name, so the card must
  // not depend on it — a photo or a bio alone is the person behind the business.
  describe("MEH-2471 — no contact_name, but the owner told her story", () => {
    it("photo + bio, no name: photo (alt = business name) + bio, no name line", () => {
      render(
        <OwnerCard
          producer={{
            name: "משק הגליל",
            city: "קצרין",
            owner_bio: "גדלתי בין העיזים.",
            owner_photo_url: "https://res.cloudinary.com/x/noa.jpg",
          }}
        />,
      );
      expect(screen.getByTestId("owner-card")).toBeInTheDocument();
      expect(screen.getByTestId("owner-photo").getAttribute("alt")).toBe("משק הגליל");
      expect(screen.getByText("גדלתי בין העיזים.")).toBeInTheDocument();
      expect(screen.queryByRole("heading", { level: 3 })).not.toBeInTheDocument();
    });

    it("bio only, no name: the bio, no avatar", () => {
      render(<OwnerCard producer={{ name: "משק", city: "קצרין", owner_bio: "ביו" }} />);
      expect(screen.getByText("ביו")).toBeInTheDocument();
      expect(screen.queryByTestId("owner-initial")).not.toBeInTheDocument();
      expect(screen.queryByTestId("owner-photo")).not.toBeInTheDocument();
    });

    it("photo only, no name: the photo", () => {
      render(<OwnerCard producer={{ name: "משק", owner_photo_url: "https://res.cloudinary.com/x/a.jpg" }} />);
      expect(screen.getByTestId("owner-photo")).toBeInTheDocument();
    });

    it("blank bio and photo strings still count as nothing", () => {
      render(<OwnerCard producer={{ name: "משק", owner_bio: "  ", owner_photo_url: " " }} />);
      expect(screen.queryByTestId("owner-card")).not.toBeInTheDocument();
    });
  });
});


// MEH-2592 — nested inside «אודות»: small h3 heading, no white card, green-50
// avatar. The standalone card (organizer page, business without description)
// is unchanged.
describe("OwnerCard nested (MEH-2592)", () => {
  it("nested: h3 heading, no white card, avatar + name + city + bio", () => {
    render(
      <OwnerCard
        nested
        producer={{ contact_name: "נועה קרן", city: "קצרין", owner_bio: "גדלתי בין העיזים." }}
      />,
    );
    const card = screen.getByTestId("owner-card");
    expect(card.dataset.nested).toBe("true");
    expect(screen.getByRole("heading", { level: 3, name: "מאחורי העסק" })).toBeInTheDocument();
    expect(card.querySelector(".bg-white")).toBeNull();
    expect(card.className).not.toContain("bg-white");
    expect(screen.getByTestId("owner-initial").className).toContain("bg-green-50");
    expect(screen.getByText("גדלתי בין העיזים.")).toBeInTheDocument();
  });

  it("standalone keeps its h2 + white card", () => {
    render(<OwnerCard producer={{ contact_name: "נועה קרן", city: "קצרין" }} />);
    expect(screen.getByRole("heading", { level: 2, name: "מאחורי העסק" })).toBeInTheDocument();
    expect(screen.getByTestId("owner-card").querySelector(".bg-white")).not.toBeNull();
  });

  it("nested still hides when there is nothing to show", () => {
    render(<OwnerCard nested producer={{ city: "קצרין" }} />);
    expect(screen.queryByTestId("owner-card")).toBeNull();
  });
});
