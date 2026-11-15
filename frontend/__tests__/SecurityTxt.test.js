/**
 * MEH-3303 — /.well-known/security.txt (RFC 9116) must exist, name a contact,
 * and carry an Expires that is in the future and less than a year ahead.
 * A lapsed file tells researchers the contact is stale, so this goes red the
 * day it expires. That red blocks CI on purpose: docs/ACCESS.md §9 makes the
 * Thursday scan (expiry-register-check.sh) warn 60 days before, so renew then.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), "public/.well-known/security.txt");

function parseSecurityTxt(text) {
  const fields = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z-]+):\s*(.+)$/);
    if (m) (fields[m[1].toLowerCase()] ||= []).push(m[2].trim());
  }
  return fields;
}

function expiryProblem(fields, now) {
  const raw = fields.expires;
  if (!raw || raw.length !== 1) return "exactly one Expires is required";
  const t = Date.parse(raw[0]);
  if (Number.isNaN(t)) return "Expires is not a date";
  if (t <= now) return "Expires is in the past";
  if (t - now > 366 * 24 * 3600 * 1000) return "Expires is more than a year ahead";
  return null;
}

describe("security.txt (MEH-3303)", () => {
  const fields = parseSecurityTxt(fs.readFileSync(FILE, "utf-8"));

  it("names a mailto contact", () => {
    expect(fields.contact?.[0]).toMatch(/^mailto:\S+@\S+$/);
  });

  it("lists Hebrew and English as preferred languages", () => {
    expect(fields["preferred-languages"]?.[0]).toBe("he, en");
  });

  it("points Canonical at the production URL and Policy at SECURITY.md", () => {
    expect(fields.canonical?.[0]).toBe(
      "https://mehamakor.co.il/.well-known/security.txt",
    );
    expect(fields.policy?.[0]).toMatch(/SECURITY\.md$/);
    expect(fs.existsSync(path.join(process.cwd(), "../SECURITY.md"))).toBe(true);
  });

  it("has an Expires in the future and less than a year ahead", () => {
    expect(expiryProblem(fields, Date.now())).toBeNull();
  });

  it("control: the expiry check goes red on a lapsed or too-far date", () => {
    const now = Date.parse("2026-11-15T00:00:00Z");
    expect(expiryProblem({ expires: ["2026-11-01T00:00:00Z"] }, now)).toMatch(/past/);
    expect(expiryProblem({ expires: ["2028-11-15T00:00:00Z"] }, now)).toMatch(/year/);
    expect(expiryProblem({}, now)).toMatch(/exactly one/);
    expect(expiryProblem({ expires: ["2027-06-01T00:00:00Z"] }, now)).toBeNull();
  });
});
