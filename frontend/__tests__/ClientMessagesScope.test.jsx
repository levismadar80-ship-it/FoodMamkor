/**
 * MEH-2233 — the root client provider ships a trimmed catalog.
 *
 * lib/client-messages.js leaves `admin` / `dashboard` (route-scoped) and a few
 * getTranslations-only namespaces out of every page's payload. A client
 * component that reads one of them where nobody re-provides it renders the raw
 * key, and no other test notices. This walks the source and fails when:
 *   - a client file outside the re-providing routes reads a route-scoped
 *     namespace and is reachable from a file outside those routes;
 *   - any client file reads a server-only namespace;
 *   - the sign-up form reads an admin key beyond the subtree it is given.
 * DISCRIMINATION: add useTranslations("dashboard.producer.draft") to
 * components/Header.jsx, or import DraftSubmitBanner from a public page, or
 * useTranslations("guides") anywhere — each turns this red.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import MergeMessagesProvider from "@/components/i18n/MergeMessagesProvider";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import he from "../messages/he.json";
import en from "../messages/en.json";
import {
  ROUTE_SCOPED_NAMESPACES,
  SERVER_ONLY_NAMESPACES,
  rootClientMessages,
  registerProducerMessages,
} from "@/lib/client-messages";

const ROOT = path.resolve(__dirname, "..");
const REPROVIDED = ["app/[locale]/admin/", "app/[locale]/producer/dashboard/", "app/[locale]/register/producer/"];
const SIGNUP_FORM = "app/[locale]/register/producer/RegisterProducerClient.jsx";

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(js|jsx|ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const files = ["app", "components", "lib", "hooks"].flatMap((d) => walk(path.join(ROOT, d)));
const rel = (f) => path.relative(ROOT, f).split(path.sep).join("/");
const src = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));

/** Top-level namespaces a client file reads: scoped hooks, plus `t("ns.…")` under a root-scoped hook. */
function clientNamespaces(s) {
  if (!s.includes("useTranslations")) return [];
  const found = [...s.matchAll(/useTranslations\(\s*["'`]([a-z_]+)[."'`]/g)].map((m) => m[1]);
  if (/useTranslations\(\s*\)/.test(s)) {
    found.push(...[...s.matchAll(/\bt\(\s*["'`]([a-z_]+)\./g)].map((m) => m[1]));
  }
  return found;
}

function resolveImport(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const cand of [base, ...[".js", ".jsx", ".ts", ".tsx"].map((e) => base + e), path.join(base, "index.js")]) {
    if (src.has(cand)) return cand;
  }
  return null;
}

const importers = new Map();
for (const [f, s] of src) {
  for (const m of s.matchAll(/(?:from\s+|import\(\s*)["']([^"']+)["']/g)) {
    const target = resolveImport(f, m[1]);
    if (target) importers.set(target, [...(importers.get(target) ?? []), f]);
  }
}

const inReprovided = (f) => REPROVIDED.some((p) => rel(f).startsWith(p));

describe("root client messages (MEH-2233)", () => {
  it("every omitted namespace exists in both catalogs (the list is not stale)", () => {
    for (const ns of [...ROUTE_SCOPED_NAMESPACES, ...SERVER_ONLY_NAMESPACES]) {
      expect(he, ns).toHaveProperty(ns);
      expect(en, ns).toHaveProperty(ns);
    }
  });

  it("the root set drops exactly the omitted namespaces and keeps the rest", () => {
    const kept = Object.keys(rootClientMessages(he));
    const omitted = [...ROUTE_SCOPED_NAMESPACES, ...SERVER_ONLY_NAMESPACES];
    expect(kept.filter((ns) => omitted.includes(ns))).toEqual([]);
    expect(kept.length).toBe(Object.keys(he).length - omitted.length);
  });

  it("no client file reads a server-only namespace", () => {
    const offenders = [...src]
      .filter(([, s]) => clientNamespaces(s).some((ns) => SERVER_ONLY_NAMESPACES.includes(ns)))
      .map(([f]) => rel(f));
    expect(offenders).toEqual([]);
  });

  it("route-scoped namespaces are only read where a route re-provides them", () => {
    const readers = [...src]
      .filter(([f, s]) => !inReprovided(f) && clientNamespaces(s).some((ns) => ROUTE_SCOPED_NAMESPACES.includes(ns)))
      .map(([f]) => f);
    // Control: the walk must actually see the shared components that read `dashboard`.
    expect(readers.map(rel)).toContain("components/producer/DraftSubmitBanner.jsx");

    const leaks = [];
    const seen = new Set();
    const visit = (f, chain) => {
      if (seen.has(f)) return;
      seen.add(f);
      for (const imp of importers.get(f) ?? []) {
        if (inReprovided(imp)) continue;
        if (rel(imp).startsWith("app/") && /\/(page|layout)\.(js|jsx)$/.test(rel(imp))) {
          leaks.push([...chain, rel(imp)].join(" ← "));
        } else visit(imp, [...chain, rel(imp)]);
      }
    };
    for (const f of readers) visit(f, [rel(f)]);
    expect(leaks).toEqual([]);
  });

  it("the producer sign-up form reads only the admin subtree it is given", () => {
    const s = src.get(path.join(ROOT, SIGNUP_FORM));
    const keys = [...s.matchAll(/\bt\(\s*["'`](admin\.[a-z_.]+)["'`]/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(k.startsWith("admin.producers.form.fields.")).toBe(true);
    const given = registerProducerMessages(he);
    for (const k of keys) {
      const value = k.split(".").reduce((o, part) => o?.[part], given);
      expect(typeof value, k).toBe("string");
    }
  });

  it("the re-providing routes wrap their shells in the full-catalog provider", () => {
    for (const p of ["app/[locale]/admin/layout.js", "app/[locale]/producer/dashboard/layout.js"]) {
      const s = readFileSync(path.join(ROOT, p), "utf8");
      expect(s, p).toMatch(/<RouteMessagesProvider>/);
      expect(s, p).not.toMatch(/["']use client["']/);
    }
    expect(existsSync(path.join(ROOT, "app/[locale]/register/producer/page.js"))).toBe(true);
    expect(readFileSync(path.join(ROOT, "app/[locale]/register/producer/page.js"), "utf8")).toMatch(
      /<RouteMessagesProvider pick=\{registerProducerMessages\}>/,
    );
  });

  // use-intl's nested provider REPLACES its parent's messages; the route
  // provider must merge, or every root key goes blank inside /admin.
  it("a route's extra namespaces merge over the root set instead of replacing it", () => {
    function Probe() {
      const t = useTranslations();
      return <p>{t("root_ns.hello")} | {t("dashboard.title")}</p>;
    }
    render(
      <NextIntlClientProvider locale="he" messages={{ root_ns: { hello: "שלום" } }} onError={() => {}}>
        <MergeMessagesProvider messages={{ dashboard: { title: "לוח" } }}>
          <Probe />
        </MergeMessagesProvider>
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("שלום | לוח")).toBeTruthy();
  });
});
