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
    window.sessionStorage.clear();
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
      window.sessionStorage.setItem(STORAGE_KEY, "not-json");
      expect(getUserLocation()).toBe(null);
    });

    it("returns null when stored payload is missing lat/lng", () => {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ lat: 32 }));
      expect(getUserLocation()).toBe(null);
    });

    it("returns null when lat or lng is non-numeric", () => {
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ lat: "32", lng: 35 }),
      );
      expect(getUserLocation()).toBe(null);
    });

    it("returns the stored coordinates", () => {
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ lat: 32.0853, lng: 34.7818 }),
      );
      expect(getUserLocation()).toEqual({ lat: 32.0853, lng: 34.7818 });
    });
  });

  describe("setUserLocation", () => {
    it("writes to sessionStorage", () => {
      setUserLocation(31.78, 35.21);
      const stored = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY));
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
      expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe(null);
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
      window.sessionStorage.setItem(
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
  });
});
