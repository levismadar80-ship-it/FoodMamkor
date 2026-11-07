import { describe, it, expect, vi, afterEach } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";

import he from "../messages/he.json";
import en from "../messages/en.json";
import {
  BUSINESS_FEATURES,
  BUSINESS_FEATURE_GROUPS,
  HIGHLIGHT_FEATURE_IDS,
  visibleBusinessFeatures,
  countVisibleBusinessFeatures,
} from "@/lib/business-features";

/**
 * MEH-2791 — the registry of business-facing tools cannot go stale silently.
 *
 * GitLab's `data/features.yml` was found stale in audits in 2020 and 2025
 * because nothing connected the list to the product. `codeRef` is the
 * connection: every entry names a file that must exist on disk, so an entry
 * describing a removed tool reds CI instead of going on selling it.
 *
 * DISCRIMINATION — each case fails against a plausible wrong registry:
 *   - point one codeRef at a missing file          → "every codeRef resolves"
 *   - add an id with no he/en label                → "every id has copy"
 *   - add a `tip: true` with no tip string         → "tips exist exactly where"
 *   - leave an orphan key under business_features  → "no orphan copy"
 *   - write the count into total_line as a digit   → "total_line is derived"
 *   - drop the rescue flag                         → "flag-gated entries"
 * The first is run as a live mutation in the PR body, per MEH-1619.
 *
 * REPO ROOT, not cwd: vitest runs from `frontend/`, and codeRefs are
 * repo-relative so they can name backend files too.
 */
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const IDS = BUSINESS_FEATURES.map((f) => f.id);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("shape", () => {
  it("ids are unique", () => {
    expect(new Set(IDS).size).toBe(IDS.length);
  });

  it("every entry sits in a declared group, and every group is used", () => {
    for (const feature of BUSINESS_FEATURES) {
      expect(BUSINESS_FEATURE_GROUPS, feature.id).toContain(feature.group);
    }
    const used = new Set(BUSINESS_FEATURES.map((f) => f.group));
    expect([...used].sort()).toEqual([...BUSINESS_FEATURE_GROUPS].sort());
  });

  it("entries are grouped contiguously, in tab order", () => {
    // The registry's array order IS the render order, so a stray entry
    // filed under the wrong group would render under the wrong tab.
    const seen = BUSINESS_FEATURES.map((f) => f.group);
    const firstIndex = BUSINESS_FEATURE_GROUPS.map((g) => seen.indexOf(g));
    expect(firstIndex).toEqual([...firstIndex].sort((a, b) => a - b));
    for (const group of BUSINESS_FEATURE_GROUPS) {
      const idx = seen.flatMap((g, i) => (g === group ? [i] : []));
      expect(idx[idx.length - 1] - idx[0], `${group} is not contiguous`).toBe(idx.length - 1);
    }
  });

  it("every status is one of the three declared values", () => {
    for (const feature of BUSINESS_FEATURES) {
      expect(["live", "soon", "unverified"], feature.id).toContain(feature.status);
    }
  });

  it("the four highlight cards are the ones the design names", () => {
    expect(HIGHLIGHT_FEATURE_IDS).toEqual([
      "group_buys",
      "events",
      "recipes",
      "rescue_bags",
    ]);
  });
});

describe("the drift guard — codeRef must resolve", () => {
  it("every codeRef resolves to a real path in the repo", () => {
    const missing = [];
    for (const feature of BUSINESS_FEATURES) {
      for (const ref of feature.codeRef ?? []) {
        if (!existsSync(path.join(REPO_ROOT, ref))) missing.push(`${feature.id} → ${ref}`);
      }
    }
    expect(missing, "a registry entry points at code that no longer exists").toEqual([]);
  });

  it("every live/soon entry carries at least one codeRef", () => {
    const bare = BUSINESS_FEATURES.filter(
      (f) => f.status !== "unverified" && (f.codeRef ?? []).length === 0,
    ).map((f) => f.id);
    expect(bare).toEqual([]);
  });

  it("control: the resolver really can fail", () => {
    // Without this, "0 missing" has two causes — nothing broken, or a
    // resolver that silently matches everything.
    expect(existsSync(path.join(REPO_ROOT, "frontend/lib/business-features.js"))).toBe(true);
    expect(existsSync(path.join(REPO_ROOT, "frontend/lib/__no_such_file__.js"))).toBe(false);
  });
});

describe("copy", () => {
  it.each([
    ["he", he],
    ["en", en],
  ])("%s has a label for every id and every group", (_lang, msgs) => {
    const ns = msgs.business_features;
    expect(ns, "the business_features namespace is missing").toBeTruthy();
    for (const id of IDS) {
      expect(ns.items[id]?.label, `items.${id}.label`).toBeTruthy();
    }
    for (const group of BUSINESS_FEATURE_GROUPS) {
      expect(ns.groups[group]?.label, `groups.${group}.label`).toBeTruthy();
      expect(ns.groups[group]?.lead, `groups.${group}.lead`).toBeTruthy();
    }
  });

  it.each([
    ["he", he],
    ["en", en],
  ])("%s has tips exactly where the registry declares one", (_lang, msgs) => {
    for (const feature of BUSINESS_FEATURES) {
      const hasTip = Boolean(msgs.business_features.items[feature.id]?.tip);
      expect(hasTip, `${feature.id}: tip present=${hasTip}, declared=${!!feature.tip}`).toBe(
        feature.tip === true,
      );
    }
  });

  it.each([
    ["he", he],
    ["en", en],
  ])("%s has no orphan copy under business_features.items", (_lang, msgs) => {
    const orphans = Object.keys(msgs.business_features.items).filter((k) => !IDS.includes(k));
    expect(orphans, "copy for an id the registry does not define").toEqual([]);
  });

  it.each([
    ["he", he],
    ["en", en],
  ])("%s total_line is derived, not a written number", (_lang, msgs) => {
    const line = msgs.business_features.total_line;
    expect(line).toContain("{count}");
    expect(line, "the count must come from countVisibleBusinessFeatures()").not.toMatch(/\d/);
    expect(msgs.business_features.note_line).toBeTruthy();
  });

  it("en copy holds no Hebrew", () => {
    const hebrew = /[֐-׿]/;
    const ns = en.business_features;
    const values = [
      ns.total_line,
      ns.note_line,
      ...Object.values(ns.groups).flatMap((g) => [g.label, g.lead]),
      ...Object.values(ns.items).flatMap((i) => [i.label, i.tip].filter(Boolean)),
    ];
    for (const value of values) expect(hebrew.test(value), value).toBe(false);
  });
});

describe("visibility", () => {
  it("never returns an unverified entry", () => {
    const unverified = BUSINESS_FEATURES.filter((f) => f.status === "unverified").map((f) => f.id);
    const visible = visibleBusinessFeatures().map((f) => f.id);
    for (const id of unverified) expect(visible).not.toContain(id);
  });

  it("drops rescue_bags when its flag is off, keeps it when on", () => {
    vi.stubEnv("NEXT_PUBLIC_RESCUE_BAGS_ENABLED", "false");
    expect(visibleBusinessFeatures().map((f) => f.id)).not.toContain("rescue_bags");

    vi.stubEnv("NEXT_PUBLIC_RESCUE_BAGS_ENABLED", "true");
    expect(visibleBusinessFeatures().map((f) => f.id)).toContain("rescue_bags");
  });

  it("the count follows the flag", () => {
    vi.stubEnv("NEXT_PUBLIC_RESCUE_BAGS_ENABLED", "true");
    const on = countVisibleBusinessFeatures();
    vi.stubEnv("NEXT_PUBLIC_RESCUE_BAGS_ENABLED", "false");
    const off = countVisibleBusinessFeatures();
    expect(on - off).toBe(1);
    expect(off).toBeGreaterThan(0); // control: the list is not empty either way
  });
});
