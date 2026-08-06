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
    // MEH-1912: worker pool, chosen from measurement rather than default.
    //
    // Profiling the full suite locally (4 cores, 282 files, 2418 tests) gave
    // `Duration 198.46s (transform 10.31s, setup 21.87s, import 198.68s,
    // tests 70.45s, environment 244.74s)`. Those phase totals are summed
    // across workers, so they exceed wall-clock — the ratio is the point:
    // constructing a jsdom **environment** costs 244.74s against 70.45s of
    // actual test execution, i.e. 3.5x more time building DOMs than using
    // them. Per-file test durations sum to only 67.9s of the 198s wall, so
    // roughly two thirds of the run is per-file fixed cost, not test bodies.
    //
    // `threads` is preferred over the vitest default (`forks`) because that
    // fixed cost is paid once per file, and worker threads start cheaper than
    // forked processes. Be honest about the size of the win: on the same
    // suite and machine, baseline runs measured 198s and 200s, and threaded
    // runs measured 189s and 195s. That is a few percent at most and it
    // overlaps run-to-run variance — it is NOT a reliable -4.5%. The phase
    // total moved in the same direction (`environment` 244.74s -> 224–234s),
    // which is why it is kept, but the real speedup is sharding, not this.
    // Free and green either way (281 passed / 1 skipped, identical to
    // baseline), so it stays; do not cite it as a headline number.
    pool: "threads",
    // `isolate: false` is the obvious next lever and it is REJECTED, measured
    // rather than assumed. Reusing one environment across files makes the
    // suite catastrophically slower, not faster: individual DatePicker cases
    // went from ~40ms to 38-44s each (`38932ms`, `39771ms`, `43875ms`) and the
    // run blew past 10 minutes without finishing. State accumulated in the
    // shared jsdom — not a tuning knob, a cliff. Do not re-enable without
    // re-measuring; the failure is a timeout, not a red assertion, so it will
    // look like a hang rather than a broken config.
    //
    // maxWorkers is deliberately NOT pinned. vitest defaults to the available
    // core count; hardcoding a number would either cap a 4-core runner or
    // oversubscribe a 2-core one, and CI and local machines differ here (see
    // docs/ci/meh-1912-vitest-shard.patch.md, "parallelism starvation").
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
