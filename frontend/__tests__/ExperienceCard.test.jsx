import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// MEH-1143: mock next-intl per the RecipeCard.test.jsx / ProducerCard.test.jsx
// precedent — the card uses useTranslations + useLocale.
vi.mock("next-intl", () => ({
  useTranslations: () => (key, values = {}) => {
    const flat = {
      free: "חינם",
      host_fallback: "מארח/ת",
      spots_left: `נותרו ${values.n} מקומות`,
      sold_out: "אזל",
    };
    return flat[key] ?? key;
  },
  useLocale: () => "he",
}));

import ExperienceCard from "@/components/ExperienceCard";

const BASE = {
  id: "exp-7",
  title: "סדנת בישול איטלקי",
  image_url: "https://res.cloudinary.com/demo/image/upload/workshop.jpg",
  event_date: "2026-08-18",
  event_time: "17:00:00",
  host: { name: "שף מרקו" },
  city: "תל אביב",
  description: "פסטה טרייה מהיסוד.",
  category: "בישול",
  price_per_person: 250,
  spots_left: 3,
};

describe("ExperienceCard", () => {
  it("renders the title and links to the experience URL", () => {
    render(<ExperienceCard experience={BASE} />);
    expect(screen.getByText("סדנת בישול איטלקי")).toBeInTheDocument();
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/experiences/exp-7");
  });

  it("renders the image (role=img) and NO placeholder when image_url is set", () => {
    render(<ExperienceCard experience={BASE} />);
    expect(screen.getByRole("img")).toBeInTheDocument();
    expect(screen.queryByTestId("experience-image-missing")).toBeNull();
  });

  it("shows the canonical Leaf + brand-name placeholder when image_url is missing", () => {
    render(<ExperienceCard experience={{ ...BASE, image_url: null }} />);
    // MEH-1143: Assembly v2 no-image state = Phosphor Leaf + "מהמקור" brand
    // name (replaces the MEH-862 CookingPot). No CSS-background <img>.
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByTestId("experience-image-missing")).toBeInTheDocument();
    expect(screen.getByText("מהמקור")).toBeInTheDocument();
  });
});
