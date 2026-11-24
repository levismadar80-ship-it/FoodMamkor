// MEH-3814: the gates a probe passes before a finding is reported.
// Runs the real module (e2e/_verify-finding.mjs) against fake page and
// locator objects; no browser.
import { describe, it, expect } from "vitest";
import {
  verifyFinding,
  waitForStable,
  clickInView,
  VERIFIED_LABEL,
  UNVERIFIED_LABEL,
} from "../e2e/_verify-finding.mjs";

// The 24/11 case in numbers: scroll before the click 1,200, after back 1,200
// (no bug) or 0 (bug). isBug compares the two.
const isBug = (m) => Math.abs(m.after - m.before) > 100;
const clean = { before: 1200, after: 1200 };
const broken = { before: 1200, after: 0 };
const controls = {
  bug: async () => broken,
  clean: async () => clean,
};
const withShot = (m, i) => ({ ...m, screenshot: `/tmp/run-${i}.png` });

describe("verifyFinding", () => {
  it("confirmed only when every run shows the bug and leaves a screenshot", async () => {
    const r = await verifyFinding({ name: "back-scroll", controls, isBug, scenario: async (i) => withShot(broken, i) });
    expect(r.verdict).toBe("confirmed");
    expect(r.label).toBe(VERIFIED_LABEL);
    expect(r.runs).toHaveLength(3);
  });

  it("not-reproduced when no run shows the bug", async () => {
    const r = await verifyFinding({ name: "back-scroll", controls, isBug, scenario: async (i) => withShot(clean, i) });
    expect(r.verdict).toBe("not-reproduced");
    expect(r.label).toBe(UNVERIFIED_LABEL);
  });

  it("inconsistent when the runs disagree — the shape of a one-off reading", async () => {
    const r = await verifyFinding({
      name: "back-scroll",
      controls,
      isBug,
      scenario: async (i) => withShot(i === 0 ? broken : clean, i),
    });
    expect(r.verdict).toBe("inconsistent");
    expect(r.reason).toBe("1 of 3 runs showed the bug");
    expect(r.label).toBe(UNVERIFIED_LABEL);
  });

  it("no-evidence when every run shows the bug but one left no screenshot", async () => {
    const r = await verifyFinding({
      name: "back-scroll",
      controls,
      isBug,
      scenario: async (i) => (i === 2 ? broken : withShot(broken, i)),
    });
    expect(r.verdict).toBe("no-evidence");
    expect(r.label).toBe(UNVERIFIED_LABEL);
  });

  it("instrument-failed when the bug control is not seen, and the scenario never runs", async () => {
    let ran = 0;
    const r = await verifyFinding({
      name: "back-scroll",
      controls: { bug: async () => clean, clean: async () => clean },
      isBug,
      scenario: async (i) => {
        ran++;
        return withShot(broken, i);
      },
    });
    expect(r.verdict).toBe("instrument-failed");
    expect(r.reason).toBe("control.bug answered clean, expected bug");
    expect(ran).toBe(0);
  });

  it("instrument-failed when the clean control reads as a bug", async () => {
    const r = await verifyFinding({
      name: "back-scroll",
      controls: { bug: async () => broken, clean: async () => broken },
      isBug,
      scenario: async (i) => withShot(broken, i),
    });
    expect(r.verdict).toBe("instrument-failed");
    expect(r.reason).toBe("control.clean answered bug, expected clean");
  });

  it("instrument-failed when a run throws — the 24/11 off-screen click", async () => {
    const r = await verifyFinding({
      name: "back-scroll",
      controls,
      isBug,
      scenario: async (i) => {
        if (i === 1) throw new Error("clickInView: the element is not fully in the viewport");
        return withShot(broken, i);
      },
    });
    expect(r.verdict).toBe("instrument-failed");
    expect(r.reason).toMatch(/^run 1 threw: clickInView/);
  });

  it("refuses fewer than 3 runs and a missing control", async () => {
    await expect(verifyFinding({ name: "x", runs: 1, controls, isBug, scenario: async () => broken })).rejects.toThrow(/runs must be/);
    await expect(verifyFinding({ name: "x", controls: { bug: controls.bug }, isBug, scenario: async () => broken })).rejects.toThrow(
      /controls.bug and controls.clean/,
    );
  });
});

// A fake page whose value comes from a list, one entry per read.
function pageReading(values) {
  let reads = 0;
  let frames = 0;
  return {
    evaluate: async (fn) => {
      // The frame wait is the only call whose function takes no argument and
      // mentions requestAnimationFrame.
      if (String(fn).includes("requestAnimationFrame")) {
        frames++;
        return undefined;
      }
      return values[Math.min(reads++, values.length - 1)];
    },
    get reads() {
      return reads;
    },
    get frames() {
      return frames;
    },
  };
}

describe("waitForStable", () => {
  it("returns the value once it holds for `frames` reads in a row, not the first value", async () => {
    const page = pageReading([0, 300, 900, 1200, 1200, 1200]);
    const v = await waitForStable(page, () => window.scrollY, undefined, { frames: 3 });
    expect(v).toBe(1200);
    expect(page.reads).toBe(6);
    expect(page.frames).toBe(5);
  });

  it("throws when the value never settles", async () => {
    const page = pageReading(Array.from({ length: 50 }, (_, i) => i));
    await expect(waitForStable(page, () => window.scrollY, undefined, { frames: 3, maxFrames: 20 })).rejects.toThrow(
      /not stable after 20 frames \(last 18 → 19\)/,
    );
  });
});

function fakeClick({ box, viewport = { width: 390, height: 844 }, scrollY = 1200 }) {
  let clicked = 0;
  const page = { viewportSize: () => viewport, evaluate: async () => scrollY };
  const locator = {
    boundingBox: async () => box,
    click: async () => {
      clicked++;
    },
  };
  return { page, locator, clicks: () => clicked };
}

describe("clickInView", () => {
  it("clicks an element fully in view and returns the scroll at the click", async () => {
    const f = fakeClick({ box: { x: 16, y: 200, width: 358, height: 300 } });
    await expect(clickInView(f.page, f.locator)).resolves.toEqual({ scrollYAtClick: 1200 });
    expect(f.clicks()).toBe(1);
  });

  it("throws without clicking when the element is below the viewport (the 24/11 cause)", async () => {
    const f = fakeClick({ box: { x: 16, y: 700, width: 358, height: 300 } });
    await expect(clickInView(f.page, f.locator)).rejects.toThrow(/not fully in the viewport \(box y=700 h=300, viewport 390×844\)/);
    expect(f.clicks()).toBe(0);
  });

  it("throws without clicking when the element is above the viewport", async () => {
    const f = fakeClick({ box: { x: 16, y: -40, width: 358, height: 300 } });
    await expect(clickInView(f.page, f.locator)).rejects.toThrow(/not fully in the viewport/);
    expect(f.clicks()).toBe(0);
  });

  it("throws when the element has no box", async () => {
    const f = fakeClick({ box: null });
    await expect(clickInView(f.page, f.locator)).rejects.toThrow(/has no box/);
    expect(f.clicks()).toBe(0);
  });
});
