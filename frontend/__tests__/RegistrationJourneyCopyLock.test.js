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
import { CONTACT_METHODS } from "@/lib/contact-method";
import { ADMIN_REVIEW_CHECKLIST } from "@/lib/admin-review-checklist";

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

  it("the post-registration hint anchors the window to the submit, not to registration", () => {
    expect(read(he, "auth.register.producer.submit_next_hint")).toContain("עד 3 ימי עסקים מהשליחה");
    expect(read(en, "auth.register.producer.submit_next_hint")).toMatch(/3 business days of sending/i);
  });
});

/*
 * MEH-2305 (24.10) — registration copy must describe what the code does.
 * Each case names the code that makes the old sentence false, so a future
 * change to that code is the moment to revisit the copy.
 */
describe("registration copy matches the submission gate and the contact model (MEH-2305)", () => {
  // backend/app/services/submission_gate.py:58-62 blocks «שליחה לבדיקה»
  // without a photo, so nothing can wait for "after approval".
  const BEFORE_REVIEW_KEYS = [
    "auth.register.producer.steps.business.subtitle",
    "auth.register.producer.photo_disclosure",
  ];

  it.each(BEFORE_REVIEW_KEYS)("he «%s» puts the dashboard step before review, not after approval", (path) => {
    const value = read(he, path);
    expect(value).not.toMatch(/אחרי האישור/);
    expect(value).toMatch(/לבדיקה/);
  });

  it.each(BEFORE_REVIEW_KEYS)("en «%s» puts the dashboard step before review, not after approval", (path) => {
    const value = read(en, path);
    expect(value).not.toMatch(/after approval/i);
    expect(value).toMatch(/for review/i);
  });

  it("the address hint does not offer a show-on-map choice that does not exist", () => {
    // producer_queries.py:398 publishes an entered address as an exact pin;
    // only LocationsEditor offers "approximate", later, in the dashboard.
    const hePath = "auth.register.producer.fields.address_map_privacy_hint";
    expect(read(he, hePath)).not.toMatch(/רק אם תבחרו/);
    expect(read(he, hePath)).toContain("מקורבת");
    expect(read(en, hePath)).not.toMatch(/only appears on the map if you choose/i);
    expect(read(en, hePath)).toMatch(/approximate/i);
  });

  it("the join pitch does not promise WhatsApp while owners can pick another channel", () => {
    // Derived from the code, not restated: if the site ever goes WhatsApp-only,
    // this guard stops applying instead of going stale.
    expect(CONTACT_METHODS.length).toBeGreaterThan(1);
    for (const path of ["join.subhead", "seo.join.description"]) {
      expect(read(he, path)).not.toMatch(/פנייה ישירה ב-?WhatsApp/);
      expect(read(he, path)).toContain("בערוץ שתבחרו");
      expect(read(en, path)).not.toMatch(/direct WhatsApp contact|direct contact on WhatsApp/i);
      expect(read(en, path)).toMatch(/channel you choose/i);
    }
  });
});

/*
 * MEH-2305 (24.10) — Sapir does not commit to a call with every business.
 * The admin checklist makes the call conditional; public copy must not
 * promise more than that. File-wide on purpose: a promise is a promise
 * wherever it appears.
 */
describe("no public copy promises a call with every business (MEH-2305)", () => {
  const walk = (node, out = []) => {
    if (typeof node === "string") out.push(node);
    else if (node && typeof node === "object") Object.values(node).forEach((v) => walk(v, out));
    return out;
  };

  it("the admin checklist still treats the call as conditional", () => {
    const call = ADMIN_REVIEW_CHECKLIST.find((item) => item.id === "call");
    expect(call, "call item moved — revisit this guard").toBeTruthy();
    expect(call.label).toMatch(/רק אם/);
  });

  it("he.json carries no unconditional call promise", () => {
    const hits = walk(he).filter((v) =>
      /שיחה אישית עם כל|זהות, סיפור ושיחה|עובר שיחה אישית|יוצר קשר לשיחה קצרה|דיברנו\. אדם מולנו/.test(v),
    );
    expect(hits).toEqual([]);
  });

  it("en.json carries no unconditional call promise", () => {
    const hits = walk(en).filter((v) =>
      /conversation with every business|gets a personal call|reaches out for a short call|identity, story, and a conversation\b/i.test(v),
    );
    expect(hits).toEqual([]);
  });
});
