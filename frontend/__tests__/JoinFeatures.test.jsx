import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import he from "../messages/he.json";
import JoinFeatures from "@/components/join/JoinFeatures";
import { BUSINESS_FEATURE_GROUPS, countVisibleBusinessFeatures, visibleBusinessFeatures } from "@/lib/business-features";

/**
 * MEH-2799 — the /join features section. Real he.json, so a copy edit moves
 * the expectations with it; the registry is the source of every count.
 *
 * Browser APIs jsdom lacks are driven by hand: an IntersectionObserver whose
 * entries the test fires, a matchMedia that answers per query, and play/pause
 * spies on HTMLMediaElement (jsdom does not implement playback).
 */

const BF = he.business_features;
const JF = he.join.features;

let observers = [];
class FakeIO {
  constructor(callback) {
    this.callback = callback;
    this.targets = [];
    observers.push(this);
  }
  observe(el) {
    this.targets.push(el);
  }
  disconnect() {
    this.targets = [];
  }
}
function setRatio(el, ratio) {
  act(() => {
    for (const io of observers) {
      if (io.targets.includes(el)) io.callback([{ target: el, intersectionRatio: ratio, isIntersecting: ratio > 0 }]);
    }
  });
}

let mediaAnswers = {};
function mockMatchMedia(answers) {
  mediaAnswers = answers;
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: Boolean(mediaAnswers[query]),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}
const DESKTOP = "(min-width: 700px)";
const REDUCED = "(prefers-reduced-motion: reduce)";

let playSpy;
let pauseSpy;
beforeEach(() => {
  observers = [];
  vi.stubGlobal("IntersectionObserver", FakeIO);
  mockMatchMedia({});
  vi.stubEnv("NEXT_PUBLIC_RESCUE_BAGS_ENABLED", "true");
  playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
  pauseSpy = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function renderFeatures() {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <JoinFeatures />
    </NextIntlClientProvider>,
  );
}
const cards = () => screen.getAllByTestId("join-group-card");
const cardButton = (group) =>
  within(cards().find((c) => c.dataset.group === group)).getAllByRole("button")[0];
const panel = () => screen.getByTestId("join-panel");

describe("count line", () => {
  it("shows the derived count once, under the heading — never per panel", () => {
    renderFeatures();
    const count = countVisibleBusinessFeatures();
    const line = BF.total_line.replace("{count}", String(count));
    expect(screen.getByTestId("join-features-count").textContent).toBe(line);
    expect(screen.getAllByText(line)).toHaveLength(1);
    expect(within(panel()).queryByText(line)).toBeNull();
  });

  it("follows the rescue flag (one fewer tool when it is off)", () => {
    vi.stubEnv("NEXT_PUBLIC_RESCUE_BAGS_ENABLED", "false");
    renderFeatures();
    const off = countVisibleBusinessFeatures();
    expect(screen.getByTestId("join-features-count").textContent).toBe(
      BF.total_line.replace("{count}", String(off)),
    );
  });
});

describe("cards", () => {
  it("six cards in registry order, the first selected", () => {
    renderFeatures();
    expect(cards().map((c) => c.dataset.group)).toEqual(BUSINESS_FEATURE_GROUPS);
    expect(cardButton("page").getAttribute("aria-pressed")).toBe("true");
    for (const g of BUSINESS_FEATURE_GROUPS.slice(1)) {
      expect(cardButton(g).getAttribute("aria-pressed")).toBe("false");
    }
    expect(screen.getByRole("group", { name: JF.shelf_aria })).toBeTruthy();
  });

  it("the selected card says the tools are below; the others count their tools", () => {
    renderFeatures();
    const visible = visibleBusinessFeatures();
    expect(within(cards()[0]).getByText(JF.panel_hint)).toBeTruthy();
    const contact = cards().find((c) => c.dataset.group === "contact");
    const n = visible.filter((f) => f.group === "contact").length;
    expect(within(contact).getByText(JF.more.replace("{n}", String(n)))).toBeTruthy();
  });

  it("the «שיחזרו לקנות» line drops the surprise bags when the flag is off", () => {
    vi.stubEnv("NEXT_PUBLIC_RESCUE_BAGS_ENABLED", "false");
    renderFeatures();
    const ret = cards().find((c) => c.dataset.group === "return");
    expect(within(ret).getByText(BF.groups.return.card_line_no_rescue)).toBeTruthy();
    expect(within(ret).queryByText(BF.groups.return.card_line)).toBeNull();
  });

  it("flag on: the full line", () => {
    renderFeatures();
    const ret = cards().find((c) => c.dataset.group === "return");
    expect(within(ret).getByText(BF.groups.return.card_line)).toBeTruthy();
  });
});

describe("panel", () => {
  it.each(BUSINESS_FEATURE_GROUPS)("%s: 4 tiles with an icon each, then the rest as a ✓ list", (group) => {
    renderFeatures();
    fireEvent.click(cardButton(group));
    expect(panel().dataset.group).toBe(group);
    const visible = visibleBusinessFeatures().filter((f) => f.group === group);
    const tiles = within(panel()).getAllByTestId("join-tile");
    expect(tiles.map((t) => t.dataset.feature)).toEqual(visible.filter((f) => f.tile).map((f) => f.id));
    expect(tiles).toHaveLength(4);
    for (const tile of tiles) {
      expect(tile.querySelector("svg"), `${tile.dataset.feature} icon`).not.toBeNull();
      expect(tile.textContent).toContain(BF.items[tile.dataset.feature].tile_title);
      expect(tile.textContent).toContain(BF.items[tile.dataset.feature].tile_line);
    }
    const items = within(panel()).queryAllByTestId("join-check-item").map((li) => li.dataset.feature);
    expect(items).toEqual(visible.filter((f) => !f.tile).map((f) => f.id));
    expect(within(panel()).getByRole("heading", { level: 3 }).textContent).toBe(BF.groups[group].label);
  });

  it("flag off: 3 tiles in «return», no surprise-bags tile or item", () => {
    vi.stubEnv("NEXT_PUBLIC_RESCUE_BAGS_ENABLED", "false");
    renderFeatures();
    fireEvent.click(cardButton("return"));
    const tiles = within(panel()).getAllByTestId("join-tile").map((t) => t.dataset.feature);
    expect(tiles).toEqual(["group_buys", "events", "recipes"]);
    expect(within(panel()).queryAllByTestId("join-check-item").map((li) => li.dataset.feature)).not.toContain(
      "rescue_bags",
    );
  });

  it("reduced motion: every animated row carries the motion-reduce opt-outs", () => {
    renderFeatures();
    const rows = [
      ...within(panel()).getAllByTestId("join-tile"),
      ...within(panel()).getAllByTestId("join-check-item"),
    ];
    for (const row of rows) {
      expect(row.className).toContain("motion-reduce:transition-none");
      expect(row.className).toContain("motion-reduce:transform-none");
    }
  });

  it("a row at rest carries no transform class (else an open tip is painted under the next row)", () => {
    renderFeatures();
    const rows = [
      ...within(panel()).getAllByTestId("join-tile"),
      ...within(panel()).getAllByTestId("join-check-item"),
    ];
    expect(rows.length).toBeGreaterThan(4); // control: the walk found rows
    for (const row of rows) {
      const classes = row.className.split(/\s+/).filter((c) => !c.includes(":"));
      expect(classes.filter((c) => /translate/.test(c)), row.dataset.feature).toEqual([]);
    }
  });
});

describe("phone shelf scroll", () => {
  it("a tap centres the tapped card in the shelf, then brings the panel into view", () => {
    // jsdom lays nothing out: give the shelf a box and the cards a box off-centre.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function box() {
      if (this.dataset?.testid === "join-shelf") return { left: 0, width: 390, top: 0, height: 400 };
      if (this.dataset?.testid === "join-group-card") return { left: -320, width: 300, top: 0, height: 400 };
      return { left: 0, width: 0, top: 0, height: 0 };
    });
    renderFeatures();
    const shelf = screen.getByTestId("join-shelf");
    shelf.scrollBy = vi.fn();
    const panelScroll = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
    // setup.js installs scrollIntoView as ONE shared vi.fn(); spyOn returns that
    // same mock, so calls from earlier tests in this file are still on it.
    panelScroll.mockClear();
    fireEvent.click(cardButton("found"));
    // card centre (-320 + 150) − shelf centre (195) = −365
    expect(shelf.scrollBy).toHaveBeenCalledWith({ left: -365, behavior: "smooth" });
    expect(panelScroll).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
  });

  it("reduced motion: both scrolls are instant", () => {
    mockMatchMedia({ [REDUCED]: true });
    renderFeatures();
    const shelf = screen.getByTestId("join-shelf");
    shelf.scrollBy = vi.fn();
    fireEvent.click(cardButton("found"));
    expect(shelf.scrollBy).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" }));
  });

  it("desktop: selecting never scrolls the shelf (it is a column there)", () => {
    mockMatchMedia({ [DESKTOP]: true });
    renderFeatures();
    const shelf = screen.getByTestId("join-shelf");
    shelf.scrollBy = vi.fn();
    fireEvent.click(cardButton("found"));
    expect(cardButton("found").getAttribute("aria-pressed")).toBe("true"); // control: the tap landed
    expect(shelf.scrollBy).not.toHaveBeenCalled();
  });
});

describe("review round 1 (adversarial, #4123)", () => {
  it("an AbortError from play() (pause() interrupting a pending load) does NOT freeze the clip", async () => {
    playSpy.mockImplementation(() => Promise.reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    renderFeatures();
    const video = screen.getByTestId("join-clip");
    setRatio(video, 1);
    await act(async () => {});
    expect(screen.getByTestId("join-clip-toggle").getAttribute("aria-pressed")).toBe("false");
  });

  it("a refused autoplay (NotAllowedError) does show as paused", async () => {
    playSpy.mockImplementation(() => Promise.reject(Object.assign(new Error("no"), { name: "NotAllowedError" })));
    renderFeatures();
    setRatio(screen.getByTestId("join-clip"), 1);
    await act(async () => {});
    expect(screen.getByTestId("join-clip-toggle").getAttribute("aria-pressed")).toBe("true");
  });

  it("one pause choice covers every group: pausing A, then selecting B, keeps B paused", () => {
    renderFeatures();
    setRatio(screen.getByTestId("join-clip"), 1);
    fireEvent.click(screen.getByTestId("join-clip-toggle"));
    fireEvent.click(cardButton("trust"));
    const video = screen.getByTestId("join-clip");
    expect(video.dataset.group).toBe("trust");
    playSpy.mockClear();
    setRatio(video, 1);
    expect(playSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId("join-clip-toggle").getAttribute("aria-pressed")).toBe("true");
  });

  it("the clip reads the LAST observer entry (a queued [in, out] pair means out)", () => {
    renderFeatures();
    const video = screen.getByTestId("join-clip");
    act(() => {
      for (const io of observers) {
        if (io.targets.includes(video)) {
          io.callback([
            { target: video, intersectionRatio: 0.9, isIntersecting: true },
            { target: video, intersectionRatio: 0, isIntersecting: false },
          ]);
        }
      }
    });
    expect(playSpy).not.toHaveBeenCalled();
  });

  it("the panel slide flips with the document direction (RTL /he, LTR /en)", () => {
    renderFeatures();
    fireEvent.click(cardButton("found")); // forward: rows start shifted until the next frames
    const row = within(panel()).getAllByTestId("join-tile")[0];
    expect(row.className).toContain("rtl:-translate-x-[14px]");
    expect(row.className).toContain("ltr:translate-x-[14px]");
    expect(row.className.split(/\s+/)).not.toContain("-translate-x-[14px]");
  });

  it("the panel wrapper reserves the sticky header's height when scrolled into view", () => {
    renderFeatures();
    expect(panel().parentElement.className).toContain("scroll-mt-24");
  });
});

describe("toggletip", () => {
  const openTip = () => {
    renderFeatures(); // "page" has map_precision, a tipped item
    const item = within(panel())
      .getAllByTestId("join-check-item")
      .find((li) => li.dataset.feature === "map_precision");
    const button = within(item).getByRole("button", { name: he.whats_this.trigger });
    const tip = within(item).getByTestId("join-feature-tip");
    return { item, button, tip };
  };

  it("opens on tap with aria-expanded, and the text is the registry tip", () => {
    const { button, tip } = openTip();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(tip.hidden).toBe(true);
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toBe(BF.items.map_precision.tip);
    expect(tip.className).toContain("absolute"); // overlays; never pushes the list
  });

  it("closes on a second tap, on Esc, and on a tap outside", () => {
    const { button, tip } = openTip();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(tip.hidden).toBe(true);

    fireEvent.click(button);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(tip.hidden).toBe(true);

    fireEvent.click(button);
    fireEvent.pointerDown(screen.getByTestId("join-features-count"));
    expect(tip.hidden).toBe(true);
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("the live region stays in the a11y tree while closed; only its text changes", () => {
    const { item, button } = openTip();
    const region = within(item).getByTestId("join-feature-tip-region");
    expect(region.getAttribute("role")).toBe("status");
    expect(region.hidden).toBe(false);
    expect(region.textContent).toBe("");
    expect(button.getAttribute("aria-controls")).toBe(region.id);
    fireEvent.click(button);
    expect(region.textContent).toBe(BF.items.map_precision.tip);
  });

  it("keyboard focus moving elsewhere closes it (no two tips open at once)", () => {
    const { button, tip } = openTip();
    fireEvent.click(button);
    expect(tip.hidden).toBe(false);
    fireEvent.focusIn(screen.getByTestId("join-features-count"));
    expect(tip.hidden).toBe(true);
  });

  it("each «?» is described by the item it explains", () => {
    const { item, button } = openTip();
    const id = button.getAttribute("aria-describedby");
    expect(id).toBeTruthy();
    expect(item.querySelector(`#${id}`).textContent).toBe(BF.items.map_precision.label);
  });

  it("a tap inside the tip does not close it", () => {
    const { button, tip } = openTip();
    fireEvent.click(button);
    fireEvent.pointerDown(tip);
    expect(tip.hidden).toBe(false);
  });
});

describe("clips", () => {
  it("phone: exactly one <video>, in the selected card, muted loop inline preload=none", () => {
    renderFeatures();
    const videos = screen.getAllByTestId("join-clip");
    expect(videos).toHaveLength(1);
    const [video] = videos;
    expect(video.dataset.group).toBe("page");
    expect(cards()[0].contains(video)).toBe(true);
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    expect(video.hasAttribute("playsinline")).toBe(true);
    expect(video.getAttribute("preload")).toBe("none");
    expect(video.getAttribute("aria-label")).toBe(JF.media_alt.page);
  });

  it("selecting another group moves the one video there", () => {
    renderFeatures();
    fireEvent.click(cardButton("trust"));
    const videos = screen.getAllByTestId("join-clip");
    expect(videos).toHaveLength(1);
    expect(videos[0].dataset.group).toBe("trust");
    expect(cards().find((c) => c.dataset.group === "trust").contains(videos[0])).toBe(true);
  });

  it("desktop: the one video is in the stage, every card shows a poster", () => {
    mockMatchMedia({ [DESKTOP]: true });
    renderFeatures();
    const videos = screen.getAllByTestId("join-clip");
    expect(videos).toHaveLength(1);
    for (const card of cards()) expect(card.contains(videos[0])).toBe(false);
  });

  it("plays only while on screen, pauses when scrolled away", () => {
    renderFeatures();
    const video = screen.getByTestId("join-clip");
    expect(playSpy).not.toHaveBeenCalled(); // nothing before the section is seen
    setRatio(video, 0.6);
    expect(playSpy).toHaveBeenCalledTimes(1);
    setRatio(video, 0);
    expect(pauseSpy).toHaveBeenCalled();
  });

  it("the pause control: name + aria-pressed flip, and it really pauses", () => {
    renderFeatures();
    const video = screen.getByTestId("join-clip");
    setRatio(video, 1);
    const toggle = screen.getByTestId("join-clip-toggle");
    expect(toggle.getAttribute("aria-label")).toBe(JF.pause);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    pauseSpy.mockClear();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-label")).toBe(JF.play);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(pauseSpy).toHaveBeenCalled();
    // The toggle inside the card must not re-select or bubble into the card.
    expect(cardButton("page").getAttribute("aria-pressed")).toBe("true");
  });

  it("reduced motion: the clip starts paused, even in view", () => {
    mockMatchMedia({ [REDUCED]: true });
    renderFeatures();
    const video = screen.getByTestId("join-clip");
    setRatio(video, 1);
    expect(playSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId("join-clip-toggle").getAttribute("aria-label")).toBe(JF.play);
  });

  it("«עסק לדוגמה» sits on every media slot (6 cards + the stage), as HTML", () => {
    renderFeatures();
    const labels = screen.getAllByTestId("join-sample-label");
    expect(labels).toHaveLength(BUSINESS_FEATURE_GROUPS.length + 1);
    for (const label of labels) expect(label.textContent).toBe(JF.sample_label);
  });
});
