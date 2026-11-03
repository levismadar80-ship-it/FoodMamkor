import { describe, it, expect } from "vitest";
import { drawReviewCard } from "@/components/ReviewCardCanvas";
import { STORY_SAFE_TOP, STORY_SAFE_BOTTOM } from "@/components/StoryCardCanvas";
import { BRAND_NAME } from "@/lib/constants";

// MEH-1428 chunk B — the review share card is drawn for Instagram, so it inherits
// the story card's constraints (everything inside the uncovered band, no printed
// URL) and adds one of its own that no other card has: the reviewer must not
// appear. These assertions guard the privacy rule and the truncation.
//
// Harness copied from StoryCardLayout.test.jsx (MEH-2589) on purpose — same
// recording context, same width model — so the two cards' geometry is measured
// the same way.
function recordingCtx() {
  const calls = [];
  const ctx = {
    font: "10px sans-serif",
    fillStyle: "#000",
    globalAlpha: 1,
    direction: "ltr",
    textAlign: "left",
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
    "restore", "stroke", "moveTo", "lineTo", "closePath", "ellipse", "translate",
    "scale", "rotate",
  ]) ctx[m] = () => {};
  return ctx;
}

function canvasWith(ctx) {
  return { getContext: () => ctx, width: 0, height: 0 };
}

const fontSize = (font) => Number(/(\d+)px/.exec(font)[1]);
const HEADLINE = "מה הלקוחות מספרות";
const PRODUCER = { id: "p1", name: "מאפיית לחם וזמן", slug: "lehem-vezman" };

async function draw(review, producer = PRODUCER) {
  const ctx = recordingCtx();
  await drawReviewCard(canvasWith(ctx), producer, review, { headline: HEADLINE });
  return ctx.calls;
}

// Everything the card actually printed, joined — used by the "nothing else
// leaks" assertions.
const cardText = (calls) => calls.map((c) => c.text).join("\n");

// The review text only. The headline and the brand wordmark (drawn by
// drawLockup) share the serif face, so a face filter alone picks them up too —
// excluded by VALUE, and BRAND_NAME is imported rather than spelled out so a
// rebrand cannot quietly fold the wordmark back into the quote.
const quoteLinesOf = (calls) =>
  calls.filter(
    (c) => c.font.includes("Frank Ruhl") && c.text !== HEADLINE && c.text !== BRAND_NAME,
  );

describe("ReviewCardCanvas drawing (MEH-1428 chunk B)", () => {
  it("keeps every line of text inside Instagram's uncovered band", async () => {
    const calls = await draw({ id: "r1", stars: 5, body: "הלחם הכי טוב שאכלתי. באמת." });
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(c.y, `"${c.text}" at y=${c.y}`).toBeGreaterThanOrEqual(STORY_SAFE_TOP);
      expect(c.y, `"${c.text}" at y=${c.y}`).toBeLessThanOrEqual(STORY_SAFE_BOTTOM);
    }
  });

  it("prints the headline, the review and the business name, legibly", async () => {
    const body = "הלחם הכי טוב שאכלתי. באמת.";
    const calls = await draw({ id: "r1", stars: 5, body });
    const headline = calls.find((c) => c.text === HEADLINE);
    expect(headline, "headline missing").toBeTruthy();
    expect(fontSize(headline.font)).toBeGreaterThanOrEqual(40);
    const quote = calls.find((c) => c.text.includes("הלחם הכי טוב"));
    expect(quote, "review body missing").toBeTruthy();
    expect(fontSize(quote.font)).toBeGreaterThanOrEqual(44);
    const name = calls.find((c) => c.text === PRODUCER.name);
    expect(name, "business name missing").toBeTruthy();
    expect(fontSize(name.font)).toBeGreaterThanOrEqual(40);
  });

  // The privacy rule. ReviewOut carries user_name; drawReviewCard receives the
  // whole review object, so nothing but this assertion stops a future edit from
  // printing it. A reviewer name on a card the owner posts publicly is the
  // failure this card exists to avoid.
  it("prints NO reviewer name, even when the review object carries one", async () => {
    const calls = await draw({
      id: "r1",
      stars: 5,
      body: "קניתי חלה לשבת והיא נעלמה בחצי שעה.",
      user_name: "רונית לוי",
      user_id: "u-77",
    });
    expect(cardText(calls)).not.toContain("רונית");
    expect(cardText(calls)).not.toContain("לוי");
    expect(cardText(calls)).not.toContain("u-77");
  });

  it("prints no URL on the card (MEH-2589 ruling, inherited)", async () => {
    const calls = await draw({ id: "r1", stars: 4, body: "מעולה, ממליצה בחום." });
    expect(calls.some((c) => /\/p\/|mehamakor\.|https?:/.test(c.text))).toBe(false);
  });

  // The ticket names "a long review (300+ chars)". Measured against this
  // harness's width model, the block holds ~470 characters at QUOTE_MIN, so a
  // 300-char review is NOT the truncation case — it is the case that must come
  // through whole. Asserting an ellipsis here would have been asserting a bug.
  it("renders a 300-char review in full, with no ellipsis", async () => {
    const body = `${"הגעתי בהמלצה של חברה ומאז קונה כל שבוע. ".repeat(8)}סוף.`;
    expect(body.length).toBeGreaterThan(300);
    expect(body.length).toBeLessThan(460);
    const calls = await draw({ id: "r1", stars: 5, body });
    const quoteLines = quoteLinesOf(calls);
    expect(quoteLines.length).toBeGreaterThan(1);
    expect(quoteLines.some((l) => l.text.includes("…")), "truncated a review that fits").toBe(false);
    // Every word survived the wrap (whitespace is re-joined, so compare words).
    const drawn = quoteLines.map((l) => l.text).join(" ").split(/\s+/).filter(Boolean);
    expect(drawn).toEqual(body.split(/\s+/).filter(Boolean));
  });

  // Past the block's capacity it must be cut, end with exactly ONE ellipsis,
  // and still leave the business name inside the band.
  it("truncates an over-long review with a single ellipsis and keeps the name on the card", async () => {
    const long = "הגעתי לכאן בהמלצה של חברה ומאז אני קונה כל שבוע בלי יוצא מן הכלל. ".repeat(14);
    expect(long.length).toBeGreaterThan(700);
    const calls = await draw({ id: "r1", stars: 5, body: long });
    const quoteLines = quoteLinesOf(calls);
    expect(quoteLines.length).toBeGreaterThan(1);
    const last = quoteLines.at(-1).text;
    expect(last.endsWith("…"), `last line: ${JSON.stringify(last)}`).toBe(true);
    expect(last.endsWith("……"), "double ellipsis").toBe(false);
    // Exactly one ellipsis on the whole card, not one per line.
    const joined = quoteLines.map((l) => l.text).join("");
    expect([...joined].filter((ch) => ch === "…")).toHaveLength(1);
    // The whole review did not fit, so something was dropped.
    expect(joined.length).toBeLessThan(long.length);
    const name = calls.find((c) => c.text === PRODUCER.name);
    expect(name, "business name dropped off a long review").toBeTruthy();
    expect(name.y).toBeLessThanOrEqual(STORY_SAFE_BOTTOM);
  });

  it("never lets a quote line run wider than the text column, even one long word", async () => {
    const calls = await draw({ id: "r1", stars: 5, body: "א".repeat(120) });
    const quoteLines = quoteLinesOf(calls);
    expect(quoteLines.length).toBeGreaterThan(0);
    for (const l of quoteLines) {
      // Same width model as recordingCtx.measureText. Column = 1080 - 2×90
      // (SIDE) - 6 (RULE_W) - 34 (RULE_GAP) = 860.
      expect(l.text.length * fontSize(l.font) * 0.5).toBeLessThanOrEqual(860);
    }
  });

  // Regression: found by looking at the exported PNG, not by a failing test.
  // The name was drawn at a fixed 46px with no width fitting, so
  // "מאפיית לחם וזמן הכפרית של משפחת לוי מזכרון יעקב והסביבה" ran off the
  // inline end of the canvas and the last two words were gone with no trace.
  it("fits a long business name inside the text column instead of clipping it", async () => {
    const longName = "מאפיית לחם וזמן הכפרית של משפחת לוי מזכרון יעקב והסביבה";
    const calls = await draw({ id: "r1", stars: 5, body: "מעולה" }, { ...PRODUCER, name: longName });
    const name = calls.find((c) => c.font.includes("Heebo"));
    expect(name, "business name missing").toBeTruthy();
    // Same width model as recordingCtx.measureText; column = 860 (see above).
    expect(name.text.length * fontSize(name.font) * 0.5).toBeLessThanOrEqual(860);
    // It was actually constrained — shrunk, cut, or both — not left at full size.
    expect(fontSize(name.font) < 46 || name.text.endsWith("…")).toBe(true);
    expect(name.y).toBeLessThanOrEqual(STORY_SAFE_BOTTOM);
  });

  // Regression: the first QA pass put a one-line review's name at y≈1150 with
  // the bottom 40% of the card empty. The name now has a fixed baseline near
  // the foot of the safe band, whatever the review's length.
  it("anchors the business name near the foot of the card at every review length", async () => {
    const shortCalls = await draw({ id: "r1", stars: 5, body: "מעולה" });
    const longCalls = await draw({
      id: "r2",
      stars: 5,
      body: "הגעתי לכאן בהמלצה של חברה ומאז אני קונה כל שבוע בלי יוצא מן הכלל. ".repeat(5),
    });
    const nameY = (calls) => calls.find((c) => c.font.includes("Heebo")).y;
    expect(nameY(shortCalls)).toBe(nameY(longCalls));
    // In the lower third of the uncovered band, not floating mid-card.
    expect(nameY(shortCalls)).toBeGreaterThan(STORY_SAFE_TOP + (STORY_SAFE_BOTTOM - STORY_SAFE_TOP) * 0.66);
  });

  it("renders mixed Hebrew / Latin / digits verbatim, in an RTL context", async () => {
    const body = "הזמנתי 3 חלות ל-Shabbat 2026 ושילמתי 90 ש״ח. מושלם!";
    const calls = await draw({ id: "r1", stars: 5, body });
    const joined = calls.map((c) => c.text).join(" ");
    // The bidi algorithm orders the RUNS at paint time; the strings handed to
    // fillText must still carry every token unreversed.
    for (const token of ["3", "Shabbat", "2026", "90", "חלות", "מושלם!"]) {
      expect(joined, `lost token ${token}`).toContain(token);
    }
  });

  it("sets the canvas direction to rtl", async () => {
    const ctx = recordingCtx();
    await drawReviewCard(canvasWith(ctx), PRODUCER, { id: "r1", stars: 5, body: "טעים" }, {
      headline: HEADLINE,
    });
    expect(ctx.direction).toBe("rtl");
  });

  it("sizes the canvas to a 1080x1920 story", async () => {
    const ctx = recordingCtx();
    const canvas = canvasWith(ctx);
    await drawReviewCard(canvas, PRODUCER, { id: "r1", stars: 5, body: "טעים" }, {
      headline: HEADLINE,
    });
    expect(canvas.width).toBe(1080);
    expect(canvas.height).toBe(1920);
  });
});
