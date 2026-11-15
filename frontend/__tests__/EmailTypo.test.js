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
    // review finding 7: Gmail has one address space.
    ["noa@gmail.co.il", "noa@gmail.com"],
    ["noa@gmail.net", "noa@gmail.com"],
    ["noa@gmal.co.il", "noa@gmail.com"],
    ["noa@hotmail.con", "noa@hotmail.com"],
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
    // review finding 1: real providers and real names near a known domain.
    "noa@ymail.com",
    "noa@mail.com",
    "noa@email.com",
    "noa@zmail.com",
    "noa@fmail.com",
    "noa@pmail.com",
    "noa@kmail.com",
    "noa@tmail.com",
    "noa@bigmail.com",
    "noa@cloud.com",
    "noa@live.com",
    "noa@life.com",
    "noa@love.com",
    "noa@line.com",
    "noa@lime.com",
    "noa@wall.com",
    "noa@hotmail.co.il",
    "noa@walla.com",
    "noa@sub.gmail.com",
    // review finding 5: more than one @ stays invalid, no half-fix.
    "a@b@gmial.com",
    "noa@",
    "@gmail.com",
    "noa",
    "",
  ])("%s → no suggestion", (input) => {
    expect(suggestEmail(input)).toBeNull();
  });
});
