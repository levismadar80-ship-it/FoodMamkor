# Dependency licenses — inventory (MEH-1980 chunk 2)

**As-of:** 2026-09-03 · `origin/staging` @ `920fd048` · frontend `package-lock.json` + backend `uv.lock` as committed there.
**Method (re-runnable, read-only):**

```
cd frontend && npm ci
npm ls --json --all --omit=dev   # the SHIPPED tree (282 name@version nodes, incl. nested)
npm ls --json --all              # everything (864) — the difference is dev-only
# license per node: the `license` field of each package.json under node_modules (nested included)
cd backend && uv sync && uv pip install --python .venv pip-licenses
.venv/bin/pip-licenses --format=json --with-urls   # 137 packages in the venv
uv export --no-dev --no-hashes    # the 80 names that ship (prod extras only)
```

**Scope of the claim:** this is an *inventory* — what licence text each dependency declares, and who pulls it in. It is **not** a legal opinion. Anything in the «flagged» table is a **question for Sapir / the lawyer (MEH-1981 bundle)**, per the 03/09 ruling on the card: a copyleft or non-standard licence in a shipped dependency is a *line for Sapir*, not a fix.

**Headline:** the shipped trees are overwhelmingly permissive (npm prod: MIT 206 / Apache-2.0 29 / ISC 10 / BSD 15 / BlueOak 5 · Python prod: MIT 36 / BSD 16 / Apache 15). **No GPL / AGPL anywhere, in either tree, prod or dev.** The items worth a human read are below; none of them is an obvious violation of how the code is used today, but three are non-OSI or use-restricted licences that a privacy-and-terms lawyer should see once.

## 1 · Flagged — shipped (prod) dependencies

| package | licence | pulled in by | what it is / how it is used | why it is on this table |
|---|---|---|---|---|
| `react-leaflet@4.2.1` + `@react-leaflet/core@2.1.0` | **Hippocratic-2.1** | direct dep (`package.json:37`) — the `/map` and mini-map surfaces | shipped to every browser that renders a map | **Not OSI-approved.** An "ethical source" licence: MIT-style permissions plus a use restriction (no use that violates the UN Universal Declaration of Human Rights, etc.). For this project's use it imposes nothing operational, but it is a *conduct* clause in a shipped dependency — the lawyer should know it exists. Alternative if ever needed: plain `leaflet` (BSD-2) with a thin wrapper. |
| `@sentry/cli@2.58.6` + `@sentry/cli-linux-x64` | **FSL-1.1-MIT** (Functional Source License, converts to MIT 2 years after each release) | `@sentry/nextjs` → `@sentry/bundler-plugin-core` → `@sentry/cli` | **build-time only** — uploads source maps during `next build`; not in the browser bundle, not on the server at runtime | Source-available, *not* open source until the 2-year flip. FSL permits any use except building a competing product; using it as Sentry's own upload tool is squarely the intended use. Listed because it is the only non-open licence in the tree. |
| `@img/sharp-libvips-linux-x64@1.3.2` (+ `linuxmusl-x64`) | **LGPL-3.0-or-later** | `next@16` → `sharp@0.35` (image optimizer) | prebuilt libvips binary, **dynamically linked** by `sharp` at runtime on the server (Next image optimizer + `scripts/compress-qa-screenshots.mjs`) | LGPL, dynamically linked and unmodified → the app is not a derivative work; the obligations (keep the LGPL notice, allow relinking) are met by shipping the package as-is. This is the standard sharp/libvips posture and the one every Next.js deployment shares. `@img/sharp-wasm32` (`Apache-2.0 AND LGPL-3.0-or-later AND MIT`) is the same libvips inside a wasm build, present but not the one loaded on linux-x64. |
| `psycopg2-binary@2.9.12` | **LGPL** (with linking exception) | `foodmamkor-backend` direct | Postgres driver, runtime | LGPL with the project's own explicit linking exception; importing it from Python is not a derivative work. Standard posture for every psycopg2 user. |
| `certifi`, `py-vapid`, `pywebpush` (Python) · `dompurify` (`MPL-2.0 OR Apache-2.0`, via `posthog-js`) | **MPL-2.0** | runtime | Mozilla Public License is **file-level** copyleft: only *modifications to the library's own files* must be shared. Unmodified use carries no obligation beyond keeping the notice. `dompurify` is dual-licensed and can be taken under Apache-2.0. |
| `caniuse-lite@1.0.30001806` | **CC-BY-4.0** | `browserslist` (via `@sentry/webpack-plugin` → `webpack`, and Next's own toolchain) | data table consulted at **build time** | Creative Commons attribution on a data file; attribution is carried in the package. Universal in the JS ecosystem; nothing ships to users. |
| `@eloqnt/config@0.0.2`, `@eloqnt/format-json@0.0.3`, `@eloqnt/format-po@0.0.3` | **UNKNOWN** — no `license` field in `package.json`, no LICENSE file in the tarball | `next-intl@4.14.0` (runtime dep) | small message-format helpers next-intl 4.14 started depending on | **A missing licence is legally "all rights reserved" until stated.** Same author group as next-intl (eloqnt.dev). Action for Sapir: one issue on `amannn/next-intl` / `eloqnt` asking them to add the field, or pin next-intl to the last release before the dep appeared if the lawyer wants it clean. Tracked here, not fixed. |

Nothing in prod carries GPL, AGPL, SSPL, BUSL, Commons Clause or a "non-commercial" clause. `web-vitals-soft-navs@6.0.0` is in the `npm ls` prod tree but its `package.json` was not found on disk (an optional dependency skipped at install) — unresolved, not unknown.

## 2 · Flagged — dev-only (not shipped; listed for completeness)

| package | licence | note |
|---|---|---|
| `eslint-plugin-sonarjs@4.2.0` | LGPL-3.0-only | lint plugin, never shipped |
| `axe-core@4.13.0`, `@axe-core/playwright` | MPL-2.0 | a11y test runner |
| `lightningcss*@1.32.0` | MPL-2.0 | build tool |
| `@google/design.md@0.4.0` | UNKNOWN | dev tool, no licence field |
| Python: `hypothesis`, `hypothesis-jsonschema`, `pathspec`, `pytest-rerunfailures` | MPL-2.0 | test tooling |

## 3 · Licence tally — shipped npm tree (282 nodes)

| licence | nodes |
|---|---|
| `MIT` | 206 |
| `Apache-2.0` | 29 |
| `ISC` | 10 |
| `BSD-2-Clause` | 9 |
| `BSD-3-Clause` | 6 |
| `BlueOak-1.0.0` | 5 |
| `UNKNOWN` | 3 |
| `LGPL-3.0-or-later` | 2 |
| `Hippocratic-2.1` | 2 |
| `FSL-1.1-MIT` | 2 |
| `Apache-2.0 AND LGPL-3.0-or-later AND MIT` | 1 |
| `Apache-2.0 AND MIT` | 1 |
| `CC-BY-4.0` | 1 |
| `(MPL-2.0 OR Apache-2.0)` | 1 |
| `(Apache-2.0 AND MIT)` | 1 |
| `0BSD` | 1 |
| `(MIT OR CC0-1.0)` | 1 |

## 4 · Licence tally — shipped Python packages (78 of 137 in the venv)

| licence (as declared in metadata) | packages |
|---|---|
| `MIT` | 19 |
| `MIT License` | 17 |
| `BSD-3-Clause` | 9 |
| `Apache Software License` | 7 |
| `BSD License` | 4 |
| `Apache-2.0` | 3 |
| `MPL-2.0` | 2 |
| `BSD-2-Clause` | 2 |
| `Apache Software License; MIT License` | 2 |
| `Python Software Foundation License` | 1 |
| `Apache-2.0 AND MIT` | 1 |
| `Mozilla Public License 2.0 (MPL 2.0)` | 1 |
| `Apache-2.0 OR BSD-3-Clause` | 1 |
| `ISC License (ISCL)` | 1 |
| `The Unlicense (Unlicense)` | 1 |
| `MIT AND PSF-2.0` | 1 |
| `Apache License 2.0` | 1 |
| `Apache-2.0 OR BSD-2-Clause` | 1 |
| `BSD` | 1 |
| `GNU Library or Lesser General Public License (LGPL)` | 1 |
| `MIT OR Apache-2.0` | 1 |
| `PSF-2.0` | 1 |

Two names in `uv export --no-dev` are platform-conditional and absent from this linux venv: `colorama` (BSD-3) and `tzdata` (Apache-2.0).

## 5 · What this does NOT establish

- It reads the **declared** licence field, not the licence *text*; a package that mislabels itself is invisible here.
- It is the tree as of the lockfiles at `920fd048`; every dependabot merge moves it. Re-run the commands above rather than quoting this file after that.
- It does not decide anything. The 03/09 ruling (MEH-1980 card): the licence rider is CC *inventory* work; only a *finding* routes to legal. §1 is the finding list.

## Appendix A — every shipped npm node

| name@version | licence |
|---|---|

| `@apm-js-collab/code-transformer-bundler-plugins@0.7.4` | MIT |
| `@apm-js-collab/code-transformer@0.18.1` | Apache-2.0 |
| `@apm-js-collab/tracing-hooks@0.13.0` | Apache-2.0 |
| `@babel/code-frame@7.29.7` | MIT |
| `@babel/compat-data@7.29.7` | MIT |
| `@babel/core@7.29.7` | MIT |
| `@babel/generator@7.29.8` | MIT |
| `@babel/helper-compilation-targets@7.29.7` | MIT |
| `@babel/helper-globals@7.29.7` | MIT |
| `@babel/helper-module-imports@7.29.7` | MIT |
| `@babel/helper-module-transforms@7.29.7` | MIT |
| `@babel/helper-string-parser@7.29.7` | MIT |
| `@babel/helper-validator-identifier@7.29.7` | MIT |
| `@babel/helper-validator-option@7.29.7` | MIT |
| `@babel/helpers@7.29.7` | MIT |
| `@babel/parser@7.29.8` | MIT |
| `@babel/template@7.29.7` | MIT |
| `@babel/traverse@7.29.8` | MIT |
| `@babel/types@7.29.8` | MIT |
| `@eloqnt/config@0.0.2` | UNKNOWN |
| `@eloqnt/format-json@0.0.3` | UNKNOWN |
| `@eloqnt/format-po@0.0.3` | UNKNOWN |
| `@emnapi/core@1.9.2` | MIT |
| `@emnapi/runtime@1.11.3` | MIT |
| `@emnapi/runtime@1.9.2` | MIT |
| `@emnapi/wasi-threads@1.2.1` | MIT |
| `@formatjs/fast-memoize@3.1.4` | MIT |
| `@formatjs/fast-memoize@3.1.7` | MIT |
| `@formatjs/icu-messageformat-parser@3.5.17` | MIT |
| `@formatjs/icu-skeleton-parser@2.1.11` | MIT |
| `@formatjs/intl-localematcher@0.8.6` | MIT |
| `@img/colour@1.1.0` | MIT |
| `@img/sharp-libvips-linux-x64@1.3.2` | LGPL-3.0-or-later |
| `@img/sharp-libvips-linuxmusl-x64@1.3.2` | LGPL-3.0-or-later |
| `@img/sharp-linux-x64@0.35.3` | Apache-2.0 |
| `@img/sharp-linuxmusl-x64@0.35.3` | Apache-2.0 |
| `@img/sharp-wasm32@0.35.3` | Apache-2.0 AND LGPL-3.0-or-later AND MIT |
| `@jridgewell/gen-mapping@0.3.13` | MIT |
| `@jridgewell/remapping@2.3.5` | MIT |
| `@jridgewell/resolve-uri@3.1.2` | MIT |
| `@jridgewell/source-map@0.3.11` | MIT |
| `@jridgewell/sourcemap-codec@1.5.5` | MIT |
| `@jridgewell/trace-mapping@0.3.31` | MIT |
| `@next/env@16.3.3` | MIT |
| `@next/swc-linux-x64-gnu@16.3.3` | MIT |
| `@opentelemetry/api-logs@0.220.0` | Apache-2.0 |
| `@opentelemetry/api@1.9.1` | Apache-2.0 |
| `@opentelemetry/core@2.10.0` | Apache-2.0 |
| `@opentelemetry/instrumentation@0.220.0` | Apache-2.0 |
| `@opentelemetry/resources@2.10.0` | Apache-2.0 |
| `@opentelemetry/sdk-trace-base@2.10.0` | Apache-2.0 |
| `@opentelemetry/sdk-trace@2.10.0` | Apache-2.0 |
| `@opentelemetry/semantic-conventions@1.43.0` | Apache-2.0 |
| `@parcel/watcher-linux-x64-glibc@2.5.6` | MIT |
| `@parcel/watcher-linux-x64-musl@2.5.6` | MIT |
| `@parcel/watcher@2.5.6` | MIT |
| `@phosphor-icons/react@2.1.10` | MIT |
| `@playwright/test@1.62.1` | Apache-2.0 |
| `@posthog/browser-common@0.6.1` | MIT |
| `@posthog/core@1.49.1` | MIT |
| `@posthog/types@1.407.0` | MIT |
| `@react-leaflet/core@2.1.0` | Hippocratic-2.1 |
| `@rollup/plugin-commonjs@28.0.1` | MIT |
| `@rollup/pluginutils@5.3.0` | MIT |
| `@rollup/rollup-linux-x64-gnu@4.62.2` | MIT |
| `@rollup/rollup-linux-x64-musl@4.62.2` | MIT |
| `@schummar/icu-type-parser@1.21.5` | MIT |
| `@sentry/babel-plugin-component-annotate@5.3.0` | MIT |
| `@sentry/browser-utils@10.71.0` | MIT |
| `@sentry/browser@10.71.0` | MIT |
| `@sentry/bundler-plugin-core@5.3.0` | MIT |
| `@sentry/cli-linux-x64@2.58.6` | FSL-1.1-MIT |
| `@sentry/cli@2.58.6` | FSL-1.1-MIT |
| `@sentry/conventions@0.16.0` | MIT |
| `@sentry/core@10.71.0` | MIT |
| `@sentry/feedback@10.71.0` | MIT |
| `@sentry/nextjs@10.71.0` | MIT |
| `@sentry/node-core@10.71.0` | MIT |
| `@sentry/node@10.71.0` | MIT |
| `@sentry/opentelemetry@10.71.0` | MIT |
| `@sentry/react@10.71.0` | MIT |
| `@sentry/replay-canvas@10.71.0` | MIT |
| `@sentry/replay@10.71.0` | MIT |
| `@sentry/server-utils@10.71.0` | MIT |
| `@sentry/vercel-edge@10.71.0` | MIT |
| `@sentry/webpack-plugin@5.3.0` | MIT |
| `@swc/core-linux-x64-gnu@1.16.1` | Apache-2.0 AND MIT |
| `@swc/core@1.16.1` | Apache-2.0 |
| `@swc/counter@0.1.3` | Apache-2.0 |
| `@swc/helpers@0.5.23` | Apache-2.0 |
| `@swc/types@0.1.28` | Apache-2.0 |
| `@t3-oss/env-core@0.13.11` | MIT |
| `@t3-oss/env-nextjs@0.13.11` | MIT |
| `@tybys/wasm-util@0.10.3` | MIT |
| `@types/estree@1.0.9` | MIT |
| `@types/json-schema@7.0.15` | MIT |
| `@types/node@26.4.0` | MIT |
| `@types/react@19.2.14` | MIT |
| `@types/trusted-types@2.0.7` | MIT |
| `@vercel/speed-insights@1.3.1` | Apache-2.0 |
| `@webassemblyjs/ast@1.14.1` | MIT |
| `@webassemblyjs/floating-point-hex-parser@1.13.2` | MIT |
| `@webassemblyjs/helper-api-error@1.13.2` | MIT |
| `@webassemblyjs/helper-buffer@1.14.1` | MIT |
| `@webassemblyjs/helper-numbers@1.13.2` | MIT |
| `@webassemblyjs/helper-wasm-bytecode@1.13.2` | MIT |
| `@webassemblyjs/helper-wasm-section@1.14.1` | MIT |
| `@webassemblyjs/ieee754@1.13.2` | MIT |
| `@webassemblyjs/leb128@1.13.2` | Apache-2.0 |
| `@webassemblyjs/utf8@1.13.2` | MIT |
| `@webassemblyjs/wasm-edit@1.14.1` | MIT |
| `@webassemblyjs/wasm-gen@1.14.1` | MIT |
| `@webassemblyjs/wasm-opt@1.14.1` | MIT |
| `@webassemblyjs/wasm-parser@1.14.1` | MIT |
| `@webassemblyjs/wast-printer@1.14.1` | MIT |
| `@xtuc/ieee754@1.2.0` | BSD-3-Clause |
| `@xtuc/long@4.2.2` | Apache-2.0 |
| `acorn-import-phases@1.0.4` | MIT |
| `acorn@8.16.0` | MIT |
| `agent-base@6.0.2` | MIT |
| `ajv-formats@2.1.1` | MIT |
| `ajv-keywords@5.1.0` | MIT |
| `ajv@8.20.0` | MIT |
| `astring@1.9.0` | MIT |
| `asynckit@0.4.0` | MIT |
| `axios@1.20.0` | MIT |
| `balanced-match@4.0.4` | MIT |
| `baseline-browser-mapping@2.10.42` | Apache-2.0 |
| `brace-expansion@5.0.9` | MIT |
| `browserslist@4.28.6` | MIT |
| `buffer-from@1.1.2` | MIT |
| `call-bind-apply-helpers@1.0.2` | MIT |
| `caniuse-lite@1.0.30001806` | CC-BY-4.0 |
| `chrome-trace-event@1.0.4` | MIT |
| `cjs-module-lexer@2.2.1` | MIT |
| `client-only@0.0.1` | MIT |
| `combined-stream@1.0.8` | MIT |
| `commander@2.20.3` | MIT |
| `commondir@1.0.1` | MIT |
| `convert-source-map@2.0.0` | MIT |
| `core-js@3.49.0` | MIT |
| `csstype@3.2.3` | MIT |
| `debug@4.4.3` | MIT |
| `delayed-stream@1.0.0` | MIT |
| `detect-libc@2.1.2` | Apache-2.0 |
| `dompurify@3.4.13` | (MPL-2.0 OR Apache-2.0) |
| `dotenv@16.6.1` | BSD-2-Clause |
| `dunder-proto@1.0.1` | MIT |
| `electron-to-chromium@1.5.389` | ISC |
| `enhanced-resolve@5.24.1` | MIT |
| `es-define-property@1.0.1` | MIT |
| `es-errors@1.3.0` | MIT |
| `es-module-lexer@2.3.0` | MIT |
| `es-object-atoms@1.1.1` | MIT |
| `es-set-tostringtag@2.1.0` | MIT |
| `escalade@3.2.0` | MIT |
| `eslint-scope@5.1.1` | BSD-2-Clause |
| `esquery@1.7.0` | BSD-3-Clause |
| `esrecurse@4.3.0` | BSD-2-Clause |
| `estraverse@4.3.0` | BSD-2-Clause |
| `estraverse@5.3.0` | BSD-2-Clause |
| `estree-walker@2.0.2` | MIT |
| `events@3.3.0` | MIT |
| `fast-deep-equal@3.1.3` | MIT |
| `fast-uri@3.1.5` | BSD-3-Clause |
| `fdir@6.5.0` | MIT |
| `fflate@0.4.8` | MIT |
| `find-up@5.0.0` | MIT |
| `follow-redirects@1.16.0` | MIT |
| `form-data@4.0.6` | MIT |
| `framer-motion@13.1.1` | MIT |
| `function-bind@1.1.2` | MIT |
| `gensync@1.0.0-beta.2` | MIT |
| `get-intrinsic@1.3.0` | MIT |
| `get-proto@1.0.1` | MIT |
| `glob@13.0.6` | BlueOak-1.0.0 |
| `gopd@1.2.0` | MIT |
| `graceful-fs@4.2.11` | ISC |
| `has-flag@4.0.0` | MIT |
| `has-symbols@1.1.0` | MIT |
| `has-tostringtag@1.0.2` | MIT |
| `hasown@2.0.4` | MIT |
| `https-proxy-agent@5.0.1` | MIT |
| `icu-minify@4.14.0` | MIT |
| `import-in-the-middle@3.3.3` | Apache-2.0 |
| `intl-messageformat@11.2.14` | BSD-3-Clause |
| `is-extglob@2.1.1` | MIT |
| `is-glob@4.0.3` | MIT |
| `is-reference@1.2.1` | MIT |
| `isexe@2.0.0` | ISC |
| `jest-worker@27.5.1` | MIT |
| `js-tokens@4.0.0` | MIT |
| `jsesc@3.1.0` | MIT |
| `json-schema-traverse@1.0.0` | MIT |
| `json5@2.2.3` | MIT |
| `leaflet-defaulticon-compatibility@0.1.2` | BSD-2-Clause |
| `leaflet.markercluster@1.5.3` | MIT |
| `leaflet@1.9.4` | BSD-2-Clause |
| `lenis@1.3.26` | MIT |
| `loader-runner@4.3.2` | MIT |
| `locate-path@6.0.0` | MIT |
| `loose-envify@1.4.0` | MIT |
| `lru-cache@11.5.1` | BlueOak-1.0.0 |
| `lru-cache@5.1.1` | ISC |
| `magic-string@0.30.21` | MIT |
| `math-intrinsics@1.1.0` | MIT |
| `merge-stream@2.0.0` | MIT |
| `meriyah@6.1.4` | ISC |
| `mime-db@1.52.0` | MIT |
| `mime-db@1.54.0` | MIT |
| `mime-types@2.1.35` | MIT |
| `minimatch@10.2.5` | BlueOak-1.0.0 |
| `minimizer-webpack-plugin@5.6.1` | MIT |
| `minipass@7.1.3` | BlueOak-1.0.0 |
| `module-details-from-path@1.0.4` | MIT |
| `motion-dom@13.1.1` | MIT |
| `motion-utils@13.0.0` | MIT |
| `ms@2.1.3` | MIT |
| `nanoid@3.3.18` | MIT |
| `negotiator@1.0.0` | MIT |
| `neo-async@2.6.2` | MIT |
| `next-intl-swc-plugin-extractor@4.14.0` | MIT |
| `next-intl@4.14.0` | MIT |
| `next@16.3.3` | MIT |
| `node-addon-api@7.1.1` | MIT |
| `node-fetch@2.7.0` | MIT |
| `node-releases@2.0.51` | MIT |
| `p-limit@3.1.0` | MIT |
| `p-locate@5.0.0` | MIT |
| `path-exists@4.0.0` | MIT |
| `path-scurry@2.0.2` | BlueOak-1.0.0 |
| `picocolors@1.1.1` | ISC |
| `picomatch@4.0.4` | MIT |
| `playwright-core@1.62.1` | Apache-2.0 |
| `playwright@1.62.1` | Apache-2.0 |
| `po-parser@2.2.0` | MIT |
| `postcss@8.5.23` | MIT |
| `posthog-js@1.422.1` | (Apache-2.0 AND MIT) |
| `preact@10.29.7` | MIT |
| `progress@2.0.3` | MIT |
| `proxy-from-env@1.1.0` | MIT |
| `proxy-from-env@2.1.0` | MIT |
| `query-selector-shadow-dom@1.0.1` | MIT |
| `react-dom@18.3.1` | MIT |
| `react-leaflet@4.2.1` | Hippocratic-2.1 |
| `react@18.3.1` | MIT |
| `require-from-string@2.0.2` | MIT |
| `require-in-the-middle@8.0.1` | MIT |
| `rollup@4.62.2` | MIT |
| `scheduler@0.23.2` | MIT |
| `schema-utils@4.3.3` | MIT |
| `semifies@1.0.0` | Apache-2.0 |
| `semver@6.3.1` | ISC |
| `semver@7.8.5` | ISC |
| `server-only@0.0.1` | MIT |
| `sharp@0.35.3` | Apache-2.0 |
| `source-map-js@1.2.1` | BSD-3-Clause |
| `source-map-support@0.5.21` | MIT |
| `source-map@0.6.1` | BSD-3-Clause |
| `stacktrace-parser@0.1.11` | MIT |
| `styled-jsx@5.1.6` | MIT |
| `supports-color@8.1.1` | MIT |
| `tapable@2.3.3` | MIT |
| `terser@5.46.1` | BSD-2-Clause |
| `tr46@0.0.3` | MIT |
| `tslib@2.8.1` | 0BSD |
| `type-fest@0.7.1` | (MIT OR CC0-1.0) |
| `typescript@6.0.3` | Apache-2.0 |
| `undici-types@8.3.0` | MIT |
| `update-browserslist-db@1.2.3` | MIT |
| `use-intl@4.14.0` | MIT |
| `watchpack@2.5.2` | MIT |
| `web-vitals@5.3.0` | Apache-2.0 |
| `webidl-conversions@3.0.1` | BSD-2-Clause |
| `webpack-sources@3.5.0` | MIT |
| `webpack@5.108.3` | MIT |
| `whatwg-url@5.0.0` | MIT |
| `which@2.0.2` | ISC |
| `yallist@3.1.1` | ISC |
| `yocto-queue@0.1.0` | MIT |
| `zod@4.4.3` | MIT |

## Appendix B — every shipped Python package

| name | version | licence |
|---|---|---|
| `aiohappyeyeballs` | 2.6.1 | Python Software Foundation License |
| `aiohttp` | 3.14.3 | Apache-2.0 AND MIT |
| `aiosignal` | 1.4.0 | Apache Software License |
| `alembic` | 1.19.1 | MIT |
| `annotated-doc` | 0.0.4 | MIT |
| `annotated-types` | 0.7.0 | MIT License |
| `anthropic` | 0.107.1 | MIT License |
| `anyio` | 4.13.0 | MIT |
| `APScheduler` | 3.11.2 | MIT License |
| `asgi-correlation-id` | 5.0.1 | MIT |
| `attrs` | 26.1.0 | MIT |
| `bcrypt` | 4.3.0 | Apache Software License |
| `bleach` | 6.4.0 | Apache Software License |
| `certifi` | 2026.4.22 | Mozilla Public License 2.0 (MPL 2.0) |
| `cffi` | 2.0.0 | MIT |
| `charset-normalizer` | 3.4.7 | MIT |
| `click` | 8.3.3 | BSD-3-Clause |
| `cloudinary` | 1.46.2 | MIT License |
| `cryptography` | 50.0.0 | Apache-2.0 OR BSD-3-Clause |
| `Deprecated` | 1.3.1 | MIT License |
| `distro` | 1.9.0 | Apache Software License |
| `dnspython` | 2.8.0 | ISC License (ISCL) |
| `docstring_parser` | 0.18.0 | MIT License |
| `email-validator` | 2.3.0 | The Unlicense (Unlicense) |
| `et_xmlfile` | 2.0.0 | MIT License |
| `fastapi` | 0.141.1 | MIT |
| `frozenlist` | 1.8.0 | Apache-2.0 |
| `google-auth` | 2.57.0 | Apache Software License |
| `greenlet` | 3.4.0 | MIT AND PSF-2.0 |
| `h11` | 0.16.0 | MIT License |
| `http_ece` | 1.2.1 | MIT License |
| `httpcore` | 1.0.9 | BSD-3-Clause |
| `httptools` | 0.8.0 | MIT |
| `httpx` | 0.28.1 | BSD License |
| `idna` | 3.18 | BSD-3-Clause |
| `jiter` | 0.14.0 | MIT |
| `joserfc` | 1.7.4 | BSD License |
| `limits` | 5.8.0 | MIT |
| `Mako` | 1.3.12 | MIT License |
| `MarkupSafe` | 3.0.3 | BSD-3-Clause |
| `multidict` | 6.7.1 | Apache License 2.0 |
| `openpyxl` | 3.1.5 | MIT License |
| `packaging` | 26.1 | Apache-2.0 OR BSD-2-Clause |
| `passlib` | 1.7.4 | BSD |
| `propcache` | 0.4.1 | Apache Software License |
| `psycopg2-binary` | 2.9.12 | GNU Library or Lesser General Public License (LGPL) |
| `py-vapid` | 1.9.4 | MPL-2.0 |
| `pyasn1` | 0.6.4 | BSD-2-Clause |
| `pyasn1_modules` | 0.4.2 | BSD License |
| `pycparser` | 3.0 | BSD-3-Clause |
| `pydantic` | 2.13.4 | MIT |
| `pydantic-settings` | 2.15.0 | MIT |
| `pydantic_core` | 2.46.4 | MIT |
| `PyJWT` | 2.13.0 | MIT |
| `python-dotenv` | 1.2.2 | BSD-3-Clause |
| `python-multipart` | 0.0.32 | Apache-2.0 |
| `pywebpush` | 2.4.0 | MPL-2.0 |
| `PyYAML` | 6.0.3 | MIT License |
| `requests` | 2.34.2 | Apache Software License |
| `resend` | 2.42.0 | MIT License |
| `sentry-sdk` | 2.68.1 | MIT |
| `six` | 1.17.0 | MIT License |
| `slowapi` | 0.1.10 | MIT License |
| `sniffio` | 1.3.1 | Apache Software License; MIT License |
| `SQLAlchemy` | 2.0.52 | MIT |
| `starlette` | 1.3.1 | BSD-3-Clause |
| `structlog` | 24.4.0 | MIT OR Apache-2.0 |
| `typing-inspection` | 0.4.2 | MIT |
| `typing_extensions` | 4.15.0 | PSF-2.0 |
| `tzlocal` | 5.3.1 | MIT License |
| `urllib3` | 2.7.0 | MIT |
| `uvicorn` | 0.52.4 | BSD-3-Clause |
| `uvloop` | 0.22.1 | Apache Software License; MIT License |
| `watchfiles` | 1.1.1 | MIT License |
| `webencodings` | 0.5.1 | BSD License |
| `websockets` | 16.0 | BSD-3-Clause |
| `wrapt` | 2.1.2 | BSD-2-Clause |
| `yarl` | 1.23.0 | Apache-2.0 |
