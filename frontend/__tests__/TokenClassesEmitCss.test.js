/**
 * MEH-1687 / ADR-038 — every token-spelled class the codemods introduced
 * actually EMITS CSS, and emits exactly what the raw spelling it replaced did.
 *
 * Why: Tailwind renders nothing — and raises nothing — for a class whose key
 * is missing from the config. The value pins in the codemod tests
 * (RadiusTokenCodemod, TouchTokenCodemod, StatusColorTokenCodemod) check the
 * JSON, not the compiled output; a config that stopped spreading the tokens
 * would leave every pin green and every converted site unstyled. This test
 * compiles both spellings through the repo's own tailwind.config.js and
 * compares the declarations. (CI reviewer on PR #4041, "Should Consider" 2.)
 */
import { describe, it, expect } from "vitest";
import postcss from "postcss";
import tailwind from "tailwindcss";
import config from "../tailwind.config.js";

async function declarations(cls) {
  const cfg = { ...config, content: [{ raw: cls }], corePlugins: { ...(config.corePlugins || {}), preflight: false } };
  const out = await postcss([tailwind(cfg)]).process("@tailwind utilities;", { from: undefined });
  const m = out.css.match(/\{([^}]*)\}/);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

const STEPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"];
const PAIRS = [
  ...STEPS.flatMap((s) => [
    [`bg-danger-${s}`, `bg-red-${s}`],
    [`text-warning-${s}`, `text-amber-${s}`],
  ]),
  ["border-danger-200", "border-red-200"],
  ["bg-danger-600/20", "bg-red-600/20"],
  ["bg-surface", "bg-white"],
  ["bg-surface/90", "bg-white/90"],
  ["bg-surface/95", "bg-white/95"],
  ["rounded-sm", "rounded-[8px]"],
  ["rounded-md", "rounded-[12px]"],
  ["rounded-lg", "rounded-[16px]"],
  ["rounded-xl", "rounded-[20px]"],
  ["min-h-touch", "min-h-[44px]"],
  ["min-w-touch", "min-w-[44px]"],
];

describe("token classes emit the same CSS as the raw spelling they replaced", () => {
  it("control: a class with no config key emits nothing, and a different step differs", async () => {
    expect(await declarations("bg-no-such-token-50")).toBe("");
    expect(await declarations("bg-danger-600")).not.toBe(await declarations("bg-danger-700"));
  });

  it.each(PAIRS)("%s ≡ %s", async (token, raw) => {
    const t = await declarations(token);
    expect(t, `${token} emitted no CSS — is its key in tailwind.tokens.json and spread by the config?`).not.toBe("");
    expect(t).toBe(await declarations(raw));
  });
});
