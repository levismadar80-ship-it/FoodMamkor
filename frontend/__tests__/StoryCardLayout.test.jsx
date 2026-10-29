import { describe, it, expect, beforeAll } from "vitest";
import { drawCard, STORY_SAFE_TOP, STORY_SAFE_BOTTOM } from "@/components/StoryCardCanvas";

// MEH-2589: the story card is drawn for Instagram, whose own UI covers the top
// ~250px (progress bar, account row) and the bottom ~340px (reply bar) of a
// 1080×1920 story. Everything the card says must sit between them, be big
// enough to read on a phone, and carry no printed URL (text inside a story
// image is not clickable — the link goes on as an Instagram link sticker).

// A recording 2D context: every fillText lands with the font that was active,
// and measureText scales with the font size so wrapping/fitting is exercised.
function recordingCtx() {
  const calls = [];
  const ctx = {
    font: "10px sans-serif",
    fillStyle: "#000",
    calls,
    measureText(text) {
      const size = Number((/(\d+)px/.exec(ctx.font) || [0, 10])[1]);
      return { width: String(text).length * size * 0.5 };
    },
    fillText(text, x, y) {
      calls.push({ text: String(text), x, y, font: ctx.font });
    },
    createLinearGradient: () => ({ addColorStop: () => {} }),
  };
  for (const m of [
    "fillRect", "beginPath", "arc", "arcTo", "fill", "save", "clip", "drawImage",
    "restore", "stroke", "moveTo", "lineTo", "closePath",
  ]) ctx[m] = () => {};
  return ctx;
}

function canvasWith(ctx) {
  return { getContext: () => ctx, width: 0, height: 0 };
}

const fontSize = (font) => Number(/(\d+)px/.exec(font)[1]);
const KICKER = "בית עסק חדש במהמקור";

beforeAll(() => {
  // jsdom never fetches images; settle every load as an error so the
  // no-photo path draws, deterministically and without waiting.
  globalThis.Image = class {
    set src(_v) { setTimeout(() => this.onerror?.(new Error("no image in jsdom"))); }
  };
});

async function draw(producer) {
  const ctx = recordingCtx();
  await drawCard(canvasWith(ctx), producer, { kicker: KICKER });
  return ctx.calls;
}

const base = { id: "p1", city: "מודיעין", slug: "lehem-vezman", images: [], categories: [{ name: "לחמים ואפייה" }] };

describe("StoryCardCanvas drawing (MEH-2589)", () => {
  it("keeps every line of text inside Instagram's uncovered band", async () => {
    const calls = await draw({ ...base, name: "מאפיית לחם וזמן" });
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(c.y, `"${c.text}" at y=${c.y}`).toBeGreaterThanOrEqual(STORY_SAFE_TOP);
      expect(c.y, `"${c.text}" at y=${c.y}`).toBeLessThanOrEqual(STORY_SAFE_BOTTOM);
    }
  });

  it("prints no URL on the card", async () => {
    const calls = await draw({ ...base, name: "מאפיית לחם וזמן" });
    expect(calls.some((c) => /\/p\/|mehamakor\.|https?:/.test(c.text))).toBe(false);
  });

  it("draws the name large, plus the label and the city line legibly", async () => {
    const calls = await draw({ ...base, name: "מאפיית לחם וזמן" });
    const name = calls.find((c) => c.text === "מאפיית לחם וזמן");
    expect(name).toBeTruthy();
    expect(fontSize(name.font)).toBeGreaterThanOrEqual(76);
    const kicker = calls.find((c) => c.text === KICKER);
    expect(kicker).toBeTruthy();
    expect(fontSize(kicker.font)).toBeGreaterThanOrEqual(32);
    const meta = calls.find((c) => c.text.includes("מודיעין"));
    expect(meta).toBeTruthy();
    expect(fontSize(meta.font)).toBeGreaterThanOrEqual(40);
  });

  it("caps a very long name at two lines ending with an ellipsis", async () => {
    const long = "המאפייה הכפרית הוותיקה של משפחת כהן מזכרון יעקב והסביבה הקרובה ועוד מילים רבות מאוד";
    const calls = await draw({ ...base, name: long });
    const nameLines = calls.filter((c) => c.font.includes("Frank Ruhl") && c.text !== "מהמקור");
    expect(nameLines).toHaveLength(2);
    expect(nameLines[1].text.endsWith("…")).toBe(true);
  });

  it("never lets a name line run wider than the text column, even one long word", async () => {
    const calls = await draw({ ...base, name: "א".repeat(40) });
    const nameLines = calls.filter((c) => c.font.includes("Frank Ruhl") && c.text !== "מהמקור");
    expect(nameLines.length).toBeGreaterThan(0);
    for (const l of nameLines) {
      // same width model as recordingCtx.measureText; column = 1080 - 2×90
      expect(l.text.length * fontSize(l.font) * 0.5).toBeLessThanOrEqual(900);
    }
    expect(nameLines.at(-1).text.endsWith("…")).toBe(true);
  });

  it("shows at most the first two categories", async () => {
    const calls = await draw({
      ...base,
      name: "מאפייה",
      categories: [{ name: "לחמים" }, { name: "מאפים" }, { name: "גבינות" }],
    });
    const meta = calls.find((c) => c.text.includes("מודיעין"));
    expect(meta.text).toContain("מאפים");
    expect(meta.text).not.toContain("גבינות");
  });
});
