/**
 * MEH-2666 — the experiences list named the host's private name while the
 * experience page names her business (MEH-2476). Both now read the business
 * first and fall back to her name only when there is no public business.
 */
import { describe, it, expect } from "vitest";
import { toEventEntry } from "@/lib/event-entry";

const t = (k) => k;
const row = (host) => ({ id: "x", title: "x", event_date: "2026-11-13", host });

describe("MEH-2666 — experience list row names the host business", () => {
  it("host with a public business → the business name", () => {
    const host = { id: "u", name: "נועה לביא", producer_id: "p", producer_name: "מאפיית רוח השדה" };
    expect(toEventEntry(row(host), "experiences", t).who).toBe("מאפיית רוח השדה");
  });

  it("host without a business → her own name", () => {
    expect(toEventEntry(row({ id: "u", name: "נועה לביא" }), "experiences", t).who).toBe("נועה לביא");
  });

  it("no host → nothing", () => {
    expect(toEventEntry(row(null), "experiences", t).who).toBeUndefined();
  });
});
