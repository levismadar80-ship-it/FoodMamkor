/**
 * MEH-2126 — every status the DB can emit resolves to a real label and colour.
 *
 * The bug this guards: `draft` became the status every new registration starts
 * in (MEH-2100) and was never added to `producer-status.js`, so the admin chip
 * fell through `PRODUCER_STATUS_LABELS[status] ?? status` and rendered the raw
 * English string "draft" inside a Hebrew table — on the most common status.
 *
 * WHY THIS ASSERTS AGAINST A HARDCODED LIST rather than importing the map's own
 * keys: a test built from `Object.keys(PRODUCER_STATUS_LABELS)` agrees with the
 * map by construction and passes no matter which statuses are missing. The list
 * below is an INDEPENDENT statement of what the backend can emit, taken from
 * the enumeration in `backend/app/models/models.py` and the admin `?status=`
 * pattern in `routers/admin.py`. If the two drift, this goes red — which is the
 * entire point.
 *
 * Same reasoning as `_ALL_PRODUCER_STATUSES` in tests/test_pending_nudge.py,
 * which re-declares the list instead of importing `_NUDGEABLE_STATUSES`.
 */
import { describe, it, expect } from "vitest";
import he from "@/messages/he.json";
import en from "@/messages/en.json";
import {
  PRODUCER_STATUS_LABELS,
  PRODUCER_STATUS_COLORS,
  getProducerStatusLabel,
  getProducerStatusColor,
} from "@/lib/producer-status";

// Independently declared — see the docstring. `pending_whatsapp` is absent
// because MEH-2124 removed it from the machine entirely.
const DB_STATUSES = ["draft", "pending", "approved", "rejected", "inactive"];

const HEBREW = /[֐-׿]/;

describe("MEH-2126 — producer status label map covers the whole machine", () => {
  it.each(DB_STATUSES)("%s has a Hebrew label, not the raw code", (status) => {
    const label = getProducerStatusLabel(status);
    expect(label).not.toBe(status);
    expect(label).toMatch(HEBREW);
  });

  it.each(DB_STATUSES)("%s has its own colour, not the unknown fallback", (status) => {
    expect(PRODUCER_STATUS_COLORS[status]).toBeTruthy();
    expect(getProducerStatusColor(status)).not.toBe("bg-gray-100");
  });

  it("draft is visually distinct from inactive", () => {
    // Both are quiet greys; if they ever collapse to the same token the admin
    // cannot tell "never submitted" from "taken down", which are opposite
    // situations for her queue.
    expect(PRODUCER_STATUS_COLORS.draft).not.toBe(PRODUCER_STATUS_COLORS.inactive);
  });

  it("still falls back safely for a code it does not know", () => {
    // The fallback is not being removed — it is the net for a status added to
    // the backend before this map catches up. It must stay non-crashing.
    expect(getProducerStatusLabel("some_future_status")).toBe("some_future_status");
    expect(getProducerStatusColor("some_future_status")).toBe("bg-gray-100");
  });

  it("declares no label for a status the backend cannot emit", () => {
    // The inverse direction: a stale entry left behind after a Contract phase
    // is how `pending_whatsapp` would have survived MEH-2124 unnoticed.
    for (const key of Object.keys(PRODUCER_STATUS_LABELS)) {
      expect(DB_STATUSES).toContain(key);
    }
  });
});

describe("MEH-2126 — the admin status legend matches the machine", () => {
  // The legend (`status_tooltip_*`, rendered in AdminProducersTable's
  // TableHead) is the admin's reference for what each status VALUE means. It
  // drifted twice over: it documented `suspended`, which the backend emits
  // zero times, and omitted `draft`, the status every new registration starts
  // in. Both directions are asserted, because only checking for presence would
  // have left the phantom entry in place.
  const LEGEND = (m) =>
    Object.keys(m.admin.producers.table)
      .filter((k) => k.startsWith("status_tooltip_") && k !== "status_tooltip_label")
      .map((k) => k.replace("status_tooltip_", ""));

  it.each([["he", he], ["en", en]])("%s documents every status the backend emits", (_lang, m) => {
    expect(LEGEND(m).sort()).toEqual([...DB_STATUSES].sort());
  });

  it.each([["he", he], ["en", en]])("%s legend lines name their own status value", (_lang, m) => {
    // Format is "<value> = <meaning>", so the value must lead the string —
    // that is what makes the legend readable against a raw DB dump.
    for (const status of DB_STATUSES) {
      expect(m.admin.producers.table[`status_tooltip_${status}`]).toMatch(
        new RegExp(`^${status}\\s*=`),
      );
    }
  });

  it("he and en describe the same set of statuses", () => {
    expect(LEGEND(he).sort()).toEqual(LEGEND(en).sort());
  });
});
