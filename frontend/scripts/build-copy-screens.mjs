// @ts-check
/**
 * Module:   build-copy-screens
 * Purpose:  MEH-3672. Build the index behind /admin/copy: for each top-level
 *           group of frontend/messages/he.json, the screens (routes) whose
 *           page tree reads it. Read from the code, never typed by hand.
 * How:      Every page.* under app/[locale] plus the layout / template /
 *           loading / error / not-found files above it is a root. From each
 *           root the import graph is walked (only `@/…` and relative
 *           imports, inside frontend/). In every file reached, a group is
 *           counted when it is
 *             - the namespace of useTranslations("x.y") / getTranslations("x")
 *               / getTranslations({ namespace: "x" }) (its first segment), or
 *             - the first segment of a t("x.y") literal in a file that calls
 *               useTranslations() / getTranslations() with no namespace.
 * Does NOT: follow an import() whose path is built at run time, a key built
 *           at run time, or a group
 *           read only from a component that no page imports (those groups
 *           show «לא נמצא מסך»). It is an index for finding copy, not a proof
 *           of where a string renders.
 * Usage:    node scripts/build-copy-screens.mjs           # write the file
 *           node scripts/build-copy-screens.mjs --check   # exit 1 if stale
 * Output:   lib/copy-screens.json — NOT committed (gitignored, MEH-3693).
 *           package.json runs this on postinstall, predev and prebuild, so
 *           every install, dev server and build (Vercel and every CI job,
 *           which all start with `npm ci`) writes a fresh copy. A committed
 *           copy went stale on staging whenever two PRs that each changed
 *           which groups a page reads merged one after the other.
 * History:  MEH-3672 (creation, item 6 of MEH-3652). MEH-3693 (built at
 *           install/build time, no longer committed).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const APP = path.join(FRONTEND, "app", "[locale]");
export const OUT = path.join(FRONTEND, "lib", "copy-screens.json");
const EXT = [".js", ".jsx", ".ts", ".tsx", ".mjs"];
const ROOT_FILES =
  /^(page|layout|template|loading|error|not-found)\.(js|jsx|ts|tsx)$/;

// The third form is a dynamic import(), which is how next/dynamic loads a
// component (MiniMap and ten others), so its groups count for the page.
const IMPORT_RE =
  /(?:import\s[^'"`;]*?from\s*|import\s*|import\(\s*|export\s[^'"`;]*?from\s*)["']([^"']+)["']/g;
const NS_CALL_RE =
  /\b(?:useTranslations|getTranslations)\(\s*["'`]([A-Za-z0-9_.]+)["'`]/g;
const NS_OPT_RE =
  /\bgetTranslations\(\s*\{[^}]*?\bnamespace:\s*["'`]([A-Za-z0-9_.]+)["'`]/g;
const ROOT_CALL_RE =
  /\b(?:useTranslations\(\s*\)|getTranslations\(\s*\)|getTranslations\(\s*\{(?:(?!namespace)[^}])*\}\s*\))/;
const T_LIT_RE = /\bt\w*\(\s*["'`]([A-Za-z0-9_]+)\./g;

/** @param {string} dir @param {(f: string) => boolean} keep @returns {string[]} */
function walk(dir, keep) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== "__tests__")
        out.push(...walk(p, keep));
    } else if (keep(e.name)) out.push(p);
  }
  return out;
}

/** @param {string} from @param {string} spec @returns {string | null} */
function resolveImport(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = path.join(FRONTEND, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  const tries = [
    base,
    ...EXT.map((e) => base + e),
    ...EXT.map((e) => path.join(base, "index" + e)),
  ];
  for (const t of tries) {
    if (
      fs.existsSync(t) &&
      fs.statSync(t).isFile() &&
      EXT.includes(path.extname(t))
    )
      return t;
  }
  return null;
}

/**
 * @param {string} text
 * @param {Set<string>} groups top-level keys of he.json
 * @returns {Set<string>}
 */
export function groupsInSource(text, groups) {
  const found = new Set();
  for (const re of [NS_CALL_RE, NS_OPT_RE]) {
    for (const m of text.matchAll(re)) {
      const g = m[1].split(".")[0];
      if (groups.has(g)) found.add(g);
    }
  }
  if (ROOT_CALL_RE.test(text)) {
    for (const m of text.matchAll(T_LIT_RE))
      if (groups.has(m[1])) found.add(m[1]);
  }
  return found;
}

/** app/[locale]/producer/[id]/page.js → /producer/[id]; route groups dropped. */
export function routeOf(pageFile) {
  const rel = path
    .relative(APP, path.dirname(pageFile))
    .split(path.sep)
    .filter((s) => s && !/^\(.*\)$/.test(s));
  return "/" + rel.join("/");
}

export function build() {
  const he = JSON.parse(
    fs.readFileSync(path.join(FRONTEND, "messages", "he.json"), "utf8"),
  );
  const groups = new Set(Object.keys(he));
  /** @type {Map<string, {imports: string[], groups: Set<string>}>} */
  const cache = new Map();
  const info = (/** @type {string} */ f) => {
    let v = cache.get(f);
    if (!v) {
      const text = fs.readFileSync(f, "utf8");
      const imports = [];
      for (const m of text.matchAll(IMPORT_RE)) {
        const r = resolveImport(f, m[1]);
        if (r) imports.push(r);
      }
      v = { imports, groups: groupsInSource(text, groups) };
      cache.set(f, v);
    }
    return v;
  };
  const closure = (/** @type {string[]} */ roots) => {
    const seen = new Set();
    const stack = [...roots];
    const out = new Set();
    while (stack.length) {
      const f = /** @type {string} */ (stack.pop());
      if (seen.has(f)) continue;
      seen.add(f);
      const v = info(f);
      v.groups.forEach((g) => out.add(g));
      stack.push(...v.imports);
    }
    return out;
  };

  const pages = walk(APP, (n) => /^page\.(js|jsx|ts|tsx)$/.test(n)).sort();
  /** @type {Record<string, string[]>} */
  const byGroup = Object.fromEntries([...groups].sort().map((g) => [g, []]));
  const screens = [];
  for (const page of pages) {
    const route = routeOf(page);
    screens.push(route);
    const roots = [page];
    for (let d = path.dirname(page); d.startsWith(APP); d = path.dirname(d)) {
      for (const n of fs.readdirSync(d)) {
        if (ROOT_FILES.test(n) && !n.startsWith("page."))
          roots.push(path.join(d, n));
      }
      if (d === APP) break;
    }
    for (const g of closure(roots)) byGroup[g].push(route);
  }
  for (const g of Object.keys(byGroup))
    byGroup[g] = [...new Set(byGroup[g])].sort();
  return {
    _comment:
      "Generated by frontend/scripts/build-copy-screens.mjs (MEH-3672). Do not edit by hand.",
    screens: [...new Set(screens)].sort(),
    groups: byGroup,
  };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const text = JSON.stringify(build(), null, 2) + "\n";
  if (process.argv.includes("--check")) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
    if (cur !== text) {
      console.error(
        "copy-screens.json is stale: run `node scripts/build-copy-screens.mjs`",
      );
      process.exit(1);
    }
    console.log("copy-screens.json is up to date");
  } else {
    fs.writeFileSync(OUT, text);
    const idx = JSON.parse(text);
    const empty = Object.values(idx.groups).filter(
      (r) => r.length === 0,
    ).length;
    console.log(
      `copy-screens: ${idx.screens.length} screens, ${Object.keys(idx.groups).length} groups, ${empty} with no screen`,
    );
  }
}
