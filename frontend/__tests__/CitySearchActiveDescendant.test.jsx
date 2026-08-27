/**
 * MEH-2195 — CitySearch completes the WAI-ARIA combobox contract.
 *
 * The component already carried role=combobox / aria-expanded /
 * aria-autocomplete / aria-controls on the input, role=listbox on the list and
 * role=option / aria-selected on each item. The two pieces that make keyboard
 * navigation *announceable* were missing: `aria-activedescendant` on the input
 * and a stable `id` on each option. Without both, the mechanism cannot work at
 * all — aria-activedescendant is a pointer, and there was nothing to point at.
 *
 * DISCRIMINATION (testing.md, MEH-1619). Every assertion here is falsifiable by
 * the change under test: against the pre-change component the tracking cases red
 * on `aria-activedescendant` being null, and the id cases red on the <li> having
 * no id. The failing run is in the PR body.
 *
 * The ABSENCE cases are labelled controls and pass on BOTH versions — they exist
 * so a future implementation that always emits the attribute (pointing at a
 * nonexistent option while the list is shut) cannot go green. A presence-only
 * suite would accept exactly that.
 *
 * The markup-identity case is the zero-visual-change requirement as an
 * assertion rather than a claim: it pins the exact class strings and the exact
 * attribute set on each option, so any change to what renders — not just to
 * what is announced — reds this file.
 *
 * REUSES the harness shape from __tests__/CitySearchErrorAssociation.test.jsx
 * (same intl provider, same api.get mock — the real component fetches /cities
 * on mount and an unmocked vi.fn() crashes it).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import CitySearch from "@/components/CitySearch";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [] });
});

// CitySearch is controlled, so arrow-key behaviour can only be exercised
// through a parent that actually holds the value.
function Harness({ initial = "" }) {
  const [city, setCity] = useState(initial);
  return (
    <CitySearch id="cs" label="עיר" value={city} onChange={setCity} useBackend={false} />
  );
}

function open(initial = "כפר") {
  const utils = render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <Harness initial={initial} />
    </NextIntlClientProvider>,
  );
  const input = document.getElementById("cs");
  fireEvent.focus(input);
  return { ...utils, input };
}

const options = () => [...document.querySelectorAll('[role="option"]')];

describe("MEH-2195 — aria-activedescendant tracks the highlighted option", () => {
  it("points at the first option when the list opens, and every option has the id it points to", () => {
    const { input } = open();
    const opts = options();
    // 'כפר' matches exactly 3 cities in data/cities.js — deterministic and
    // under the 8-item cap, so the indices below are stable.
    expect(opts).toHaveLength(3);

    opts.forEach((li, idx) => {
      expect(li.getAttribute("id")).toBe(`cs-option-${idx}`);
    });

    // The pointer resolves to a real element — the property that actually
    // matters, and the one a missing id would break while the attribute
    // itself still looked correct.
    const active = input.getAttribute("aria-activedescendant");
    expect(active).toBe("cs-option-0");
    expect(document.getElementById(active)).toBe(opts[0]);
  });

  it("ArrowDown and ArrowUp move it, and it stays in step with aria-selected", () => {
    const { input } = open();
    const opts = options();

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe("cs-option-1");
    expect(opts[1].getAttribute("aria-selected")).toBe("true");
    expect(opts[0].getAttribute("aria-selected")).toBe("false");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe("cs-option-2");
    expect(document.getElementById("cs-option-2").getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.getAttribute("aria-activedescendant")).toBe("cs-option-1");
    expect(document.getElementById("cs-option-1").getAttribute("aria-selected")).toBe("true");
  });

  it("never points past the end — ArrowDown at the last option is a no-op, not a dangling id", () => {
    const { input } = open();
    for (let i = 0; i < 6; i += 1) fireEvent.keyDown(input, { key: "ArrowDown" });
    const active = input.getAttribute("aria-activedescendant");
    expect(active).toBe("cs-option-2");
    expect(document.getElementById(active)).not.toBeNull();
  });
});

describe("MEH-2195 — absent when nothing is highlighted (controls)", () => {
  it("closed list: the attribute is absent, not empty and not stale (control)", () => {
    // Below the 2-character threshold there are no matches, so the list never
    // opens. A build that emitted the attribute unconditionally would point at
    // an option that does not exist — this is the case that catches it.
    const { input } = open("כ");
    expect(options()).toHaveLength(0);
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("Escape closes the list and clears the pointer together (control)", () => {
    const { input } = open();
    expect(input.getAttribute("aria-activedescendant")).toBe("cs-option-0");

    fireEvent.keyDown(input, { key: "Escape" });

    expect(options()).toHaveLength(0);
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);
    // The two must move together: a cleared pointer beside aria-expanded=true
    // would describe a list the user cannot see.
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("MEH-2195 — zero visual change (assertion, not a claim)", () => {
  it("option class strings and text are unchanged, and the only added attribute is id", () => {
    const { input } = open();
    const opts = options();

    // Byte-exact class strings, copied from the component. A styling change
    // reds this — which is the point: the ticket promises zero visual change.
    const HIGHLIGHTED = "px-3 py-2 cursor-pointer text-sm bg-green-50 text-primary";
    const PLAIN = "px-3 py-2 cursor-pointer text-sm text-text";
    const squash = (s) => s.replace(/\s+/g, " ").trim();

    expect(squash(opts[0].getAttribute("class"))).toBe(HIGHLIGHTED);
    expect(squash(opts[1].getAttribute("class"))).toBe(PLAIN);
    expect(squash(opts[2].getAttribute("class"))).toBe(PLAIN);

    // Text is the city name and nothing else — no marker, no badge, no
    // screen-reader-only string leaked into the visible label.
    opts.forEach((li) => {
      expect(li.textContent).toMatch(/^כפר /);
      expect(li.children).toHaveLength(0);
    });

    // The exact attribute set — asserted as a SET, so an extra attribute is a
    // failure rather than something a presence check would sail past.
    expect([...opts[0].attributes].map((a) => a.name).sort()).toEqual([
      "aria-selected",
      "class",
      "id",
      "role",
    ]);

    // Same for the input: aria-activedescendant is the only addition.
    expect([...input.attributes].map((a) => a.name).sort()).toEqual([
      "aria-activedescendant",
      "aria-autocomplete",
      "aria-controls",
      "aria-expanded",
      "autocomplete",
      "class",
      "dir",
      "id",
      "placeholder",
      "role",
      "type",
      "value",
    ]);
  });
});
