/**
 * MEH-3069 — a person's initial comes from avatarInitial() in
 * components/ui/Avatar.jsx, and the signed-in person's circle is <Avatar>.
 * Before 13/11 `name.trim().charAt(0).toUpperCase()` was copied into four
 * files (Header, AccountSheet, BottomNav, settings) in four circle styles;
 * charAt(0) also splits a name that opens with an emoji.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { avatarInitial } from "@/components/ui/Avatar";

const ROOT = path.resolve(__dirname, "..");
const OWNER = "components/ui/Avatar.jsx";

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "__tests__") continue;
      walk(p, out);
    } else if (/\.(jsx?|tsx?)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}
const files = ["app", "components"].flatMap((d) => walk(path.join(ROOT, d))).map((p) => ({
  rel: path.relative(ROOT, p).split(path.sep).join("/"),
  src: fs.readFileSync(p, "utf8"),
}));

// a first letter taken by hand: .charAt(0), Array.from(x)[0] (one level of
// nested parens, e.g. Array.from(name.trim())[0]) or [...x][0]
const HAND_INITIAL = /\.charAt\(0\)|Array\.from\((?:[^()]|\([^()]*\))*\)\[0\]|\[\.\.\.[\w.?]+\]\[0\]/;

describe("AvatarGuard (MEH-3069)", () => {
  it("control: corpus is real and the owner holds the pattern", () => {
    expect(files.length).toBeGreaterThan(200);
    expect(HAND_INITIAL.test(files.find((f) => f.rel === OWNER).src)).toBe(true);
  });

  it("the pattern catches the hand-written shapes (self-test)", () => {
    for (const src of [
      '(user.name || "?").trim().charAt(0).toUpperCase()', // the old Header line
      "Array.from(name)[0]", // the old OwnerCard line
      "Array.from(name.trim())[0]",
      "[...name][0]",
    ]) expect(HAND_INITIAL.test(src)).toBe(true);
    expect(HAND_INITIAL.test("avatarInitial(name)")).toBe(false);
  });

  it("no hand-taken first letter outside ui/Avatar.jsx", () => {
    const offenders = files.filter((f) => f.rel !== OWNER && HAND_INITIAL.test(f.src)).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("every file that renders user.avatar_url uses <Avatar>", () => {
    const offenders = files
      .filter((f) => f.rel !== OWNER && /\.avatar_url\b/.test(f.src))
      .filter((f) => !/<Avatar\b/.test(f.src))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("avatarInitial: one code point, upper-cased, fallback when empty", () => {
    expect(avatarInitial("שירה כהן")).toBe("ש");
    expect(avatarInitial("  dana ")).toBe("D");
    expect(avatarInitial("😀 Tal")).toBe("😀");
    expect(avatarInitial("")).toBe("?");
    expect(avatarInitial(null, "")).toBe("");
  });
});
