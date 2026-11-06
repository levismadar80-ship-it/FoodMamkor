import { describe, it, expect } from "vitest";
import he from "../messages/he.json";
import en from "../messages/en.json";

// MEH-2709: on a "no" verdict the box used to say «לא מגיעים ל{עיר}» twice and
// name the city three times (verdict + both follow-up links). The verdict line
// is now the ONE place that names the city and says "not delivering"; the two
// chips under it are short actions. Reads the real message files, so a copy
// edit that brings the repetition back goes red here, not on a phone.
describe.each([
  ["he", he, "לא מגיעים"],
  ["en", en, "deliver"],
])("delivery no-verdict copy (%s)", (_loc, msgs, notDelivering) => {
  const d = msgs.group_buys.delivery;
  const chips = {
    "coverage_cta.known_city": d.coverage_cta.known_city,
    "waitlist.cta": d.waitlist.cta,
  };

  it("the verdict names the city", () => {
    expect(d.checker.no).toContain("{city}");
  });

  it("the verdict is the line that says «not delivering»", () => {
    expect(d.checker.no.toLowerCase()).toContain(notDelivering);
  });

  it.each(Object.entries(chips))("chip %s does not repeat the city", (_k, v) => {
    expect(v).not.toContain("{city}");
  });

  it.each(Object.entries(chips))("chip %s does not repeat «not delivering»", (_k, v) => {
    expect(v.toLowerCase()).not.toContain(notDelivering);
  });
});
