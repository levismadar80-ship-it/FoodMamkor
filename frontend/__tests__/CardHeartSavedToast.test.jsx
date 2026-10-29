import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * MEH-2526 — saving a business with the heart on a CARD (home / map list /
 * producers list: ProducerCard's CardHeart) tells the user where updates live.
 * Before this ticket a signed-in card save showed no toast at all.
 *
 * Translations resolve against the REAL he.json, so the assertion is on the
 * shipped string.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HE = JSON.parse(readFileSync(path.join(HERE, "..", "messages", "he.json"), "utf8"));
const EN = JSON.parse(readFileSync(path.join(HERE, "..", "messages", "en.json"), "utf8"));
const lookup = (obj, dotted) => dotted.split(".").reduce((o, k) => o?.[k], obj);

vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key) => {
    const full = ns ? `${ns}.${key}` : key;
    const v = lookup(HE, full);
    return typeof v === "string" ? v : full;
  },
  useLocale: () => "he",
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next/image", () => ({ default: ({ src, alt }) => <img src={src} alt={alt} /> }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));

const { authState, apiMock, toastSpy, favCache } = vi.hoisted(() => ({
  authState: { user: null },
  apiMock: { post: vi.fn(), delete: vi.fn() },
  toastSpy: vi.fn(),
  favCache: { ids: new Set() },
}));

vi.mock("@/lib/auth-context", () => ({ useAuth: () => authState }));
vi.mock("@/lib/api", () => ({ default: apiMock }));
vi.mock("@/lib/toast", () => ({
  showToast: {
    success: (...args) => toastSpy("success", ...args),
    error: (...args) => toastSpy("error", ...args),
    info: (...args) => toastSpy("info", ...args),
  },
}));
vi.mock("@/lib/post-login-action", () => ({ enqueueFavoriteOnLogin: vi.fn() }));
vi.mock("@/lib/favorites-cache", () => ({
  ensureFavoritesLoaded: () => Promise.resolve(favCache.ids),
  isFavorited: (id) => favCache.ids.has(id),
  setFavoritedLocal: (id, value) => {
    if (value) favCache.ids.add(id);
    else favCache.ids.delete(id);
  },
  subscribeFavorites: () => () => {},
}));

import ProducerCard from "@/components/ProducerCard";

const SAVED_TOAST = "נשמר במועדפים. רוצה לקבל עדכונים מהעסק הזה? אפשר להפעיל במועדפים.";

const producer = {
  id: "producer-1",
  name: "חוות השקמה",
  city: "רחובות",
  images: [],
  availability_state: "accepting_orders",
  reviews_count: 0,
  categories: [],
};

beforeEach(() => {
  authState.user = null;
  apiMock.post.mockReset().mockResolvedValue({ data: {} });
  apiMock.delete.mockReset().mockResolvedValue({ data: {} });
  toastSpy.mockClear();
  favCache.ids = new Set();
});

const savedToastCalls = () =>
  toastSpy.mock.calls.filter(([type, msg]) => type === "success" && msg === SAVED_TOAST);

describe("MEH-2526 · card heart saved toast", () => {
  it("the message is exactly the approved copy, with an English twin", () => {
    expect(HE.producer.card.favorites.saved_toast).toBe(SAVED_TOAST);
    expect(typeof EN.producer.card.favorites.saved_toast).toBe("string");
    expect(EN.producer.card.favorites.saved_toast).not.toMatch(/[֐-׿]/);
  });

  it("signed-in save shows the approved toast exactly once, after the server accepts", async () => {
    authState.user = { id: "u1", producer_id: null };
    render(<ProducerCard producer={producer} />);
    fireEvent.click(screen.getByTestId("card-heart"));
    await waitFor(() => expect(savedToastCalls()).toHaveLength(1));
    expect(apiMock.post).toHaveBeenCalledWith("/users/me/favorites/producer-1");
  });

  it("un-saving shows no saved toast", async () => {
    authState.user = { id: "u1", producer_id: null };
    favCache.ids.add("producer-1");
    render(<ProducerCard producer={producer} />);
    const heart = screen.getByTestId("card-heart");
    await waitFor(() => expect(heart).toHaveAttribute("aria-pressed", "true"));
    fireEvent.click(heart);
    await waitFor(() => expect(apiMock.delete).toHaveBeenCalled());
    expect(savedToastCalls()).toHaveLength(0);
  });

  it("a failed save shows the error, never the saved toast", async () => {
    authState.user = { id: "u1", producer_id: null };
    apiMock.post.mockRejectedValueOnce(new Error("fail"));
    render(<ProducerCard producer={producer} />);
    fireEvent.click(screen.getByTestId("card-heart"));
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith("error", expect.any(String)));
    expect(savedToastCalls()).toHaveLength(0);
  });

  it("a guest tap keeps its login snackbar and does not claim a save", () => {
    render(<ProducerCard producer={producer} />);
    fireEvent.click(screen.getByTestId("card-heart"));
    expect(toastSpy.mock.calls[0][0]).toBe("info");
    expect(savedToastCalls()).toHaveLength(0);
  });
});
