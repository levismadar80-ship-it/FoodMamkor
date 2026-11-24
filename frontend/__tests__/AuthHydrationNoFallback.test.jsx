/**
 * MEH-3828 — the auth bootstrap must not throw a page that is still hydrating
 * back to its loading fallback.
 *
 * Shape of the bug: the page arrives as server HTML inside a Suspense boundary
 * (the route's loading.js) and part of it waits on a client chunk (a
 * next/dynamic map, the chat). AuthProvider's mount effect sets `loading` to
 * false. An urgent context update that reaches a boundary still waiting to
 * hydrate makes React discard its server HTML and show the fallback, then mount
 * the page again (react.dev/errors/421): a full-page loader flash about 5 s in
 * on a slow phone, ≈ 1.0 CLS. The fix sets auth state inside startTransition.
 *
 * The test hydrates real server HTML with a child whose chunk never arrives,
 * and watches the container: the fallback must never be inserted.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { Suspense, lazy } from "react";
import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { AuthProvider, useAuth } from "../lib/auth-context.js";

vi.mock("next-intl", () => ({
  useTranslations: () => (key) => key,
}));

const apiGet = vi.fn();
vi.mock("../lib/api.js", () => ({
  default: {
    get: (...a) => apiGet(...a),
    patch: vi.fn(),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
}));

vi.mock("../lib/favorites-cache.js", () => ({
  ensureFavoritesLoaded: vi.fn(),
  resetFavoritesCache: vi.fn(),
  setFavoritedLocal: vi.fn(),
}));

vi.mock("../lib/post-login-action.js", () => ({
  readPendingAction: vi.fn(() => null),
  clearPendingAction: vi.fn(),
}));

vi.mock("../lib/toast.js", () => {
  const showToast = vi.fn();
  showToast.success = vi.fn();
  showToast.error = vi.fn();
  showToast.info = vi.fn();
  return { showToast };
});

// Reads the context, as the Header and the business page do.
function AuthLine() {
  const { loading } = useAuth();
  return <span data-testid="auth-line">{loading ? "checking" : "ready"}</span>;
}

const ServerChunk = () => <span>map</span>;
// The client chunk that has not arrived yet (a pending dynamic import).
const PendingChunk = lazy(() => new Promise(() => {}));

const page = (Chunk) => (
  <AuthProvider>
    <Suspense fallback={<p data-testid="route-loader">LOADER</p>}>
      <h1>business page</h1>
      <AuthLine />
      <Chunk />
    </Suspense>
  </AuthProvider>
);

let root;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
  localStorage.clear();
  apiGet.mockReset();
});

/** @param {() => void} [arrange] */
async function hydrateAndWatch(arrange) {
  const container = document.createElement("div");
  container.innerHTML = renderToString(page(ServerChunk));
  document.body.appendChild(container);
  arrange?.();
  const inserted = [];
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      r.addedNodes.forEach((n) => inserted.push(n.textContent || ""));
    }
  });
  mo.observe(container, { childList: true, subtree: true, characterData: true });
  await act(async () => {
    root = hydrateRoot(container, page(PendingChunk), { onRecoverableError: () => {} });
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  mo.disconnect();
  return { container, inserted };
}

describe("auth bootstrap during hydration (MEH-3828)", () => {
  it("a signed-out visit keeps the server HTML; the route loader never appears", async () => {
    const { container, inserted } = await hydrateAndWatch();
    expect(inserted.some((t) => t.includes("LOADER"))).toBe(false);
    expect(container.textContent).toContain("business page");
  });

  it("a signed-in visit whose /auth/me answers mid-hydration keeps the server HTML", async () => {
    const { container, inserted } = await hydrateAndWatch(() => {
      localStorage.setItem("token", "jwt");
      apiGet.mockResolvedValueOnce({ data: { id: "u1", name: "דנה" } });
    });
    expect(apiGet).toHaveBeenCalledWith("/auth/me");
    expect(inserted.some((t) => t.includes("LOADER"))).toBe(false);
    expect(container.textContent).toContain("business page");
  });
});
