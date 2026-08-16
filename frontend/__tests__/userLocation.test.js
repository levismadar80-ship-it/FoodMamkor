import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  STORAGE_KEY,
  EVENT_NAME,
  getUserLocation,
  setUserLocation,
  clearUserLocation,
  useUserLocation,
} from "@/lib/user-location";

describe("user-location", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe("constants", () => {
    it("exports the documented storage key + event name", () => {
      expect(STORAGE_KEY).toBe("user_location");
      expect(EVENT_NAME).toBe("mehamakor:user-location");
    });
  });

  describe("getUserLocation", () => {
    it("returns null when nothing is stored", () => {
      expect(getUserLocation()).toBe(null);
    });

    it("returns null on JSON parse error", () => {
      window.localStorage.setItem(STORAGE_KEY, "not-json");
      expect(getUserLocation()).toBe(null);
    });

    it("returns null when stored payload is missing lat/lng", () => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ lat: 32 }));
      expect(getUserLocation()).toBe(null);
    });

    it("returns null when lat or lng is non-numeric", () => {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ lat: "32", lng: 35 }),
      );
      expect(getUserLocation()).toBe(null);
    });

    it("returns the stored coordinates", () => {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ lat: 32.0853, lng: 34.7818 }),
      );
      expect(getUserLocation()).toEqual({ lat: 32.0853, lng: 34.7818 });
    });
  });

  describe("setUserLocation", () => {
    it("writes to localStorage", () => {
      setUserLocation(31.78, 35.21);
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      expect(stored).toEqual({ lat: 31.78, lng: 35.21 });
    });

    it("dispatches the cross-component event", () => {
      const listener = vi.fn();
      window.addEventListener(EVENT_NAME, listener);
      setUserLocation(31.78, 35.21);
      expect(listener).toHaveBeenCalledTimes(1);
      window.removeEventListener(EVENT_NAME, listener);
    });
  });

  describe("clearUserLocation", () => {
    it("removes the stored coordinates", () => {
      setUserLocation(31.78, 35.21);
      clearUserLocation();
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe(null);
    });

    it("dispatches the event so subscribed hooks re-render to null", () => {
      const listener = vi.fn();
      window.addEventListener(EVENT_NAME, listener);
      clearUserLocation();
      expect(listener).toHaveBeenCalledTimes(1);
      window.removeEventListener(EVENT_NAME, listener);
    });
  });

  describe("useUserLocation", () => {
    it("returns null when no location is cached", () => {
      const { result } = renderHook(() => useUserLocation());
      expect(result.current).toBe(null);
    });

    it("returns the cached location on mount", () => {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ lat: 32.0853, lng: 34.7818 }),
      );
      const { result } = renderHook(() => useUserLocation());
      expect(result.current).toEqual({ lat: 32.0853, lng: 34.7818 });
    });

    it("re-renders when setUserLocation fires the event mid-session", () => {
      const { result } = renderHook(() => useUserLocation());
      expect(result.current).toBe(null);
      act(() => setUserLocation(31.78, 35.21));
      expect(result.current).toEqual({ lat: 31.78, lng: 35.21 });
    });

    it("re-renders to null when clearUserLocation fires", () => {
      setUserLocation(31.78, 35.21);
      const { result } = renderHook(() => useUserLocation());
      expect(result.current).toEqual({ lat: 31.78, lng: 35.21 });
      act(() => clearUserLocation());
      expect(result.current).toBe(null);
    });

    // MEH-2014: `storage` fires only in OTHER tabs, so without this listener a
    // clear in one tab left every other tab still showing distance labels
    // computed from a location that no longer exists. Precedent for the
    // pairing: lib/use-user-city.js:56.
    it("re-renders when another tab writes the key", () => {
      const { result } = renderHook(() => useUserLocation());
      expect(result.current).toBe(null);

      act(() => {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ lat: 31.78, lng: 35.21 }),
        );
        // jsdom does not emit `storage` for same-window writes (neither does a
        // real browser) — dispatching it is how a cross-tab write is simulated.
        window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
      });

      expect(result.current).toEqual({ lat: 31.78, lng: 35.21 });
    });

    it("re-renders when another tab clears the whole store (key === null)", () => {
      setUserLocation(31.78, 35.21);
      const { result } = renderHook(() => useUserLocation());
      expect(result.current).toEqual({ lat: 31.78, lng: 35.21 });

      act(() => {
        window.localStorage.clear();
        window.dispatchEvent(new StorageEvent("storage", { key: null }));
      });

      expect(result.current).toBe(null);
    });

    it("ignores a storage event for an unrelated key", () => {
      setUserLocation(31.78, 35.21);
      const { result } = renderHook(() => useUserLocation());

      act(() => {
        window.dispatchEvent(new StorageEvent("storage", { key: "user_city" }));
      });

      // Still the same fix — the listener must not treat every key as its own.
      expect(result.current).toEqual({ lat: 31.78, lng: 35.21 });
    });
  });

  // MEH-2014: the store change IS the ticket, so it gets a direct assertion
  // rather than being implied by the ones above. `grep sessionStorage
  // frontend/lib/user-location.js` must return 0 — this is that check, run.
  describe("persistence store (MEH-2014)", () => {
    it("writes to localStorage and never to sessionStorage", () => {
      window.sessionStorage.clear();
      setUserLocation(31.78, 35.21);
      expect(window.localStorage.getItem(STORAGE_KEY)).not.toBe(null);
      expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe(null);
    });

    it("survives a simulated tab close — a fresh hook still reads the fix", () => {
      setUserLocation(31.78, 35.21);
      // A tab close destroys sessionStorage and unmounts every hook. Clearing
      // sessionStorage and mounting a brand-new hook reproduces both halves;
      // under the old implementation the fix would be gone here.
      window.sessionStorage.clear();
      const { result } = renderHook(() => useUserLocation());
      expect(result.current).toEqual({ lat: 31.78, lng: 35.21 });
    });
  });
});
