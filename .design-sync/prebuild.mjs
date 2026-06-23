// Pre-bundles the Mehamakor frontend components into a clean browser ESM dist
// so the design-sync converter can wrap it (its "dist exists" happy path)
// without fighting Next.js source quirks: JSX-in-.js helpers, node-builtin-
// pulling Next internals (gzip-size → fs/stream/zlib), server-only, etc.
//
// react/react-dom stay EXTERNAL — the converter maps them to window.React.
// Everything else (next-intl, framer-motion, phosphor, the components) is
// inlined. Node built-ins and server-only modules are stubbed to empty so the
// bundle resolves; components that actually need them render as floor cards.
//
// Run from repo root:  node .design-sync/prebuild.mjs
import { build } from "../.ds-sync/node_modules/esbuild/lib/main.js";
import { resolve } from "node:path";

const FE = resolve("frontend");

// Browser-stub these so esbuild doesn't choke on Node-only requires that ride
// in via Next's compiled internals. Empty modules — never executed at render.
const STUB = new Set([
  "fs", "fs/promises", "stream", "zlib", "path", "crypto", "os", "util",
  "events", "http", "https", "http2", "net", "tls", "dns", "child_process",
  "worker_threads", "perf_hooks", "async_hooks", "buffer", "querystring",
  "url", "module", "vm", "v8", "inspector", "readline", "tty", "constants",
  "server-only", "next/headers",
]);
const stubPlugin = {
  name: "stub-node-builtins",
  setup(b) {
    const filter = new RegExp(
      "^(" + [...STUB].map((s) => s.replace(/[/]/g, "\\/")).join("|") + ")(\\/|$)"
    );
    b.onResolve({ filter }, (a) => ({ path: a.path, namespace: "stub" }));
    // also catch node: prefix
    b.onResolve({ filter: /^node:/ }, (a) => ({ path: a.path, namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: "module.exports = {};",
      loader: "js",
    }));
  },
};

// Resolve react/react-dom (and jsx-runtime, react-is, scheduler) to window.React
// HERE, in the prebuild — NOT via esbuild `external`. Externalizing them turns
// CJS deps' require("react/jsx-runtime") into an unsupported dynamic require in
// ESM output. This mirrors the converter's own reactShim so the re-bundle finds
// no react imports left to resolve. Single react instance = window.React.
const reactGlobal = {
  name: "react-global",
  setup(b) {
    b.onResolve({ filter: /^react(\/(jsx-(dev-)?runtime|compiler-runtime))?$/ }, () => ({ path: "react-shim", namespace: "rg" }));
    b.onResolve({ filter: /^react-dom(\/client)?$/ }, () => ({ path: "react-dom-shim", namespace: "rg" }));
    b.onResolve({ filter: /^react-is$/ }, () => ({ path: "react-is-shim", namespace: "rg" }));
    b.onResolve({ filter: /^scheduler(\/|$)/ }, () => ({ path: "scheduler-shim", namespace: "rg" }));
    b.onLoad({ filter: /^react-shim$/, namespace: "rg" }, () => ({
      contents: `var R=window.React;
function jsx(t,p,k){return R.createElement(t,k===void 0?p:Object.assign({key:k},p));}
module.exports=R;
module.exports.jsx=jsx;module.exports.jsxs=jsx;module.exports.jsxDEV=jsx;
module.exports.Fragment=R.Fragment;`,
      loader: "js",
    }));
    b.onLoad({ filter: /^react-dom-shim$/, namespace: "rg" }, () => ({
      contents: "var D=window.ReactDOM,n=function(){};" +
        "module.exports=Object.assign({preload:n,preinit:n,preconnect:n,prefetchDNS:n,preloadModule:n,preinitModule:n},D);",
      loader: "js",
    }));
    b.onLoad({ filter: /^react-is-shim$/, namespace: "rg" }, () => ({
      contents: `var R=window.React;
var FWD=Symbol.for("react.forward_ref"),MEMO=Symbol.for("react.memo"),PORTAL=Symbol.for("react.portal"),LAZY=Symbol.for("react.lazy");
function tt(o){return o!=null&&typeof o==="object"?(R.isValidElement(o)?(o.type&&o.type.$$typeof)||o.type:o.$$typeof):undefined}
exports.typeOf=tt;exports.isElement=R.isValidElement;
exports.isValidElementType=function(t){return typeof t==="string"||typeof t==="function"||t===R.Fragment||t===R.Suspense||t===R.StrictMode||t===R.Profiler||(t!=null&&typeof t==="object"&&t.$$typeof!=null)};
exports.isFragment=function(o){return R.isValidElement(o)&&o.type===R.Fragment};
exports.ForwardRef=FWD;exports.Memo=MEMO;exports.Portal=PORTAL;exports.Lazy=LAZY;
exports.isForwardRef=function(o){return tt(o)===FWD};exports.isMemo=function(o){return tt(o)===MEMO};
exports.Fragment=R.Fragment;exports.Suspense=R.Suspense;`,
      loader: "js",
    }));
    b.onLoad({ filter: /^scheduler-shim$/, namespace: "rg" }, () => ({
      contents: "module.exports={unstable_scheduleCallback:function(p,c){return setTimeout(c,0)},unstable_cancelCallback:function(){},unstable_now:function(){return 0},unstable_NormalPriority:3};",
      loader: "js",
    }));
  },
};

// lib/env*.js validate process.env with @t3-oss/env-nextjs at IMPORT time and
// throw "Invalid environment variables" when vars are missing. In one IIFE a
// single import-time throw kills window.<GLOBAL> for every component. Replace
// them with a permissive stub — preview/import never needs real env values.
const envStub = {
  name: "env-stub",
  setup(b) {
    // onLoad fires on the RESOLVED absolute path (always ends in .js), so it
    // catches extensionless imports (@/lib/env.client) that onResolve misses.
    b.onLoad({ filter: /[\\/]lib[\\/]env(\.client|\.server)?\.js$/ }, () => ({
      contents:
        'const env=new Proxy({},{get:()=>""});\n' +
        'export {env};\n' +
        'export const SITE_URL="https://mehamakor.online";\n' +
        'export const API_URL="";\n' +
        'export const CONTACT_EMAIL="info@mehamakor.online";\n' +
        'export default env;',
      loader: "js",
    }));
  },
};

try {
  await build({
    stdin: {
      contents:
        "export * from './.ds-barrel.mjs';\n" +
        "export { DSProvider } from './.ds-provider.jsx';\n",
      resolveDir: FE,
      sourcefile: "ds-entry.mjs",
      loader: "js",
    },
    absWorkingDir: FE,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2020",
    outfile: resolve(FE, ".ds-dist/index.mjs"),
    tsconfig: resolve(FE, "tsconfig.json"),
    nodePaths: [resolve(FE, "node_modules")],
    // No react externals — the reactGlobal plugin maps them to window.React.
    loader: {
      ".js": "jsx",
      ".jsx": "jsx",
      ".mjs": "js",
      ".svg": "dataurl",
      ".png": "dataurl",
      ".jpg": "dataurl",
      ".woff": "dataurl",
      ".woff2": "dataurl",
      ".json": "json",
    },
    define: {
      "process.env.NODE_ENV": '"development"',
      "process.env.NEXT_PUBLIC_API_URL": '""',
    },
    // Browser has no `process`; Next/deps read process.env.* and process.browser
    // at module init and at render. Set a shim before any bundled code runs.
    banner: {
      js: 'globalThis.process=globalThis.process||{env:{NODE_ENV:"development"},browser:true,platform:"browser",version:"",versions:{},nextTick:function(f){Promise.resolve().then(f)},cwd:function(){return"/"}};',
    },
    plugins: [reactGlobal, envStub, stubPlugin],
    logLevel: "warning",
    metafile: false,
    write: true,
  });
  console.error("[prebuild] OK → frontend/.ds-dist/index.mjs");
} catch (e) {
  console.error("[prebuild] FAILED");
  process.exit(1);
}
