import { describe, it, expect } from "vitest";
import he from "../messages/he.json";

// MEH-2507: /about has two business links side by side in reading order —
// «בעלת עסק? …» → /about/for-businesses (joining FAQ) and the
// process cross-link → /about/process (how a business is checked). The first
// used to read «כך זה עובד אצלנו», which says the same thing as the second, so
// Sapir read them as a duplicate. The FAQ link must name joining, and must not
// borrow the process link's vocabulary.
describe("/about business link copy (MEH-2507)", () => {
  const faq = he.about.biz_strip;
  const process = he.process.crosslink_from_about;

  it("the FAQ link names joining", () => {
    expect(faq).toMatch(/הצטרפות/);
  });

  it("the FAQ link does not read like the checking-process link", () => {
    expect(process).toBeTruthy();
    expect(faq).not.toMatch(/עובד|תהליך|בודק|מאמת|אימות/);
  });
});
