import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// MEH-1661 — Emoji LOCK, messages layer (closes the class MEH-1472 left open).
// The component guard (NoEmojiInComponents.test.js) deliberately excluded
// messages/*.json; 46 emoji lines survived it with no red. Sapir's 27/07
// classification: UI strings = emoji stripped; outbound-message payloads
// (WhatsApp / social share text that is SENT, never rendered as UI chrome)
// keep theirs. This guard pins that end state: every emoji-bearing key in
// every messages file must be one of the justified exemptions below, and the
// exemptions themselves must stay emoji-bearing (a stale allowlist entry is
// its own failure — no silent drift in either direction).
//
// MEH-1681 — WHERE THE BOUNDARY IS, AND WHY IT IS NOT MOVING.
// `Extended_Pictographic` is the deliberate line, not an oversight. Star,
// check and arrow glyphs are NOT matched by it, verified against ICU:
// ☆ U+2606, ★ U+2605, ✓ U+2713, ✗ U+2717, ← U+2190 are all
// Extended_Pictographic = False. So this guard never "missed" them — by its
// definition they are typography, and MEH-1472 already settled that reading
// when it moved ⭐ → ★ in admin/reviews/page.jsx and called ★ the repo's
// typographic star.
//
// Two proposals were considered and both declined:
//   · widening to U+2600–U+27BF — would redden ~80 lines per locale and
//     overturn the MEH-1472 precedent;
//   · allowlisting the ☆ ambassador string — would entrench the glyph as a
//     directional cue and leave the real bug (a state label on an action
//     item) open.
// MEH-1681 removed that ☆ instead, by retiring the string that carried it:
// the admin kebab now names the action ("הגדרה כשגרירה" / "הסרת תפקיד
// שגרירה"). The glyph left as a side effect of fixing the copy — no regex
// change and no allowlist growth here, on purpose.
// This note exists so the two guards do not drift into arguing about the
// definition.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MESSAGES_DIR = path.join(HERE, "..", "messages");

// NOTE: no `g` flag — this regex is used with .test() across many strings,
// and a sticky lastIndex would make results order-dependent.
const EMOJI = /\p{Extended_Pictographic}/u;

// Dotted key path → one-line justification. Same key set applies to every
// locale file (MEH-978 key parity). Every entry is an OUTBOUND payload:
// the string leaves the site (wa.me / navigator.share / clipboard caption),
// it is never rendered as UI chrome.
const EXEMPT_KEYS = {
  "group_buys.detail.share_text":
    "Group-buy WhatsApp share payload (GroupBuyDetailClient.jsx → wa.me URL).",
  "admin.outreach.wa_templates.warm_body":
    "Outreach WhatsApp template body (admin/outreach → wa.me prefill), sent to the prospect.",
  "admin.outreach.wa_templates.short_body":
    "Outreach WhatsApp short template body (admin/outreach → wa.me prefill), sent to the prospect.",
  "share.wa_message_with_meta":
    "Producer share payload (ShareButton.jsx → navigator.share / wa.me), sent to WhatsApp.",
  "story.canvas.caption_prefix":
    "Instagram story caption copied to clipboard (StoryCardCanvas.jsx), social payload not UI.",
};
const EXPECTED_EMOJI_KEYS = Object.keys(EXEMPT_KEYS).length; // 5

function collectEmojiKeys(node, prefix = "", acc = []) {
  if (typeof node === "string") {
    if (EMOJI.test(node)) acc.push(prefix);
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      collectEmojiKeys(v, prefix ? `${prefix}.${k}` : k, acc);
    }
  }
  return acc;
}

const messageFiles = readdirSync(MESSAGES_DIR).filter((f) => f.endsWith(".json"));

describe("MEH-1661 Emoji LOCK — messages files", () => {
  it("scans a non-empty messages corpus (guard is actually wired)", () => {
    expect(messageFiles.length).toBeGreaterThanOrEqual(2); // he + en at minimum
  });

  // MEH-1619 self-test FIRST: if the classifier can't tell a clean value
  // from a regression-shaped one, nothing below is worth reading.
  // Deterministic synthetic inputs exercising the REAL collector.
  it("self-test: the collector flags emoji values and passes clean ones", () => {
    const clean = collectEmojiKeys({ a: { b: "משלוחים אליי" } });
    const regression = collectEmojiKeys({ a: { b: "משלוחים אליי 📦" } });
    const neutral = collectEmojiKeys({ a: { b: "★ → ↔ ©…" } }); // typographic, not Extended_Pictographic... except ©
    expect(clean).toEqual([]);
    expect(regression).toEqual(["a.b"]);
    // © IS Extended_Pictographic — the collector must flag it, proving the
    // net is wide; real © usage lives in components (allowlisted there), not
    // in messages values.
    expect(neutral).toEqual(["a.b"]);
  });

  for (const file of messageFiles) {
    describe(file, () => {
      const data = JSON.parse(readFileSync(path.join(MESSAGES_DIR, file), "utf8"));
      const emojiKeys = collectEmojiKeys(data);

      it("every emoji-bearing key is an allowlisted outbound payload", () => {
        const offenders = emojiKeys.filter((k) => !(k in EXEMPT_KEYS));
        expect(
          offenders,
          `Un-exempted emoji in ${file}:\n${offenders.join("\n")}\n` +
            "UI strings must not carry emoji (MEH-1661 / Emoji LOCK v2). " +
            "If this key is a genuine outbound-message payload, add it to " +
            "EXEMPT_KEYS with a one-line justification."
        ).toEqual([]);
      });

      it("every allowlisted key still exists and still carries its emoji", () => {
        // Split checks (no ||): a missing key and a de-emojified key are
        // different failures and each must be visible on its own.
        const present = new Set(emojiKeys);
        const stale = Object.keys(EXEMPT_KEYS).filter((k) => !present.has(k));
        expect(
          stale,
          `Stale EXEMPT_KEYS entries for ${file} (key gone or emoji removed): ${stale.join(", ")}\n` +
            "Remove the entry so the allowlist mirrors reality."
        ).toEqual([]);
      });

      it(`numeric final state: exactly ${EXPECTED_EMOJI_KEYS} emoji-bearing keys`, () => {
        expect(emojiKeys.length).toBe(EXPECTED_EMOJI_KEYS);
      });
    });
  }
});
