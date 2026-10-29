import { describe, it, expect, vi, beforeEach } from "vitest";

// MEH-2558 review: a GET /users/me/saved/ids still in flight when the session
// ends (logout, expiry) must not land in the next session's cache.
vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));

import api from "@/lib/api";
import { ensureSavedLoaded, isSaved, resetSavedCache } from "@/lib/saved-cache";

const A_ID = "11111111-1111-1111-1111-111111111111";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  resetSavedCache();
  api.get.mockReset();
});

describe("saved-cache across a session change", () => {
  it("logout mid-load: the previous user's ids never reach the next session", async () => {
    const first = deferred();
    api.get.mockReturnValueOnce(first.promise);
    const loadA = ensureSavedLoaded();
    resetSavedCache(); // user A logs out while the GET is in flight
    first.resolve({ data: [{ item_type: "recipe", item_id: A_ID }] });
    await loadA;
    expect(isSaved("recipe", A_ID)).toBe(false);

    api.get.mockResolvedValueOnce({ data: [] }); // user B's own load
    await ensureSavedLoaded();
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(isSaved("recipe", A_ID)).toBe(false);
  });

  it("expiry mid-load: a failed stale GET does not mark the fresh cache loaded", async () => {
    const first = deferred();
    api.get.mockReturnValueOnce(first.promise);
    const load = ensureSavedLoaded();
    resetSavedCache(); // auth:expired fires while the GET is in flight
    first.reject(new Error("401"));
    await load;

    api.get.mockResolvedValueOnce({ data: [{ item_type: "event", item_id: A_ID }] });
    await ensureSavedLoaded(); // after re-login
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(isSaved("event", A_ID)).toBe(true);
  });
});
