/**
 * MEH-3248 (B3) — after a deletion the person SEES the confirmation.
 *
 * Before: deleteAccount() cleared the user, /settings saw no user and pushed
 * /login, so the «grace» panel (which also promised a 30-day undo that does
 * not exist) never rendered. Now deleteAccount leaves for the public
 * /account-deleted page, and that page says what actually happened.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "@/messages/he.json";
import en from "@/messages/en.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const apiPost = vi.fn(() => Promise.resolve({ data: {} }));
vi.mock("../lib/api.js", () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: { id: 1, name: "דנה" } })),
    post: (...a) => apiPost(...a),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
}));
vi.mock("../lib/favorites-cache.js", () => ({
  ensureFavoritesLoaded: vi.fn(),
  resetFavoritesCache: vi.fn(),
  setFavoritedLocal: vi.fn(),
}));

const { AuthProvider, useAuth } = await import("../lib/auth-context.js");
const { default: AccountDeletedClient } = await import(
  "@/app/[locale]/account-deleted/AccountDeletedClient"
);

const realLocation = window.location;
let replace;

function setPath(pathname) {
  replace = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...realLocation, pathname, replace },
  });
}

function Probe() {
  const { deleteAccount, loading } = useAuth();
  if (loading) return <p>loading</p>;
  return (
    <button data-testid="del" onClick={() => deleteAccount({ password: "example-pw-123" })}>
      del
    </button>
  );
}

async function runDelete() {
  localStorage.setItem("token", "t");
  render(
    <NextIntlClientProvider locale="he" messages={he}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </NextIntlClientProvider>,
  );
  const btn = await screen.findByTestId("del");
  await act(async () => {
    btn.click();
  });
}

describe("deleteAccount leaves for the confirmation page", () => {
  beforeEach(() => apiPost.mockClear());
  afterEach(() => {
    cleanup();
    localStorage.clear();
    Object.defineProperty(window, "location", { configurable: true, value: realLocation });
  });

  it("posts the proof to the new route, drops the token, lands on /account-deleted", async () => {
    setPath("/settings");
    await runDelete();
    expect(apiPost).toHaveBeenCalledWith("/auth/me/delete", { password: "example-pw-123" });
    expect(localStorage.getItem("token")).toBeNull();
    expect(replace).toHaveBeenCalledWith("/account-deleted");
  });

  it("keeps the English prefix", async () => {
    setPath("/en/settings");
    await runDelete();
    expect(replace).toHaveBeenCalledWith("/en/account-deleted");
  });

  it("a refused delete stays on the page", async () => {
    setPath("/settings");
    apiPost.mockImplementationOnce(() => Promise.reject(new Error("403")));
    localStorage.setItem("token", "t");
    let caught = null;
    function Refused() {
      const { deleteAccount, loading } = useAuth();
      if (loading) return null;
      return <button data-testid="r" onClick={() => deleteAccount({}).catch((e) => { caught = e; })}>r</button>;
    }
    render(
      <NextIntlClientProvider locale="he" messages={he}>
        <AuthProvider>
          <Refused />
        </AuthProvider>
      </NextIntlClientProvider>,
    );
    const btn = await screen.findByTestId("r");
    await act(async () => { btn.click(); });
    expect(caught).not.toBeNull();
    expect(replace).not.toHaveBeenCalled();
    expect(localStorage.getItem("token")).toBe("t");
  });
});

describe("the confirmation page tells the truth", () => {
  afterEach(cleanup);

  it.each([
    ["he", he],
    ["en", en],
  ])("%s: approved heading and body, and no 30-day promise", (locale, messages) => {
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <AccountDeletedClient />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(messages.account_deleted.heading);
    expect(screen.getByText(messages.account_deleted.body)).toBeTruthy();
    const page = screen.getByTestId("account-deleted").textContent;
    expect(page).not.toMatch(/30/);
  });

  it("the false grace copy is gone from both catalogs", () => {
    for (const m of [he, en]) {
      const dz = m.settings.security.danger_zone;
      expect(dz.grace_body).toBeUndefined();
      expect(dz.grace_heading).toBeUndefined();
    }
  });
});
