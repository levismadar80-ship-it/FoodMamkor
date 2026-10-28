import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";

/**
 * MEH-2526 — on /favorites, every card's bell carries the visible label
 * «עדכונים», so the control that opens the alert settings says what it is.
 *
 * (0 / 1 / many cards) × (panel closed / panel open): the label count equals
 * the card count in every cell, and the bell's accessible name contains the
 * visible label (WCAG 2.5.3 label-in-name).
 */

vi.mock("next/navigation", () => {
  const router = { push: vi.fn(), replace: vi.fn() };
  return { useRouter: () => router };
});
// Stable identity: FavoritesClient's fetch effect depends on `user`.
const stableUser = { id: "u1" };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: stableUser, loading: false }),
}));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
vi.mock("@/lib/favorites-cache", () => ({
  ensureFavoritesLoaded: () => Promise.resolve(new Set()),
  isFavorited: () => true,
  subscribeFavorites: () => () => {},
}));
vi.mock("@/components/ProducerCard", () => ({
  default: ({ producer }) => <div data-testid="card">{producer.name}</div>,
}));
vi.mock("@/components/AlertPrefsPanel", () => ({
  default: () => <div data-testid="alert-panel" />,
}));
vi.mock("@/components/Breadcrumb", () => ({ default: () => <nav /> }));

import api from "@/lib/api";
import FavoritesClient from "@/app/[locale]/favorites/FavoritesClient";

const LABEL = "עדכונים";

const rows = (n) =>
  Array.from({ length: n }, (_, i) => {
    const id = `${i + 1}`.padStart(8, "0") + "-1111-4111-8111-111111111111";
    return { producer_id: id, producer: { id, name: `עסק ${i + 1}` } };
  });

const renderWith = async (n) => {
  api.get.mockResolvedValue({ data: rows(n) });
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <FavoritesClient />
    </NextIntlClientProvider>,
  );
  if (n === 0) {
    await screen.findByText(he.favorites.empty_title);
  } else {
    await waitFor(() => expect(screen.getAllByTestId("card")).toHaveLength(n));
  }
};

const bells = () => screen.queryAllByTestId("favorites-bell");

beforeEach(() => vi.clearAllMocks());

describe("MEH-2526 · favorites bell label", () => {
  it("copy: «עדכונים» with an English twin", () => {
    expect(he.favorites.bell_label).toBe(LABEL);
    expect(en.favorites.bell_label).not.toMatch(/[֐-׿]/);
  });

  it("0 cards → no bell, no label", async () => {
    await renderWith(0);
    expect(bells()).toHaveLength(0);
    expect(screen.queryByText(LABEL)).toBeNull();
  });

  it.each([1, 3])("%i card(s), panel closed → one labelled bell per card", async (n) => {
    await renderWith(n);
    expect(bells()).toHaveLength(n);
    for (const bell of bells()) {
      expect(within(bell).getByText(LABEL)).toBeInTheDocument();
      expect(bell).toHaveAttribute("aria-expanded", "false");
      expect(bell.getAttribute("aria-label") ?? bell.textContent).toContain(LABEL);
    }
  });

  it.each([1, 3])("%i card(s), one panel open → labels unchanged, one panel", async (n) => {
    await renderWith(n);
    fireEvent.click(bells()[0]);
    expect(screen.getAllByTestId("alert-panel")).toHaveLength(1);
    expect(bells()[0]).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByText(LABEL)).toHaveLength(n);
  });
});
