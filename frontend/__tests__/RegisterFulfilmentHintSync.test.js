// @ts-check
// MEH-2447: the sign-up hint quotes the two labels the business card shows
// (map.producer_card.fulfillment.on_site / .arranged). If a card label is
// renamed, the hint would promise a label that no longer exists — this
// test turns that drift red, in both locales.
import { describe, expect, it } from "vitest";
import he from "../messages/he.json";
import en from "../messages/en.json";

describe.each([
  ["he", he],
  ["en", en],
])("register fulfilment hint (%s)", (_locale, messages) => {
  const hint = messages.auth.register.producer.fields.fulfilment.hours_hint;
  const card = messages.map.producer_card.fulfillment;

  it("quotes the card's on-site label", () => {
    expect(hint).toContain(card.on_site);
  });

  it("quotes the card's by-arrangement label", () => {
    expect(hint).toContain(card.arranged);
  });
});
