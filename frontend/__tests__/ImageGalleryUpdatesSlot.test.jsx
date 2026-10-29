import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * MEH-2562 — the «קבלת עדכונים» bell is a third hero circle on mobile, next to
 * share + heart, in BOTH hero branches (imageless masthead and imaged). The
 * page passes the button in as `updatesButton`; this pins where it lands.
 */

vi.mock("next-intl", () => ({ useTranslations: () => (key) => key }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/components/ShareButton", () => ({ default: () => <div data-testid="share-overlay" /> }));
vi.mock("@/components/FavoriteButton", () => ({ default: () => <div data-testid="fav-overlay" /> }));
vi.mock("@/components/ImageWithFallback", () => ({ default: () => <div data-testid="image" /> }));

import ImageGallery from "@/components/ImageGallery";

const bell = <button data-testid="updates-bell" />;
const base = { producerId: 7, producerName: "חוות הדבש", shareUrl: "https://x", updatesButton: bell };

function expectBesideHeart() {
  const b = screen.getByTestId("updates-bell");
  const cluster = b.parentElement;
  expect(cluster.contains(screen.getByTestId("fav-overlay"))).toBe(true);
  expect(cluster.contains(screen.getByTestId("share-overlay"))).toBe(true);
  // Mobile-only: on desktop the quiet bell lives in the header actions row.
  expect(cluster.className).toMatch(/(^|\s)lg:hidden(\s|$)/);
  // Order: share · heart · bell (the bell follows the heart it depends on).
  expect([...cluster.children].map((el) => el.dataset.testid)).toEqual([
    "share-overlay",
    "fav-overlay",
    "updates-bell",
  ]);
}

describe("MEH-2562 · hero updates bell", () => {
  it("imageless masthead: bell sits in the share + heart cluster", () => {
    render(<ImageGallery {...base} images={[]} />);
    expectBesideHeart();
  });

  it("imaged hero: bell sits in the share + heart cluster", () => {
    render(<ImageGallery {...base} images={["https://res.cloudinary.com/a.jpg", "https://res.cloudinary.com/b.jpg"]} />);
    expectBesideHeart();
  });

  it("no producerId (preview contexts): no cluster, no bell", () => {
    render(<ImageGallery {...base} producerId={null} images={[]} />);
    expect(screen.queryByTestId("updates-bell")).toBeNull();
  });
});
