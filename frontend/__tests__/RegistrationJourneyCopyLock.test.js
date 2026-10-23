/**
 * MEH-2305 — the registration journey must not tell the owner she is done
 * before she is.
 *
 * Verifying the WhatsApp number only sets `phone_verified`
 * (backend/app/routers/producer_me.py, the phone-verify confirm endpoint).
 * The business reaches the review queue only when she presses «שליחה לבדיקה»
 * (MEH-2097 submission gate). The old copy said «העסק הועבר לסקירת הצוות» on
 * verify, so owners stopped one step short and nothing ever reached Sapir.
 *
 * The same journey also quoted two review windows («יום-יומיים» and «עד 3 ימי
 * עסקים»). The 3-business-day clock starts at the submit press, so every
 * surface that promises a window now quotes that one, anchored to the submit.
 *
 * Same family as RegisterDurationCopyLock (MEH-2185): each string was
 * individually plausible, and nothing in CI could see the contradiction.
 * This asserts KEYS, not a count over the file.
 */
import { describe, expect, it } from "vitest";

import he from "../messages/he.json";
import en from "../messages/en.json";

const read = (messages, path) =>
  path.split(".").reduce((node, key) => (node == null ? node : node[key]), messages);

const VERIFY_KEYS = [
  "dashboard.producer.phone_verify.description",
  "dashboard.producer.phone_verify.success",
];

const WINDOW_KEYS = [
  "join.how.step3_text",
  "auth.register.producer.preflight.after_body",
];

describe("phone verification does not claim the business was sent for review (MEH-2305)", () => {
  it.each(VERIFY_KEYS)("he «%s» resolves and makes no review claim", (path) => {
    const value = read(he, path);
    expect(typeof value, `he.json is missing ${path}`).toBe("string");
    expect(value).not.toMatch(/הועבר לסקירת|מעביר את העסק לסקירת/);
  });

  it.each(VERIFY_KEYS)("en «%s» resolves and makes no review claim", (path) => {
    const value = read(en, path);
    expect(typeof value, `en.json is missing ${path}`).toBe("string");
    expect(value).not.toMatch(/sent for (team )?review|sends your business for/i);
  });

  it("the success message points at the real next step, by its real button label", () => {
    // Derived from the button's own key, not restated — if the button is
    // renamed, this follows it instead of going stale.
    const button = read(he, "dashboard.producer.draft.submit_cta");
    expect(typeof button, "submit button key moved — update this test").toBe("string");
    expect(read(he, "dashboard.producer.phone_verify.success")).toContain(button);
  });
});

describe("one review window, anchored to the submit press (MEH-2305)", () => {
  it.each(WINDOW_KEYS)("he «%s» quotes עד 3 ימי עסקים and not יום-יומיים", (path) => {
    const value = read(he, path);
    expect(value).toContain("עד 3 ימי עסקים");
    expect(value).not.toMatch(/יום-יומיים/);
  });

  it.each(WINDOW_KEYS)("en «%s» quotes 3 business days and not a day or two", (path) => {
    const value = read(en, path);
    expect(value).toMatch(/3 business days/i);
    expect(value).not.toMatch(/a day or two/i);
  });

  it("step 1 of /join no longer promises photos inside the form", () => {
    // There is no photo upload in RegisterProducerClient; photos come from the
    // dashboard. The step must say so rather than list photos as form content.
    expect(read(he, "join.how.step1_text")).toContain("מלוח הבקרה");
    expect(read(en, "join.how.step1_text")).toMatch(/dashboard/i);
  });
});
