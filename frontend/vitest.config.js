import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { transformWithOxc } from "vite";
import path from "path";

// MEH-729: ~55 source files carry JSX inside a `.js` extension
// (lib/highlightMatch.js:18, lib/auth-context.js:173, app/**/page.js …).
// Vitest's oxc transform derives the parser `lang` from the file extension,
// so a `.js` file is parsed as plain JS and throws
// `[PARSE_ERROR] Unexpected JSX expression`. Next.js/SWC tolerates JSX-in-.js
// in production (which is why the app builds), but the vitest pipeline does
// not. This `pre` plugin re-parses project `.js` files with `lang: "jsx"`
// before the default pipeline sees them; on any oxc error it returns null so
// genuinely non-JSX `.js` files fall through untouched. Config-only — no file
// renames, no production-code change.
const jsxInJs = {
  name: "meh729:jsx-in-js",
  enforce: "pre",
  async transform(code, id) {
    const [file] = id.split("?");
    if (!file.endsWith(".js") || file.includes("/node_modules/")) return null;
    try {
      const result = await transformWithOxc(code, id, {
        lang: "jsx",
        jsx: { runtime: "automatic" },
      });
      return { code: result.code, map: result.map };
    } catch {
      return null;
    }
  },
};

export default defineConfig({
  plugins: [jsxInJs, react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./__tests__/setup.js",
    css: false,
    include: ["__tests__/**/*.test.{js,jsx,ts,tsx}"],
    exclude: ["e2e/**", "lib/**/*.test.mjs"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // MEH-977: the `server-only` package throws when imported outside an RSC;
      // stub it so tests importing server-guarded modules (lib/server-fetch.js,
      // app/sitemap.js) load cleanly under jsdom/node.
      "server-only": path.resolve(__dirname, "__tests__/stubs/server-only.js"),
    },
  },
});
