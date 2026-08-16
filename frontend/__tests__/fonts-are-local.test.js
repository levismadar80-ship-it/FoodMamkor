/**
 * MEH-2029 — the fonts stay local, and the fallback face stays last.
 *
 * Three properties, each of which fails silently in production if it breaks:
 *
 *  1. Nothing imports `next/font/google`. That import is what put 60 build-time
 *     fetches to fonts.gstatic.com in front of every CI build.
 *  2. Every `path:` in app/fonts.js resolves to a file that exists. A renamed
 *     .woff2 is the guarded-registry drift class (MEH-1030).
 *  3. Every `localFont()` argument is a LITERAL. Turbopack's SWC transform
 *     serialises these statically and DROPS anything it cannot evaluate — a
 *     helper, a spread, an imported constant. A dropped `src` fails the build
 *     loudly; a dropped `declarations` silently costs a subset's unicode-range
 *     and nothing anywhere goes red.
 *  4. In a family split across two calls, the half carrying the size-adjusted
 *     fallback face sorts LAST in every font stack. That face is `local(Arial)`
 *     with no unicode-range, so it matches every glyph in existence — ahead of
 *     a real face it eats that face's entire script. This is the MEH-1831
 *     Arial-captures-Hebrew failure, one level up.
 *
 * The checkers are pure functions exercised against BOTH synthetic inputs with
 * known answers AND the real committed files, per .claude/rules/testing.md: a
 * probe validated only on fixtures you invented proves it works on shapes you
 * imagined, not on the shape the repo actually uses.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FONTS_MODULE = join(FRONTEND, "app", "fonts.js");
const fontsSource = readFileSync(FONTS_MODULE, "utf8");

/** Slice out the balanced `{...}` argument of every `localFont(` call. */
export function extractLocalFontCalls(source) {
  const calls = [];
  const CALL = "localFont(";
  let cursor = source.indexOf(CALL);
  while (cursor !== -1) {
    const open = source.indexOf("{", cursor);
    let depth = 0;
    let end = open;
    for (; end < source.length; end += 1) {
      if (source[end] === "{") depth += 1;
      else if (source[end] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    calls.push(source.slice(open, end + 1));
    cursor = source.indexOf(CALL, end);
  }
  return calls;
}

/**
 * Strip comments so that prose ABOUT a construct is never mistaken for the
 * construct — the same code-only discipline `audit-skills.sh` Pass 5 applies.
 * app/fonts.js explains at length why it does not use `next/font/google`, and
 * a naive substring scan reads that explanation as the offence.
 */
export function stripComments(source) {
  return source.replaceAll(/\/\*[\S\s]*?\*\//g, "").replaceAll(/\/\/[^\n]*/g, "");
}

/** Anything Turbopack cannot serialise statically. */
export function findNonLiteralArguments(callSource) {
  const code = stripComments(callSource);
  const problems = [];
  if (/\.{3}/.test(code)) problems.push("spread");
  if (/[A-Za-z_$][\w$]*\s*\(/.test(code)) problems.push("function call");
  return problems;
}

/** variable name -> the adjustFontFallback literal that call declares. */
export function readFallbackOwners(source) {
  const owners = {};
  for (const call of extractLocalFontCalls(source)) {
    const variable = /variable:\s*"([^"]+)"/.exec(call);
    const adjust = /adjustFontFallback:\s*(false|"[^"]+")/.exec(call);
    if (variable) owners[variable[1]] = adjust ? adjust[1] !== "false" : true;
  }
  return owners;
}

/** Every `var(--font-…)` reference in a font stack, in source order. */
export function orderedFontVars(stack) {
  return [...stack.matchAll(/var\((--font-[\w-]+)\)/g)].map((match) => match[1]);
}

describe("MEH-2029 · fonts are self-hosted", () => {
  it("no source file imports next/font/google", () => {
    const offenders = [];
    const skip = new Set(["node_modules", ".next", ".git", "e2e", "__tests__"]);
    const walk = (dir) => {
      for (const entry of readdirSync(dir)) {
        if (skip.has(entry)) continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (
          /\.(js|jsx|mjs)$/.test(entry) &&
          stripComments(readFileSync(full, "utf8")).includes("next/font/google")
        ) {
          offenders.push(full.replace(`${FRONTEND}/`, ""));
        }
      }
    };
    walk(FRONTEND);
    expect(offenders).toEqual([]);
  });

  it("every declared font file exists on disk", () => {
    const declared = [...fontsSource.matchAll(/path:\s*"\.\/(fonts\/[^"]+)"/g)].map((m) => m[1]);
    // Guards the guard: if the regex stops matching, `declared` goes empty and
    // the loop below passes vacuously — the null-that-reads-as-success shape.
    expect(declared.length).toBeGreaterThanOrEqual(7);
    const missing = declared.filter((rel) => !existsSync(join(FRONTEND, "app", rel)));
    expect(missing).toEqual([]);
  });

  it("every localFont() argument is a literal Turbopack can serialise", () => {
    const calls = extractLocalFontCalls(fontsSource);
    expect(calls.length).toBe(6);
    for (const call of calls) {
      const variable = /variable:\s*"([^"]+)"/.exec(call)?.[1] ?? "(unnamed)";
      expect({ variable, problems: findNonLiteralArguments(call) }).toEqual({
        variable,
        problems: [],
      });
    }
  });

  it("the fallback-bearing half of a split family sorts last in every stack", () => {
    const owners = readFallbackOwners(fontsSource);
    const tailwind = readFileSync(join(FRONTEND, "tailwind.config.js"), "utf8");
    const globals = readFileSync(join(FRONTEND, "app", "globals.css"), "utf8");

    const stacks = [
      ...[...tailwind.matchAll(/\[\s*"[^"]+",\s*(\[[^\]]*])\s*]/g)].map((m) => m[1]),
      ...[...globals.matchAll(/font-family:([^;]*var\(--font[^;]*);/g)].map((m) => m[1]),
    ];
    // Same vacuous-pass guard: 4 tailwind families + 3 globals rules.
    expect(stacks.length).toBeGreaterThanOrEqual(7);

    for (const stack of stacks) {
      const vars = orderedFontVars(stack).filter((name) => name in owners);
      if (vars.length < 2) continue;
      const carriers = vars.filter((name) => owners[name]);
      for (const carrier of carriers) {
        expect(
          { stack: vars.join(" → "), carrier, position: vars.indexOf(carrier) },
        ).toEqual({ stack: vars.join(" → "), carrier, position: vars.length - 1 });
      }
    }
  });
});

describe("MEH-2029 · the checkers discriminate", () => {
  // Anchored to the real module: a checker that only ever sees fixtures I wrote
  // proves it handles shapes I imagined (MEH-1909).
  it("passes the real app/fonts.js", () => {
    const calls = extractLocalFontCalls(fontsSource);
    expect(calls).toHaveLength(6);
    expect(calls.flatMap((call) => findNonLiteralArguments(call))).toEqual([]);
    expect(Object.keys(readFallbackOwners(fontsSource)).sort()).toEqual([
      "--font-body",
      "--font-headline",
      "--font-headline-latin",
      "--font-hebrew",
      "--font-hebrew-latin",
      "--font-latin",
    ]);
  });

  it("flags the helper-function refactor that would silently drop declarations", () => {
    const tempting = `localFont({
      src: atWeights("./fonts/heebo-hebrew.woff2", ["400"]),
      variable: "--font-hebrew",
    })`;
    expect(findNonLiteralArguments(extractLocalFontCalls(tempting)[0])).toContain("function call");
  });

  it("flags a real next/font/google import but not prose about one", () => {
    const offending = `import { Heebo } from "next/font/google";\nexport const heebo = Heebo({});`;
    expect(stripComments(offending)).toContain("next/font/google");
    // The exact shape that produced a false positive on the first run of this
    // suite: app/fonts.js explains why it left next/font/google, in a comment.
    const prose = `/* MEH-2029 moved off next/font/google. */\nimport localFont from "next/font/local";`;
    expect(stripComments(prose)).not.toContain("next/font/google");
  });

  it("flags a spread", () => {
    const spread = `localFont({ src: [...HEBREW_FACES], variable: "--font-hebrew" })`;
    expect(findNonLiteralArguments(extractLocalFontCalls(spread)[0])).toContain("spread");
  });

  it("does not flag prose in a comment that merely mentions a helper", () => {
    const commented = `localFont({
      // do not build these with atWeights(path, weights) — see the header
      src: [{ path: "./fonts/heebo-hebrew.woff2", weight: "400", style: "normal" }],
      variable: "--font-hebrew",
    })`;
    expect(findNonLiteralArguments(extractLocalFontCalls(commented)[0])).toEqual([]);
  });

  it("catches a fallback carrier that is NOT last — the Arial-eats-Hebrew ordering", () => {
    const owners = { "--font-hebrew": false, "--font-hebrew-latin": true };
    const broken = orderedFontVars("var(--font-hebrew-latin), var(--font-hebrew)");
    const carrier = broken.findIndex((name) => owners[name]);
    expect(carrier).not.toBe(broken.length - 1);

    const correct = orderedFontVars("var(--font-hebrew), var(--font-hebrew-latin)");
    expect(correct.findIndex((name) => owners[name])).toBe(correct.length - 1);
  });
});
