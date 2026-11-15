/**
 * MEH-3060 — a back link is <BackLink>, everywhere.
 *
 * Before: hand-rolled back links with four looks (muted, underlined, plain,
 * with or without an arrow), an arrow typed into the copy ("→ חזרה…") that
 * screen readers read aloud and that cannot flip per locale, and one icon
 * (GuideArticle) that pointed FORWARD in Hebrew. components/ui/BackLink owns
 * the arrow, its direction, the focus ring and the colour.
 *
 * Two checks:
 *   1. a <Link>/<a> whose text is t("…back…") is a hand-rolled back link;
 *   2. a back-label message value carries no typed arrow.
 * Blind spot: a back link whose key does not start with "back".
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import traverseMod from "@babel/traverse";

const traverse = traverseMod.default || traverseMod;
const ROOT = path.resolve(__dirname, "..");
const BACK_KEY = /(?:^|\.)back(?:_[a-z_]+)?$/;

// Owned by #4422 (event/experience back row) on 13/11 — lift when it lands.
const EXEMPT_FILES = new Set([
  "app/[locale]/events/[id]/EventDetailClient.jsx",
  "app/[locale]/experiences/[id]/ExperienceDetailClient.jsx",
  "components/HistoryBackLink.jsx",
]);
const EXEMPT_KEYS = new Set([
  "producer.detail.back_label", // HistoryBackLink, #4422
  "events.detail.back_to_all", "events.detail.all_events", // #4422
  "experiences.detail.back_to_all", "experiences.detail.all_experiences", // #4422
  "group_buys.detail.back_to_list_arrow", // unused key, no caller
]);

export function handRolledBackLinks(src) {
  const ast = parse(src, { sourceType: "module", plugins: ["jsx"] });
  const hits = [];
  traverse(ast, {
    JSXElement(p) {
      const name = p.node.openingElement.name.name;
      if (name !== "Link" && name !== "a") return;
      // A link dressed as a button (green fill or outline) is an ACTION that
      // happens to go home — ActionShapeGuard owns its shape, not this guard.
      const cls = p.node.openingElement.attributes.find((a) => a.name?.name === "className")?.value?.value ?? "";
      if (/(?:^|\s)(?:bg|border)-primary(?:-dark)?(?:\s|$)/.test(cls)) return;
      p.traverse({
        CallExpression(c) {
          const callee = c.node.callee;
          const arg = c.node.arguments[0];
          if (callee.type === "Identifier" && /^t/.test(callee.name) && arg?.type === "StringLiteral" && BACK_KEY.test(arg.value)) {
            hits.push(`${name}(${arg.value})@${p.node.loc.start.line}`);
          }
        },
      });
    },
  });
  return hits;
}

function arrowedBackLabels(messages, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(messages)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") out.push(...arrowedBackLabels(v, key));
    else if (typeof v === "string" && BACK_KEY.test(key) && /^\s*[→←]|[→←]\s*$/.test(v) && !EXEMPT_KEYS.has(key)) out.push(`${key}: ${v}`);
  }
  return out;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!full.endsWith(`${path.sep}ui`)) walk(full, out); }
    else if (/\.(jsx|js)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) out.push(full);
  }
  return out;
}

describe("MEH-3060 — back links are <BackLink>", () => {
  it("self-test: hand-rolled shapes red, BackLink and buttons don't", () => {
    // anchored to the pre-MEH-3060 admin/producers/new/page.js:24 shape
    const before = 'const X = () => <Link href="/admin?tab=producers" className="text-sm text-muted">{t("common.back")}</Link>;';
    expect(handRolledBackLinks(before)).toEqual(["Link(common.back)@1"]);
    expect(handRolledBackLinks('const X = () => <a href="/">{t("back_to_list")}</a>;')).toEqual(["a(back_to_list)@1"]);
    expect(handRolledBackLinks('const X = () => <BackLink href="/" label={t("back")} />;')).toEqual([]);
    expect(handRolledBackLinks('const X = () => <button onClick={f}>{t("back")}</button>;')).toEqual([]);
    // an action-styled link (RegisterClient email_sent «חזרה לדף הראשי») is an action, not a back link
    expect(handRolledBackLinks('const X = () => <Link href="/" className="block border-2 border-primary-dark text-primary-dark">{t("back_home")}</Link>;')).toEqual([]);
    expect(handRolledBackLinks('const X = () => <Link href="/">{t("background_title")}</Link>;')).toEqual([]);
    expect(arrowedBackLabels({ recipes: { edit: { back: "→ חזרה למתכונים" } } })).toEqual(["recipes.edit.back: → חזרה למתכונים"]);
    expect(arrowedBackLabels({ recipes: { edit: { back: "חזרה למתכונים" } } })).toEqual([]);
  });

  it("no hand-rolled back link in app/ or components/", () => {
    const files = ["app", "components"].flatMap((d) => walk(path.join(ROOT, d)));
    expect(files.length, "corpus control").toBeGreaterThan(200);
    const offenders = [];
    for (const f of files) {
      const rel = path.relative(ROOT, f).split(path.sep).join("/");
      if (EXEMPT_FILES.has(rel)) continue;
      const hits = handRolledBackLinks(fs.readFileSync(f, "utf8"));
      if (hits.length) offenders.push(`${rel}: ${hits.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  }, 60_000);

  it("no back label carries a typed arrow (BackLink draws it)", () => {
    for (const lang of ["he", "en"]) {
      const messages = JSON.parse(fs.readFileSync(path.join(ROOT, "messages", `${lang}.json`), "utf8"));
      expect(arrowedBackLabels(messages), lang).toEqual([]);
    }
  });
});
