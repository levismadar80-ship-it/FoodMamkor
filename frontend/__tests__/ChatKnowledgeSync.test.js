// The assistant's list of business tools is generated from the registry
// (lib/chat-knowledge.js). This fails when the committed copy the backend
// reads is stale, so a new tool cannot ship without reaching the assistant.
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("@/lib/api", () => ({ default: {} }));

import he from "../messages/he.json";
import { buildChatBusinessFeatures } from "../lib/chat-knowledge";

const FILE = path.resolve(__dirname, "../../backend/app/data/chat_business_features.json");

describe("chat business-features knowledge", () => {
  it("backend copy equals what the registry and he.json produce", () => {
    const expected = JSON.stringify(buildChatBusinessFeatures(he), null, 2) + "\n";
    if (process.env.WRITE_CHAT_KNOWLEDGE) fs.writeFileSync(FILE, expected);
    expect(fs.readFileSync(FILE, "utf8")).toBe(expected);
  });

  it("carries every live tool, each with a label", () => {
    const out = buildChatBusinessFeatures(he);
    const ids = out.groups.flatMap((g) => g.items.map((i) => i.id));
    expect(ids.length).toBeGreaterThan(40);
    expect(ids).toContain("product_orders");
    for (const g of out.groups) for (const i of g.items) expect(i.label.length).toBeGreaterThan(3);
  });
});
