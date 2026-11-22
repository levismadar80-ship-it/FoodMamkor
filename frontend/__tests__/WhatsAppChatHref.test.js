// MEH-3603: the wa.me link with no prefilled text has one owner, and the two
// shapes the dashboard used to hand-build come out of it byte-for-byte.
import { describe, it, expect } from "vitest";
import { getWhatsAppChatHref, getWhatsAppHref } from "../lib/utils.js";

describe("getWhatsAppChatHref", () => {
  it("a phone gives a chat with that number and no ?text=", () => {
    expect(getWhatsAppChatHref("972500000000")).toBe("https://wa.me/972500000000");
  });
  it("no phone just opens WhatsApp (the dashboard week nudge)", () => {
    expect(getWhatsAppChatHref()).toBe("https://wa.me/");
  });
});

describe("getWhatsAppHref with no phone — the share form", () => {
  it("matches the hand-built share link it replaces", () => {
    const text = "היי! https://mehamakor.online/x?a=1&b=2";
    expect(getWhatsAppHref("", text)).toBe(`https://wa.me/?text=${encodeURIComponent(text)}`);
  });
});
