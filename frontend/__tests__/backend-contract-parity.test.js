/**
 * MEH-1891 — every field the backend serves has a Zod counterpart.
 *
 * This is the frontend half of a two-part guard. The backend half
 * (`tests/test_producer_contract_snapshot.py`) writes the field names of
 * `ProducerListOut` and `ProducerDetailOut` (classes in
 * `backend/app/schemas/schemas.py` — grep the names; their line numbers moved
 * twice on 2026-08-03 alone) to a committed JSON file and fails if that file is
 * stale. This test reads the same file and asserts `lib/schemas.js` declares
 * every key in it.
 *
 * Both halves ride CI legs that already exist — "Backend tests (pytest)" and
 * "Frontend unit tests (vitest)", both under `CI gate (required)`. No
 * `.github/workflows/**` change was needed or made (CC-deny, MEH-671).
 *
 * ── DIRECTION: backend ⊆ frontend, enforced ONE WAY. ────────────────────────
 * A backend field with no Zod counterpart is RED. The reverse is deliberately
 * NOT enforced: the frontend may legitimately declare a field the API has not
 * shipped yet (feature prep), or one removed server-side and awaiting cleanup.
 * Enforcing both directions would turn every forward declaration red and create
 * pressure to delete declarations rather than fix contracts — and the direction
 * that actually produces a user-visible bug is backend→frontend, because
 * `z.object` STRIPS what it does not declare. That is the mechanism behind all
 * seven recurrences (MEH-826, 901, 902, 766 ch5, 1412, 1704, 1719).
 *
 * ── THE BASELINE, AND WHY IT EXISTS ────────────────────────────────────────
 * Re-measured on 04/08/2026: the backend serves 65 list fields and 81 detail
 * fields; `lib/schemas.js` declares 48 and 52. So 17 list and 29 detail fields
 * are undeclared TODAY. That is not news — it is exactly defects D1 and D2 in
 * `docs/audits/producer-schema-call-sites.md` §5, reported there and knowingly
 * left in place. (The 03/08 reading was 64/81 served and 47/51 declared, 17
 * list and 30 detail undeclared; MEH-1880 added `order_window` to the list
 * contract AND declared it, which is why the served count rose while the
 * undeclared counts did not.)
 *
 * A guard that reds on all 47 of them from its first commit is a guard nobody
 * can merge, so the pre-existing gap is baselined below and NEW drift is what
 * fails. Two things keep that from rotting into a permanent excuse:
 *   - a baselined field that HAS since been declared fails the test, so the
 *     list can only shrink (it can never silently carry a stale entry);
 *   - a baselined field the backend no longer serves also fails, so the list
 *     cannot describe a contract that stopped existing.
 * Closing the baseline out entirely means declaring those fields in
 * `lib/schemas.js`, which changes what five parse sites receive — a behaviour
 * change, and a separate ticket. This ticket only OBSERVES lib/schemas.js.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ProducerListSchema, ProducerDetailSchema } from "@/lib/schemas";

const REGEN_COMMAND =
  "UPDATE_CONTRACT_SNAPSHOT=1 pytest tests/test_producer_contract_snapshot.py";

// Anchored to THIS FILE, not to process.cwd(): the path must resolve the same
// whether vitest is invoked from frontend/, from the repo root, or by a config
// that sets its own root. A cwd-relative path would fail with an opaque ENOENT
// in exactly the setups nobody tests locally.
const HERE = path.dirname(fileURLToPath(import.meta.url)); // <repo>/frontend/__tests__
const SNAPSHOT_PATH = path.resolve(
  HERE,
  "..",
  "..",
  "backend",
  "app",
  "schemas",
  "producer_contract_snapshot.json",
);

/**
 * Load the snapshot, rethrowing with the regenerate command attached.
 *
 * To be precise about what this does and does not change: the read STILL
 * happens at module load, and a missing snapshot STILL fails the whole file.
 * What changes is only the message — a bare `readFileSync` reports `ENOENT`
 * with a path and nothing else, which tells a developer nothing about how to
 * fix it. Here they get the path AND the regenerate command.
 *
 * Deferring into a `beforeAll` would genuinely avoid the load-time throw, and
 * it was rejected: the per-contract `describe.each` below needs the key sets at
 * COLLECTION time, so deferring would collapse six named assertions into one
 * opaque test. Better message, same timing, was the trade.
 */
function loadSnapshot() {
  try {
    return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
  } catch (err) {
    throw new Error(
      `Could not read the contract snapshot at ${SNAPSHOT_PATH}: ${err.message}\n` +
        `Regenerate it: ${REGEN_COMMAND}`,
    );
  }
}

const snapshot = loadSnapshot();

/**
 * Backend fields with no Zod declaration as of 03/08/2026 — audit D1 (list)
 * and D2 (detail). NOT an approval: a to-do with a mechanical shape.
 *
 * To remove an entry: declare the field in `lib/schemas.js`, then delete the
 * line here. Doing only the first half fails "the baseline carries no stale
 * entries" below, so the two cannot drift apart.
 *
 * NEVER add to this list to make a red build green. A new backend field with no
 * Zod counterpart is precisely the bug this file exists to catch; baselining it
 * is disarming the guard, not satisfying it.
 */
const KNOWN_UNDECLARED = {
  // D1 — served by ProducerListOut, stripped on all five list parse sites.
  ProducerListOut: [
    "ambassador",
    "delivery_cities",
    "delivery_excluded_cities",
    "delivery_fee",
    "delivery_nationwide",
    "description",
    "free_delivery_above",
    "gluten_free_facility",
    "kashrut_certs",
    "lactose_free_facility",
    "organic_certified",
    "phone_verified",
    "pickup_points",
    "status",
    "vacation_until",
    "vegan_scope",
    "vegetarian_scope",
  ],
  // D2 — the 17 above (inherited) plus the 13 detail-only fields the Zod
  // detail schema does not declare. Six of these ARE rendered by the producer
  // page today (`established_year` ProducerHeader.jsx:241, `products`
  // ProducerSections.jsx:112, `contact_name` + `owner_bio` OwnerCard.jsx:31/:35,
  // `whatsapp_group` + `order_window` ContactCard.jsx:125/:252) — they survive
  // only because that route does not run a stripping parse. See MEH-1888.
  ProducerDetailOut: [
    "ambassador",
    "contact_name",
    "created_at",
    "custom_questions",
    "delivery_cities",
    "delivery_excluded_cities",
    "delivery_fee",
    "delivery_nationwide",
    "description",
    "established_year",
    "free_delivery_above",
    "gluten_free_facility",
    "google_place_id",
    "kashrut_certs",
    "lactose_free_facility",
    // MEH-1880 removed `order_window` from this baseline — not by baselining a
    // new gap away, but the other direction: the field moved onto
    // ProducerListOut and is now DECLARED on ProducerListSchema, which
    // ProducerDetailSchema extends. Leaving it here would fail "the baseline
    // carries no stale entries", which is exactly the check that keeps this
    // list shrinking.
    "organic_certified",
    "owner_bio",
    "owner_photo_url",
    "phone_verified",
    "pickup_points",
    "products",
    "report_count",
    "status",
    "story_card_url",
    "updated_at",
    "vacation_until",
    "vegan_scope",
    "vegetarian_scope",
    "whatsapp_group",
  ],
};

const PAIRS = [
  { backend: "ProducerListOut", zodName: "ProducerListSchema", zod: ProducerListSchema },
  { backend: "ProducerDetailOut", zodName: "ProducerDetailSchema", zod: ProducerDetailSchema },
];

describe("MEH-1891 — Pydantic → Zod parity", () => {
  it("the snapshot file is present and shaped as expected", () => {
    expect(Array.isArray(snapshot.ProducerListOut)).toBe(true);
    expect(Array.isArray(snapshot.ProducerDetailOut)).toBe(true);
    expect(snapshot.ProducerListOut.length).toBeGreaterThan(0);
    // The header is what tells the next reader not to hand-edit the file.
    expect(String(snapshot._README)).toMatch(/GENERATED FILE/);
  });

  describe.each(PAIRS)("$backend → $zodName", ({ backend, zodName, zod }) => {
    const backendKeys = snapshot[backend];
    const zodKeys = new Set(Object.keys(zod.shape));
    // `?? []` + the explicit assertion below: adding a pair without a matching
    // KNOWN_UNDECLARED key would otherwise throw `baseline.includes is not a
    // function` from inside an assertion, which reads as a broken test rather
    // than as the misconfiguration it is. An empty baseline is also the SAFE
    // default — it enforces more, never less.
    const baseline = KNOWN_UNDECLARED[backend] ?? [];

    it(`${backend} has a baseline entry (even an empty one)`, () => {
      expect(
        Object.hasOwn(KNOWN_UNDECLARED, backend),
        `PAIRS lists ${backend} but KNOWN_UNDECLARED has no key for it. Add one — ` +
          "`[]` if the Zod schema already declares every field.",
      ).toBe(true);
    });

    it(`every ${backend} field is declared on ${zodName} (or explicitly baselined)`, () => {
      const missing = backendKeys.filter(
        (k) => !zodKeys.has(k) && !baseline.includes(k),
      );
      expect(
        missing,
        `${backend} serves ${missing.length} field(s) that ${zodName} does not declare. ` +
          "z.object strips undeclared keys, so these vanish silently wherever this schema " +
          "is parsed. Declare them in lib/schemas.js — do NOT add them to KNOWN_UNDECLARED.",
      ).toEqual([]);
    });

    it("the baseline carries no stale entries — every baselined field is still undeclared", () => {
      const nowDeclared = baseline.filter((k) => zodKeys.has(k));
      expect(
        nowDeclared,
        `These are declared on ${zodName} now. Delete them from KNOWN_UNDECLARED ` +
          "so the baseline keeps shrinking instead of quietly outliving the gap.",
      ).toEqual([]);
    });

    it("the baseline describes the live contract — every baselined field is still served", () => {
      const gone = baseline.filter((k) => !backendKeys.includes(k));
      expect(
        gone,
        `${backend} no longer serves these. Delete them from KNOWN_UNDECLARED — a ` +
          "baseline naming fields that do not exist is fiction, not a to-do.",
      ).toEqual([]);
    });
  });
});
