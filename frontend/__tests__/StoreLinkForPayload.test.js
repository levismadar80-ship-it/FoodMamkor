// MEH-2938: the register POST's store link. Pure helper, real implementation.
import { describe, it, expect } from "vitest";
import { storeLinkForPayload } from "@/app/[locale]/register/producer/registerProducerShared";

describe("storeLinkForPayload (MEH-2938)", () => {
  it.each([
    ["", null],
    ["   ", null],
    [undefined, null],
    ["https://shop.example.com", "https://shop.example.com"],
    ["HTTP://shop.example.com", "HTTP://shop.example.com"],
    ["myshop.co.il", "https://myshop.co.il"],
    ["www.myshop.co.il/store?x=1", "https://www.myshop.co.il/store?x=1"],
    ["//myshop.co.il", "https://myshop.co.il"],
    // another scheme is not rewritten — the server refuses it, as before
    ["javascript:alert(1)", "javascript:alert(1)"],
    ["mailto:a@b.co", "mailto:a@b.co"],
  ])("%j → %j", (input, out) => {
    expect(storeLinkForPayload(input)).toBe(out);
  });
});
