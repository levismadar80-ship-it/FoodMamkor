import { describe, it, expect } from "vitest";
import {
  DRAFT_MAX_AGE_MS,
  DRAFT_VERSION,
  hasDraftContent,
  packDraft,
  parseDraft,
} from "../lib/register-draft";

/**
 * MEH-1977 — the producer-registration draft's on-disk rules.
 *
 * The clock is INJECTED rather than mocked. A test that has to install fake
 * timers to prove an expiry is partly testing the fake timers; passing `now` in
 * makes "8 days later" a value, not a piece of machinery.
 *
 * Two of these are the cases that carry the change — they are RED against the
 * shape this replaces (a bare form object with no envelope) and green after:
 *   · "expires a draft older than 7 days"  — there was no expiry at all
 *   · "a timestamp is not content"         — the whole reason for the envelope
 * The rest pin behaviour MEH-1769 already had, so it cannot regress on the way
 * past.
 */

const FORM = {
  email: "a@example.com",
  name: "",
  password: "hunter2",
  producer_name: "מהמקור",
  category_ids: [3],
};

const EMPTY_FORM = { email: "", name: "", password: "", producer_name: "", category_ids: [] };

const T0 = 1_760_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

describe("MEH-1977 · draft expiry", () => {
  it("returns a draft written 6 days ago", () => {
    const draft = parseDraft(packDraft(FORM, 2, T0), T0 + 6 * DAY);
    expect(draft).not.toBeNull();
    expect(draft.form.producer_name).toBe("מהמקור");
    expect(draft.step).toBe(2);
  });

  it("expires a draft older than 7 days — the gap this card exists for", () => {
    // RED before this change: nothing on disk recorded when the draft was
    // written, so no age could be computed and every draft lived forever.
    expect(parseDraft(packDraft(FORM, 2, T0), T0 + 8 * DAY)).toBeNull();
  });

  it("holds the boundary: 7 days minus a second survives, 7 days plus a second does not", () => {
    expect(parseDraft(packDraft(FORM, 2, T0), T0 + DRAFT_MAX_AGE_MS - 1000)).not.toBeNull();
    expect(parseDraft(packDraft(FORM, 2, T0), T0 + DRAFT_MAX_AGE_MS + 1000)).toBeNull();
  });

  it("rejects a savedAt in the future — a backwards clock is not a fresh draft", () => {
    // `now - savedAt` is negative here, so a naive `age > MAX` test would call
    // this draft fresh forever. Comparing on absolute distance is what makes
    // the assertion above about the boundary true in both directions.
    expect(parseDraft(packDraft(FORM, 2, T0 + 30 * DAY), T0)).toBeNull();
  });
});

describe("MEH-1977 · the envelope earns its complexity", () => {
  it("a timestamp is not content — an empty draft never claims to be resumable", () => {
    // THE discriminating case. The cheap repair for "there is nowhere to store
    // a timestamp" is to put `savedAt` alongside the form fields. Do that and
    // hasDraftContent — which treats any truthy value as content — reports
    // TRUE for a form the seller never touched, and the banner offers back a
    // "previous fill" that is nothing at all.
    const draft = parseDraft(packDraft(EMPTY_FORM, 1, T0), T0 + DAY);
    expect(draft).not.toBeNull();
    expect(hasDraftContent(draft.form)).toBe(false);

    // Proof the assertion above discriminates: the flat shape it rejects.
    expect(hasDraftContent({ ...EMPTY_FORM, savedAt: T0 })).toBe(true);
  });

  it("never writes the password, and never hands one back", () => {
    const raw = packDraft(FORM, 2, T0);
    expect(raw).not.toContain("hunter2");
    expect(parseDraft(raw, T0).form.password).toBeUndefined();
  });

  it("keeps metadata out of the object that gets spread into form state", () => {
    // restoreDraft does `setForm({...prev, ...draft.form})`, so anything in
    // here rides into component state and out in the submit body.
    expect(Object.keys(parseDraft(packDraft(FORM, 2, T0), T0).form).sort()).toEqual(
      ["category_ids", "email", "name", "producer_name"],
    );
  });
});

describe("MEH-1977 · legacy drafts are grandfathered, not deleted", () => {
  it("accepts a pre-envelope bare form object and asks to be re-stamped", () => {
    const legacy = JSON.stringify({ producer_name: "מהמקור", category_ids: [] });
    const draft = parseDraft(legacy, T0);
    expect(draft.restamp).toBe(true);
    expect(draft.step).toBeNull();
    expect(draft.form.producer_name).toBe("מהמקור");
  });

  it("a re-stamped legacy draft then ages normally", () => {
    const restamped = packDraft(parseDraft(JSON.stringify({ producer_name: "x" }), T0).form, null, T0);
    expect(parseDraft(restamped, T0 + DAY)).not.toBeNull();
    expect(parseDraft(restamped, T0 + 8 * DAY)).toBeNull();
  });
});

describe("MEH-1977 · everything unreadable returns null so the caller deletes it", () => {
  it.each([
    ["absent", null],
    ["empty string", ""],
    ["not JSON", "{oops"],
    ["a JSON array", "[1,2,3]"],
    ["a JSON scalar", '"draft"'],
    ["an unknown version", JSON.stringify({ v: 99, savedAt: T0, form: {} })],
    ["a missing savedAt", JSON.stringify({ v: DRAFT_VERSION, form: {} })],
    ["a non-numeric savedAt", JSON.stringify({ v: DRAFT_VERSION, savedAt: "now", form: {} })],
    ["a NaN savedAt", JSON.stringify({ v: DRAFT_VERSION, savedAt: null, form: {} })],
    [
      "a stale schema (category_ids not an array)",
      JSON.stringify({ v: DRAFT_VERSION, savedAt: T0, form: { category_ids: "3" } }),
    ],
    ["a missing form", JSON.stringify({ v: DRAFT_VERSION, savedAt: T0 })],
  ])("rejects %s", (_label, raw) => {
    expect(parseDraft(raw, T0)).toBeNull();
  });

  it("drops a non-numeric step rather than the whole draft", () => {
    // A bad step costs a resume position; it must not cost the seller's data.
    const raw = JSON.stringify({
      v: DRAFT_VERSION,
      savedAt: T0,
      step: "story",
      form: { producer_name: "מהמקור" },
    });
    const draft = parseDraft(raw, T0);
    expect(draft.step).toBeNull();
    expect(draft.form.producer_name).toBe("מהמקור");
  });
});
