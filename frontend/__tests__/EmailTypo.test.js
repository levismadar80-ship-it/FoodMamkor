import { describe, it, expect } from "vitest";
import { suggestEmail } from "@/lib/email-typo";

// MEH-3123 — the cases on the card, named after the input they cover.
describe("suggestEmail", () => {
  it.each([
    ["noa@gmial.com", "noa@gmail.com"],
    ["noa@gmai.com", "noa@gmail.com"],
    ["noa@gmail.con", "noa@gmail.com"],
    ["noa@gmail.co", "noa@gmail.com"],
    ["noa@walla.co.ill", "noa@walla.co.il"],
    ["noa@wala.co.il", "noa@walla.co.il"],
    ["noa@hotmial.com", "noa@hotmail.com"],
    ["noa@yahooo.com", "noa@yahoo.com"],
    ["Noa.Cohen@GMIAL.COM", "Noa.Cohen@gmail.com"],
    ["noa@business.con", "noa@business.com"],
  ])("%s → %s", (input, expected) => {
    expect(suggestEmail(input)).toBe(expected);
  });

  it.each([
    "noa@gmail.com",
    "noa@walla.co.il",
    "noa@mehamakor.co.il",
    "noa@013.net.il",
    "noa@012.net.il",
    "noa@me.com",
    "noa@mo.com",
    "noa@",
    "@gmail.com",
    "noa",
    "",
  ])("%s → no suggestion", (input) => {
    expect(suggestEmail(input)).toBeNull();
  });
});
