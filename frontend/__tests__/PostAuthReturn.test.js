/**
 * MEH-3661 — lib/post-auth-return keeps only pages a reader may be sent back
 * to (lib/safe-redirect.js isReturnablePath) and only for 24 h.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { rememberReturnPath, peekReturnPath, clearReturnPath, RETURN_TTL_MS } from "@/lib/post-auth-return";
import { isReturnablePath } from "@/lib/safe-redirect";

beforeEach(() => localStorage.clear());
afterEach(() => vi.useRealTimers());

describe("isReturnablePath", () => {
  it.each([
    ["/meshek-hadugma", true],
    ["/en/meshek-hadugma?x=1", true],
    ["/map?city=haifa", true],
    ["/", false],
    ["/en", false],
    ["/login", false],
    ["/en/register?redirect=/x", false],
    ["/verify-email?token=abc", false],
    ["/claim/eyJ.abc", false],
    ["//evil.example", false],
    ["https://evil.example/", false],
    ["/\\evil.example", false],
    [null, false],
  ])("%s → %s", (path, expected) => {
    expect(isReturnablePath(path)).toBe(expected);
  });
});

describe("remember / peek / clear", () => {
  it("round-trips a business page and peek does not consume it", () => {
    rememberReturnPath("/meshek-hadugma");
    expect(peekReturnPath()).toBe("/meshek-hadugma");
    expect(peekReturnPath()).toBe("/meshek-hadugma");
    clearReturnPath();
    expect(peekReturnPath()).toBeNull();
  });

  it("a non-returnable path clears an older stored page", () => {
    rememberReturnPath("/meshek-hadugma");
    rememberReturnPath("/");
    expect(peekReturnPath()).toBeNull();
  });

  it("expires after 24 h", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-21T10:00:00Z"));
    rememberReturnPath("/meshek-hadugma");
    vi.setSystemTime(new Date(Date.now() + RETURN_TTL_MS - 1000));
    expect(peekReturnPath()).toBe("/meshek-hadugma");
    vi.setSystemTime(new Date(Date.now() + 2000));
    expect(peekReturnPath()).toBeNull();
    expect(localStorage.getItem("post_auth_return")).toBeNull();
  });

  it("garbage in storage reads as nothing", () => {
    localStorage.setItem("post_auth_return", "{not json");
    expect(peekReturnPath()).toBeNull();
  });
});
