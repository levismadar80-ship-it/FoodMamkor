/**
 * MEH-1748 — one mechanism for response schemas.
 *
 * lib/api-responses.js takes every schema from lib/generated/api.zod.js. A
 * hand-written field list there is how fields were stripped seven times
 * (MEH-826 … MEH-1719), so this file fails if one comes back, if the old
 * hand-written lib/api-schemas.js comes back, or if anything imports it. It
 * also holds the screen-level checks the module adds on top of the generated
 * schemas, because those are the only lines in it that are not generated.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as R from "@/lib/api-responses";

const ROOT = path.resolve(__dirname, "..");
const SOURCE = fs.readFileSync(path.join(ROOT, "lib/api-responses.js"), "utf8");
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("lib/api-responses.js declares no response field", () => {
  it("builds no object schema of its own", () => {
    expect(CODE).not.toMatch(/\bzod\.(object|looseObject|strictObject)\(/);
    expect(CODE).not.toMatch(/\bz\.object\(/);
  });

  it("imports zod/mini and the generated schemas only", () => {
    const imports = [...CODE.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]).sort();
    expect(imports).toEqual(["@/lib/generated/api.zod", "zod/mini"]);
  });

  // Discrimination: the regex above must catch the shape it bans.
  it("self-test: the ban matches a hand-written object", () => {
    expect('export const X = zod.object({ id: zod.string() });').toMatch(
      /\bzod\.(object|looseObject|strictObject)\(/,
    );
  });
});

describe("the hand-written module is gone", () => {
  const SCAN = ["app", "components", "lib", "e2e", "__tests__"];
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === "node_modules" ? [] : walk(p);
      return /\.(js|jsx|ts|tsx|mjs)$/.test(e.name) ? [p] : [];
    });
  const files = SCAN.flatMap((d) => walk(path.join(ROOT, d)));

  it("scans real files (control)", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.endsWith(path.join("lib", "api-responses.js")))).toBe(true);
  });

  it("lib/api-schemas.js does not exist", () => {
    expect(fs.existsSync(path.join(ROOT, "lib/api-schemas.js"))).toBe(false);
  });

  it("nothing imports it", () => {
    const importers = files.filter((f) =>
      /from\s+["'][^"']*\/api-schemas(\.js)?["']/.test(fs.readFileSync(f, "utf8")),
    );
    expect(importers).toEqual([]);
  });
});

describe("screen-level checks on top of the generated schemas", () => {
  const HOUR_LATER = "2026-12-01T10:00:00+00:00";

  it.each([
    ["ReviewInviteLinkSchema", { url: "https://mehamakor.co.il/p/x?rt=1" }, { url: "not a url" }],
    ["ProducerClaimLinkSchema", { url: "https://x.co/claim", expires_at: HOUR_LATER }, { url: "", expires_at: HOUR_LATER }],
    [
      "OwnerInviteCreatedSchema",
      { invite_url: "https://x.co/i", name: "מ", sent_at: HOUR_LATER, expires_at: HOUR_LATER },
      { invite_url: "x", name: "מ", sent_at: HOUR_LATER, expires_at: HOUR_LATER },
    ],
  ])("%s accepts a URL and rejects a non-URL", (name, good, bad) => {
    expect(R[name].safeParse(good).success).toBe(true);
    expect(R[name].safeParse(bad).success).toBe(false);
  });

  it("ProducerClaimPreviewSchema rejects an empty name", () => {
    expect(R.ProducerClaimPreviewSchema.safeParse({ name: "שיקוי" }).success).toBe(true);
    expect(R.ProducerClaimPreviewSchema.safeParse({ name: "  " }).success).toBe(false);
  });

  it("OwnerInvitePublicSchema rejects an empty business name", () => {
    const body = { producer_name: "שיקוי", requires_farmer_declaration: false, will_publish: true };
    expect(R.OwnerInvitePublicSchema.safeParse(body).success).toBe(true);
    expect(R.OwnerInvitePublicSchema.safeParse({ ...body, producer_name: "" }).success).toBe(false);
  });

  it("ProducerAdminCreatedSchema needs the id only", () => {
    const id = "3f1c2a4e-8b7d-4c6a-9e2f-1a2b3c4d5e6f";
    expect(R.ProducerAdminCreatedSchema.parse({ id, name: 1 })).toEqual({ id });
    expect(R.ProducerAdminCreatedSchema.safeParse({}).success).toBe(false);
  });

  it("DraftProductSchema keeps the five fields the panel prints and needs a name", () => {
    const id = "3f1c2a4e-8b7d-4c6a-9e2f-1a2b3c4d5e6f";
    const out = R.DraftProductSchema.parse({ id, name: "לבנה", price_min: "12.00", price_unit: "יח׳", extra: 1 });
    expect(Object.keys(out).sort()).toEqual(["id", "name", "price_min", "price_unit"].sort());
    expect(R.DraftProductSchema.safeParse({ id, name: "" }).success).toBe(false);
  });

  it("the group-buy status must be one of the four", () => {
    expect(R.GroupBuyStatusResultSchema.safeParse({ detail: "ok", status: "funded" }).success).toBe(true);
    expect(R.GroupBuyStatusResultSchema.safeParse({ detail: "ok", status: "won" }).success).toBe(false);
  });

  // The backend serialises naive DB columns with no offset (measured on
  // production GET /producers/{id}, 20/11); orval.config.js allows both.
  it("generated datetimes accept a value with and without a timezone", () => {
    const body = { url: "https://x.co/claim" };
    expect(R.ProducerClaimLinkSchema.safeParse({ ...body, expires_at: "2026-11-11T13:49:10.726940" }).success).toBe(true);
    expect(R.ProducerClaimLinkSchema.safeParse({ ...body, expires_at: "2026-11-11T13:49:10Z" }).success).toBe(true);
    expect(R.ProducerClaimLinkSchema.safeParse({ ...body, expires_at: "next week" }).success).toBe(false);
  });
});

describe("the review share card never prints the reviewer", () => {
  it("ReviewCardCanvas reads no user_name", () => {
    const src = fs.readFileSync(path.join(ROOT, "components/ReviewCardCanvas.jsx"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/user_name/);
    // control: the file is the card, and it does parse the reviews page
    expect(code).toMatch(/ReviewsPageSchema\.safeParse/);
  });
});
